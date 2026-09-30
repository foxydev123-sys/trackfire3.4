/* =====================================================================
   NOTIFICATION DOTS — one small registry, driven by data.

   Every source of "something is waiting for you" reports a COUNT for a key:

     setDot('quests', 2)      two quests can be claimed
     setDot('friends', 1)     a friend request, or an unread message
     setDot('daily', true)    today's reward has not been collected

   A key's badge is the `<b class="badge-n">` inside the button that owns it
   (see BADGE below). The counts are always DERIVED from real state — a quest
   that can be claimed, a request not yet answered — never from "was the menu
   opened", so a dot stays until the thing itself is dealt with.

   The corner menu gets a dot of its own whenever any badged button lives
   INSIDE the drawer. That is decided by where the button actually is in the
   page, not by a list here, so moving a button in or out of the drawer is all
   it takes to change which dots roll up into the corner.
   ===================================================================== */

// key → the id of the badge element that shows it
const BADGE = {
  shop: 'bgShop', quests: 'bgQuests', goals: 'bgGoals', friends: 'frBadge',
  daily: 'bgDaily', wheel: 'bgWheel', garage: 'bgGarage', chat: 'bgChat',
};
const counts = new Map();

const $ = (id) => document.getElementById(id);

/** Report how many things are waiting under `key` (0 / false clears it; true is a plain dot). */
export function setDot(key, n) {
  const v = n === true ? true : Math.max(0, Number(n) || 0);
  counts.set(key, v);
  const b = $(BADGE[key]);
  if (b) {
    b.hidden = !v;
    b.textContent = v === true ? '' : (v > 9 ? '9+' : String(v || ''));
    b.classList.toggle('pip', v === true);          // a bare dot, no number
  }
  refreshCorner();
}
/** What a key is currently showing (for tests and for other UI that wants to know). */
export const dotOf = (key) => counts.get(key) || 0;

/** Light the corner menu when anything tucked inside it is waiting. */
export function refreshCorner() {
  const dot = $('moreDot'), drawer = $('mnDrawer');
  if (!dot || !drawer) return;
  let any = false;
  for (const [key, v] of counts) {
    if (!v) continue;
    const b = $(BADGE[key]);
    if (b && drawer.contains(b)) { any = true; break; }
  }
  dot.hidden = !any;
}
