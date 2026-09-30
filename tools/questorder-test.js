/* Finished-but-unclaimed quests go to the top; claiming sends them back; the order is stable.
     node tools/questorder-test.js */
import { questOrder, questRank } from '../client/shared/questorder.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ids = (l) => l.map((q) => q.id).join('');

const Q = (id, prog, need, claimed = false) => ({ id, prog, need, claimed });
const base = [Q('A', 1, 5), Q('B', 2, 5), Q('C', 0, 5), Q('D', 4, 5), Q('E', 3, 5)];
ok(ids(questOrder(base)) === 'ABCDE', 'nothing finished: the list keeps its own order');

const done = [Q('A', 1, 5), Q('B', 2, 5), Q('C', 0, 5), Q('D', 4, 5), Q('E', 5, 5)];
ok(ids(questOrder(done)) === 'EABCD', 'E finishes and jumps to the top (EABCD)');

const claimed = [Q('A', 1, 5), Q('B', 2, 5), Q('C', 0, 5), Q('D', 4, 5), Q('E', 5, 5, true)];
ok(ids(questOrder(claimed)) === 'ABCDE', 'once E is claimed it goes back among the others, at the end');

const two = [Q('A', 1, 5), Q('B', 5, 5), Q('C', 0, 5), Q('D', 5, 5), Q('E', 3, 5)];
ok(ids(questOrder(two)) === 'BDACE', 'two finished quests keep their order between themselves (BD…)');

const mix = [Q('A', 5, 5, true), Q('B', 5, 5), Q('C', 1, 5), Q('D', 5, 5, true), Q('E', 0, 5)];
ok(ids(questOrder(mix)) === 'BCEAD', 'ready, then in progress, then claimed — each group in its own order');

// the same input always gives the same output
const again = questOrder(two);
ok(ids(again) === ids(questOrder(two)) && ids(again) === ids(questOrder(two.slice())), 'deterministic: same state, same order');
ok(ids(two) === 'ABCDE', 'and the underlying list is never reordered');

// tank quests use `done` instead of `claimed`, and are keyed [id, state]
const tq = [['zagros', { prog: 1, need: 3, done: false }], ['baz', { prog: 3, need: 3, done: false }], ['korek', { prog: 3, need: 3, done: true }]];
ok(questOrder(tq, ([, q]) => q).map(([id]) => id).join(',') === 'baz,zagros,korek', 'tank quests follow the same rule');

ok(questRank(Q('x', 5, 5)) === 0 && questRank(Q('x', 4, 5)) === 1 && questRank(Q('x', 5, 5, true)) === 2, 'ranks: 0 ready, 1 in progress, 2 claimed');

console.log(fails ? `\nFAILED: ${fails}` : '\nALL QUEST ORDER TESTS PASS');
process.exit(fails ? 1 : 0);
