/* Objective markers: where the arrow goes and which way it points.   node tools/objpoint-test.js
   (placeGuide is the pure maths behind hud.guides — the browser test checks it in real matches.) */
import { placeGuide, niceDist } from '../client/js/ui/objpoint.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const W = 844, H = 390, M = { t: 64, r: 48, b: 48, l: 48 };
// which way does the arrow point? 0° = down (the graphic), so +90 is left, −90 / 270 right, 180 up
const dir = (a) => { a = ((a % 360) + 360) % 360; return a < 45 || a >= 315 ? 'down' : a < 135 ? 'left' : a < 225 ? 'up' : 'right'; };

let g = placeGuide({ x: 400, y: 200, on: true }, W, H, M);
ok(!g.edge && g.x === 400 && g.y === 200, 'on screen: the marker sits on the objective, no arrow');

g = placeGuide({ x: -300, y: 190, on: false }, W, H, M);
ok(g.edge && g.side === 'l' && dir(g.ang) === 'left', `off to the left: arrow on the left edge pointing left (${g.side}, ${g.ang.toFixed(0)}°)`);
g = placeGuide({ x: 1500, y: 210, on: false }, W, H, M);
ok(g.edge && g.side === 'r' && dir(g.ang) === 'right', `off to the right: arrow on the right edge pointing right (${g.side}, ${g.ang.toFixed(0)}°)`);
g = placeGuide({ x: 420, y: -900, on: false }, W, H, M);
ok(g.edge && g.side === 't' && dir(g.ang) === 'up', `far ahead: arrow on the top edge pointing up (${g.side})`);
ok(g.y >= M.t - 0.5, 'and it stays below the score bar margin');

// behind the camera: the projection comes out mirrored through the centre — e.g. an objective behind
// and to the LEFT projects to the upper RIGHT. The arrow must still say "behind, left".
g = placeGuide({ x: 600, y: 60, behind: true }, W, H, M);
ok(g.edge && (g.side === 'b' || g.side === 'l') && g.x < W / 2 && g.y > H / 2, `behind and to the left: arrow low on the left, not upper right (${g.side} at ${g.x.toFixed(0)},${g.y.toFixed(0)})`);
g = placeGuide({ x: 422, y: 195, behind: true }, W, H, M);
ok(g.edge && g.side === 'b' && dir(g.ang) === 'down', 'straight behind: arrow at the bottom, pointing down');
g = placeGuide(null, W, H, M);
ok(g.edge && g.side === 'b', 'no projection at all: still an arrow (at the bottom), never nothing');

// keeping clear of the HUD: the fire button sits in the lower right corner
const fire = { x0: 700, y0: 250, x1: 800, y1: 350 };
g = placeGuide({ x: 2000, y: 1100, on: false }, W, H, M, [fire]);
const inFire = g.x > fire.x0 - 22 && g.x < fire.x1 + 22 && g.y > fire.y0 - 22 && g.y < fire.y1 + 22;
ok(g.edge && !inFire, `an arrow that would land on the fire button slides along the edge until clear (${g.x.toFixed(0)},${g.y.toFixed(0)})`);

// every size and direction: always inside the screen
let inside = true;
for (const [w, h] of [[667, 375], [740, 360], [844, 390], [932, 430], [1366, 768], [2560, 1080]])
  for (let a = 0; a < 360; a += 7.5) for (const behind of [false, true]) {
    const q = placeGuide({ x: w / 2 + Math.cos(a * Math.PI / 180) * 5000, y: h / 2 + Math.sin(a * Math.PI / 180) * 5000, on: false, behind }, w, h, M);
    if (!(q.x >= 0 && q.x <= w && q.y >= 0 && q.y <= h)) inside = false;
  }
ok(inside, 'at every supported size, in every direction, the arrow stays on screen');

ok(niceDist(84.6) === '85m' && niceDist(312) === '310m' && niceDist(null) === '', 'distances read as whole metres (rounded to 5 m when far)');

console.log(fails ? `${fails} FAILED` : 'ALL OBJECTIVE POINTER TESTS PASS');
process.exit(fails ? 1 : 0);
