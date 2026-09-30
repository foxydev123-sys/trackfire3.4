/* World chat, inviting from it, and the ranked rank-gap rule — against the real Store and Social
   classes in-process, with fake sockets.   node tools/worldchat-test.js */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { Store } from '../server/store.js';
import { Social, WORLD_MAX, WORLD_KEEP, RANK_GAP } from '../server/social.js';
import { GAME } from '../client/shared/config.js';

let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-wc-'));
const store = new Store(DIR);
const social = new Social({ store, log: () => {}, createRanked: () => 'RANKD', botsAfterS: 999 });
social.stop();

// a fake hub connection: records what the server sends, lets us send requests
let rid = 1;
function connect(acc) {
  const h = { on: {}, inbox: [], closed: false,
    send(d) { h.inbox.push(JSON.parse(d)); }, close() { h.closed = true; if (h.on.close) h.on.close(); } };
  const ws = { on: (ev, fn) => { h.on[ev] = fn; }, send: (d) => h.send(d), close: () => h.close() };
  social.attach(ws);
  h.on.message(JSON.stringify({ t: 'auth', id: acc.id, secret: acc.secret }), false);
  h.req = (o) => { const r = rid++; h.on.message(JSON.stringify({ ...o, rid: r }), false); return h.inbox.find(m => m.rid === r) || null; };
  h.got = (t) => h.inbox.filter(m => m.t === t);
  h.clear = () => { h.inbox.length = 0; };
  return h;
}
const realNow = Date.now; let clock = realNow();
Date.now = () => clock;                 // so the rate limits can be stepped through
const wait = (ms) => { clock += ms; };

const A = store.register('Saw'), B = store.register('Hemin'), C = store.register('Dilan'), D = store.register('Rezan');
const a = connect(A), b = connect(B), c = connect(C), d = connect(D);

console.log('--- sending and receiving');
let r = a.req({ t: 'worldSay', text: 'anyone for ranked?' });
ok(r && r.t === 'ok', 'a message goes out');
ok(b.got('worldMsg').some(m => m.m.text === 'anyone for ranked?' && m.m.name === 'Saw'), 'and everyone online sees it, with the name');
ok(c.got('worldMsg').length === 1 && d.got('worldMsg').length === 1, 'everyone, once');
const m0 = b.got('worldMsg')[0].m;
ok(m0.tag === A.tag && m0.from === A.id && 'rank' in m0, 'it carries the sender\'s tag, id and rank, for the tap menu');

console.log('\n--- length, markup and spam');
wait(3000);
r = a.req({ t: 'worldSay', text: 'x'.repeat(500) });
ok(r.t === 'ok' && b.got('worldMsg').at(-1).m.text.length <= WORLD_MAX, `a long message is cut to ${WORLD_MAX} characters`);
wait(3000);
a.req({ t: 'worldSay', text: '<img src=x onerror=alert(1)>hi' });
ok(b.got('worldMsg').at(-1).m.text.includes('<img'), 'markup arrives as plain text (the client shows it as text, never as HTML)');
wait(3000);
ok(a.req({ t: 'worldSay', text: '   ' }).code === 'empty', 'an empty message is refused');
wait(3000);
a.req({ t: 'worldSay', text: 'team?' });
ok(a.req({ t: 'worldSay', text: 'team? again' }).code === 'slow_down', 'two messages back to back: the second is refused');
wait(3000);
ok(a.req({ t: 'worldSay', text: 'team?' }).code === 'repeat', 'saying the same thing twice in a row is refused');
// five in half a minute is the cap
const E = store.register('Spam'); const e = connect(E);
let sent = 0; for (let i = 0; i < 9; i++) { wait(2600); if (e.req({ t: 'worldSay', text: 'msg ' + i }).t === 'ok') sent++; }
ok(sent === 5, `no more than five messages in half a minute (${sent} of 9 got through)`);
ok(social.world.length <= WORLD_KEEP, 'only the most recent messages are kept');

