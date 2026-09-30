/* =====================================================================
   QUEST ORDER — what is ready to collect comes first.

   A finished quest used to stay wherever it was in the list, so collecting
   it could mean scrolling to the bottom. Now the order is:

     0  finished, not yet claimed   ← straight to the top
     1  still in progress
     2  already claimed

   and within each group things keep their ORIGINAL order (a stable sort on
   the original index), so the list never shuffles for no reason. Claiming a
   quest simply moves it to group 2: it goes back among the others instead
   of staying pinned at the top. Nothing is stored — the order is worked out
   fresh from the state every time, so the underlying list is never touched.
   ===================================================================== */

/** 0 = ready to claim, 1 = in progress, 2 = claimed. */
export function questRank(q) {
  if (!q) return 1;
  if (q.claimed || q.done) return 2;
  return (q.prog || 0) >= (q.need || Infinity) ? 0 : 1;
}

/**
 * The items in display order. `stateOf(item)` returns {prog, need, claimed|done} for it; by
 * default the item itself is used. Returns a new array — the input is left untouched.
 */
export function questOrder(items, stateOf = (x) => x) {
  return items
    .map((it, i) => ({ it, i, r: questRank(stateOf(it)) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.it);
}
