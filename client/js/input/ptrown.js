/* =====================================================================
   POINTER OWNERSHIP — a touch that starts on the UI belongs to the UI.

   Every pointer is claimed the moment it goes down, by whichever layer it
   landed on, and keeps that owner until it is lifted:

     'ui'    a button, a panel, a list, a page, the wallet, the drawer…
     'game'  the in-match touch controls (sticks, FIRE, the power stick)
     'world' the bare 3D view

   Anything that drives the 3D scene — the in-match sticks, the mouse aim,
   any camera control — asks `owns(id, 'game' | 'world')` and ignores the
   pointer otherwise. So a finger that starts scrolling the quest list can
   wander over the 3D view, or over a stick, and still only scroll the list;
   and a second finger is judged by where IT landed, not by the first one.

   The claim is made in the CAPTURE phase on window, before any element's
   own handler runs, so no individual button has to remember to opt out.
   ===================================================================== */

const owner = new Map();          // pointerId → 'ui' | 'game' | 'world'

/** Which layer an element belongs to. */
export function layerOf(el) {
  if (!el || !el.closest) return 'ui';
  if (el.closest('#touch')) return 'game';                  // in-match controls are the game's
  if (el.closest('#view, canvas')) return 'world';          // the bare 3D view
  return 'ui';                                              // everything else is interface
}

let installed = false;
export function installPointerOwnership(root = window) {
  if (installed) return; installed = true;
  root.addEventListener('pointerdown', (e) => { owner.set(e.pointerId, layerOf(e.target)); }, true);
  const drop = (e) => { owner.delete(e.pointerId); };
  root.addEventListener('pointerup', drop, true);
  root.addEventListener('pointercancel', drop, true);
  // a lost capture (the browser took the gesture for a scroll, say) ends the claim too
  root.addEventListener('lostpointercapture', drop, true);
}

/** Who owns this pointer right now ('ui' if it is not being tracked, to be safe). */
export const ownerOf = (id) => owner.get(id) || null;
/** True when the pointer belongs to `layer` — or is unknown and `layer` is allowed to take it. */
export function owns(id, layer) {
  const o = owner.get(id);
  return o === undefined ? true : o === layer;
}
/** For tests and for leaving a screen: forget every claim. */
export function resetPointerOwnership() { owner.clear(); }