console.log('\n--- reconnecting');
const d2 = connect(D);
const hist = d2.req({ t: 'worldHistory' });
ok(hist && hist.t === 'worldHistory' && hist.msgs.length > 0 && hist.msgs.length <= WORLD_KEEP, `a player coming back gets the recent chat (${hist.msgs.length})`);
ok(hist.msgs.every((x, i, arr) => i === 0 || arr[i - 1].id < x.id), 'in order');
for (let i = 0; i < WORLD_KEEP + 10; i++) { wait(7000); c.req({ t: 'worldSay', text: 'fill ' + i }); }
ok(social.world.length === WORLD_KEEP, `history never grows past ${WORLD_KEEP}`);

console.log('\n--- blocking');
store.block(D.id, C.id);
d.clear(); wait(7000); c.req({ t: 'worldSay', text: 'can you see me' });
ok(!d.got('worldMsg').length, 'someone who blocked you does not see your messages');
ok(!d2.req({ t: 'worldHistory' }).msgs.some(x => x.from === C.id), 'nor your old ones in the history');

console.log('\n--- from a chat message to a squad');
// Saw posted "anyone for ranked?" — Hemin is not his friend but may invite him
wait(3000); a.req({ t: 'worldSay', text: 'need 2 players' });
b.clear(); a.clear();
r = b.req({ t: 'partyInvite', to: A.id });
ok(r.t === 'ok', 'a stranger who has been posting in world chat can be invited');
ok(a.got('partyInvite').some(x => x.from.id === B.id), 'and gets the invitation');
ok(a.req({ t: 'partyAccept', leader: B.id }).t === 'ok', 'and can join');
// someone who has not posted cannot be pulled in by a stranger
const F = store.register('Quiet'); const f = connect(F);
ok(b.req({ t: 'partyInvite', to: F.id }).code === 'not_friends', 'a stranger who has not posted cannot be invited out of nowhere');
// a friend request by name#tag works from the chat too
r = c.req({ t: 'friendReq', to: `${A.name}#${A.tag}` });
ok(r.t === 'ok', 'a friend request can be sent straight from a chat message');
ok(a.got('friendReq').length >= 1, 'and arrives');
// a block still wins over everything
store.block(A.id, D.id);
ok(d.req({ t: 'partyInvite', to: A.id }).code === 'blocked', 'nobody can invite someone who blocked them');

console.log('\n--- rank difference for Ranked');
const R0 = GAME.RANKED;
const setRank = (acc, rp) => { store.db.prepare('UPDATE accounts SET rp = ?, placed = ? WHERE id = ?').run(rp, R0.PLACEMENT, acc.id); };
const L1 = store.register('Low'), H1 = store.register('High'), M1 = store.register('Mid');
setRank(L1, 150); setRank(H1, 1300); setRank(M1, 450);
const l1 = connect(L1), h1 = connect(H1), m1 = connect(M1);
for (const [x, y, xh, yh] of [[L1, H1, l1, h1], [L1, M1, l1, m1]]) { store.friendRequest ? store.friendRequest(x.id, `${y.name}#${y.tag}`) : xh.req({ t: 'friendReq', to: `${y.name}#${y.tag}` }); yh.req({ t: 'friendAccept', id: x.id }); }
r = l1.req({ t: 'partyInvite', to: H1.id });
ok(r.t === 'ok' && r.rankWarn === 1, `Bronze and Diamond can still squad up for other modes, with a warning (${r.gap} RP apart)`);
h1.req({ t: 'partyAccept', leader: L1.id });
r = l1.req({ t: 'queue' });
ok(r.code === 'rank_gap', 'but the SERVER refuses to queue them for Ranked together');
l1.req({ t: 'partyKick', id: H1.id });
r = l1.req({ t: 'partyInvite', to: M1.id });
ok(r.t === 'ok' && !r.rankWarn, `a player within ${RANK_GAP} RP is fine (${Math.abs(450 - 150)} RP apart)`);
m1.req({ t: 'partyAccept', leader: L1.id });
r = l1.req({ t: 'queue' });
ok(r.t === 'ok', 'and they can queue for Ranked together');
l1.req({ t: 'unqueue' });

Date.now = realNow;
fs.rmSync(DIR, { recursive: true, force: true });
console.log(fails ? `\nFAILED: ${fails}` : '\nALL WORLD CHAT TESTS PASS');
process.exit(fails ? 1 : 0);
