/* Small natural props give way to tanks; buildings, walls and cover never do. The server decides,
   says so once, and a player who joins late is told what is already down.
     node tools/crush-test.js */
import { Room } from '../client/shared/room.js';
import { NET, GAME } from '../client/shared/config.js';
import { getMap, CRUSHABLE } from '../client/shared/maps.js';
import { encodeInput } from '../client/shared/protocol.js';
import { MODE_DIR } from '../client/shared/sim.js';
import { tankStats } from '../client/shared/tanks.js';

let t = 0; const now = () => t;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const conn = (log) => ({ send: (d) => { if (typeof d === 'string') log.push(JSON.parse(d)); }, close() {}, congested: () => false });

// ---- 1. what is and is not crushable, straight from the map data
console.log('--- which props give way');
const NEVER = ['building', 'citadel', 'cabin', 'mesa', 'swall', 'ruin', 'wreck', 'wreckcar', 'jersey', 'tower', 'arcade', 'car', 'bags', 'nest', 'hedgehog'];
for (const id of ['hawler', 'desert', 'forest', 'stadium']) {
  const M = getMap(id);
  // colliders built by colRect/colLine have no kind: find which object each belongs to by position
  const solidNear = (k) => M.objects.filter(o => o.k === k).some(o => M.colliders.some(c => c.crush && Math.hypot(c.x - o.x, c.z - o.z) < 1e-6 && c.k === k));
  const bad = NEVER.filter(solidNear);
  ok(!bad.length, `${id}: no building, wall, mesa or cover can be crushed${bad.length ? ' -> ' + bad : ''}`);
  const cr = M.colliders.filter(c => c.crush);
  ok(cr.every(c => c.soft), `${id}: every crushable prop is soft, so no tank is stopped by one (${cr.length})`);
  ok(cr.every(c => CRUSHABLE[c.k] || c.k === 'rock'), `${id}: and each one is a natural prop`);
}
{
  const M = getMap('desert');
  const cover = M.objects.filter(o => o.k === 'rock' && (o.cover || o.mesa));
  ok(cover.length > 0 && cover.every(o => !o.crush), `desert: the placed cover and mesa rocks stay solid (${cover.length})`);
  const boulders = M.objects.filter(o => o.k === 'rock' && o.s >= 1.9);
  ok(boulders.every(o => !o.crush), `desert: boulders stay solid (${boulders.length})`);
  ok(M.objects.some(o => o.k === 'rock' && o.crush), 'desert: middling rocks can be crushed');
}
{
  const M = getMap('forest');
  const trees = M.colliders.filter(c => c.k === 'pine' || c.k === 'leafy');
  ok(trees.length > 100 && trees.every(c => c.crush), `forest: the big trees can be driven through (${trees.length})`);
  ok(trees.every(c => c.hp >= 4), 'forest: but a single shell still does not fell one — the woods are still cover');
}

// ---- 2. a real room: drive into a tree and through it
console.log('\n--- a tank driving into a tree');
function room(map) {
  const log = [];
  const R = new Room('CR' + Math.random().toString(36).slice(2, 5).toUpperCase(), { now });
  const a = R.join(conn(log), 'Alice', 'ka'), b = R.join(conn(log), 'Bob', 'kb');
  R.onJSON(a, { t: 'map', map }); R.start();
  a.tank = tankStats('zagros', {}); b.tank = tankStats('zagros', {});
  R.spawn(a); R.spawn(b);
  const T = (n, fn) => { for (let i = 0; i < n; i++) { t += 1000 / NET.TICK_RATE; if (fn) fn(i); R.update(); } };
  const drive = (p, dir) => { R.onBinary(p, new Uint8Array(encodeInput({ seq: (p.lastQueued || 0) + 1, mode: MODE_DIR, dir, mag: 1, throttle: 0, steer: 0, aim: 0, fire: false, ab: false }))); p.starving = false; };
  return { R, a, b, T, drive, log };
}
{
  const { R, a, b, T, drive, log } = room('forest');
  const tree = R.map.colliders.find(c => c.k === 'pine' && Math.hypot(c.x, c.z) < 55);
  ok(!!tree, 'found a pine to drive at');
  // park Bob far away; line Alice up 7 m short of the tree, facing it
  b.s.x = -70; b.s.z = -70;
  const dir = 0;                                     // +z
  a.s.x = tree.x; a.s.z = tree.z - 7; a.s.yaw = dir; a.s.v = 0; a.s.shield = 0;
  const z0 = a.s.z;
  T(45, () => { drive(a, dir); b.starving = false; });
  ok(R.map.dead[tree.i] === 1, 'the tree is down');
  const brk = log.filter(m => m.t === 'brk' && m.i === tree.i);
  ok(brk.length >= 1, 'and every player is told, with one event');
  ok(new Set(log.filter(m => m.t === 'brk' && m.i === tree.i).map(m => m.i)).size === 1, 'it is not re-announced');
  ok(a.s.z > tree.z + 1, `the tank carried on through where it stood (${z0.toFixed(1)} → ${a.s.z.toFixed(1)}, tree at ${tree.z.toFixed(1)})`);
  // someone joining now is told it is already down
  const info = R.roomInfo ? R.roomInfo() : null;
  ok(info && (info.broken || []).includes(tree.i), 'a player who joins late is told it is already gone');
}
{
  // a building never gives: drive at one and stay outside it
  const { R, a, b, T, drive } = room('hawler');
  const M = R.map;
  const bld = M.objects.find(o => o.k === 'building' && Math.hypot(o.x, o.z) < 60);
  ok(!!bld, 'found a building to drive at');
  b.s.x = -70; b.s.z = -70;
  a.s.x = bld.x; a.s.z = bld.z - (bld.d || 8) / 2 - 7; a.s.yaw = 0; a.s.v = 0; a.s.shield = 0;
  const deadBefore = M.dead.reduce((n, v) => n + v, 0);
  T(60, () => { drive(a, 0); });
  ok(M.dead.reduce((n, v) => n + v, 0) === deadBefore, 'driving into a building breaks nothing');
  ok(a.s.z < bld.z, `and the tank stops outside it (${a.s.z.toFixed(1)} vs wall at ${(bld.z - (bld.d || 8) / 2).toFixed(1)})`);
}

// (debris settling is checked in the browser: tools/browser-test24.py)

console.log(fails ? `\nFAILED: ${fails}` : '\nALL CRUSH TESTS PASS');
process.exit(fails ? 1 : 0);
