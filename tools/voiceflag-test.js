/* Voice chat is switched off for release by a feature switch — this checks the switch really works
   on the server side, and that turning it back on restores voice exactly as before.

     node tools/voiceflag-test.js

   While FEATURES.VOICE_ENABLED is false the room passes on no voice call set-up ('rtc') and no
   mic state ('vc'), so no voice connection can ever be made even by a modified client; the
   /api/info the clients read says voice is off. With the switch on, both are relayed again. */
import { Room } from '../client/shared/room.js';
import { FEATURES } from '../client/shared/config.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// --- the room, with a fake clock and two human players who record what they are sent
let T = 0; const now = () => T;
function twoPlayers() {
  const room = new Room('VC', { now, kind: 'private' });
  const got = { a: [], b: [] };
  const conn = (k) => ({ send(d) { if (typeof d === 'string') got[k].push(JSON.parse(d)); }, close() {} });
  const a = room.join(conn('a'), 'Aa', 'ta'), b = room.join(conn('b'), 'Bb', 'tb');
  got.a.length = 0; got.b.length = 0;
  return { room, a, b, got };
}

ok(FEATURES.VOICE_ENABLED === false, 'voice chat is switched OFF for this release (FEATURES.VOICE_ENABLED = false)');

{
  const { room, a, b, got } = twoPlayers();
  room.onJSON(a, { t: 'rtc', to: b.id, sdp: 'offer', kind: 'offer' });
  room.onJSON(a, { t: 'vc', on: true, talk: true });
  ok(!got.b.some((m) => m.t === 'rtc'), 'switched off: a voice call offer is NOT passed on to the other player');
  ok(![...got.a, ...got.b].some((m) => m.t === 'vc'), 'switched off: "my mic is on" is NOT broadcast');
}

FEATURES.VOICE_ENABLED = true;
{
  const { room, a, b, got } = twoPlayers();
  room.onJSON(a, { t: 'rtc', to: b.id, sdp: 'offer', kind: 'offer' });
  room.onJSON(a, { t: 'vc', on: true, talk: true });
  ok(got.b.some((m) => m.t === 'rtc' && m.from === a.id), 'switched back on: the call offer reaches the other player again');
  ok(got.b.some((m) => m.t === 'vc' && m.id === a.id && m.on), 'switched back on: mic state is broadcast again');
}
FEATURES.VOICE_ENABLED = false;

// --- what the server tells clients, with and without the VOICE_ENABLED override
async function info(env) {
  const PORT = 8600 + Math.floor(Math.random() * 90);
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-vc-'));
  const srv = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ...env }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      try { const r = await fetch(`http://localhost:${PORT}/api/info`); if (r.ok) return await r.json(); } catch (e) { /* not up yet */ }
    }
    return null;
  } finally { srv.kill(); }
}
const off = await info({});
ok(off && off.features && off.features.voice === false, 'the server tells clients voice is OFF by default');
const on = await info({ VOICE_ENABLED: '1' });
ok(on && on.features && on.features.voice === true, 'VOICE_ENABLED=1 on the server switches it back on for everyone');

console.log(fails ? `${fails} FAILED` : 'ALL VOICE SWITCH TESTS PASS');
process.exit(fails ? 1 : 0);
