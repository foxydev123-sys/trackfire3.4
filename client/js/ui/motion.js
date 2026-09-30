/* =====================================================================
   MOTION — the one place UI movement is decided.

   Every piece of feedback in the menus comes from here, so it all moves
   the same way and nothing is invented twice:

     tier      time         used for
     FAST      80–150 ms    a button going down and coming back
     NORMAL    180–300 ms   panels, cards, counters settling
     REWARD    300–800 ms   a reward appearing, coins flying home
     BIG       1–2 s        a chest opening, a new tank

   Rules it keeps:
   - Motion answers something the player did or something that just
     happened. Nothing moves on its own while you are not touching it.
   - Almost all of it is CSS classes (compositor-only transform/opacity),
     restarted by `play()`. No per-frame JavaScript loops for idle UI.
   - LOW quality or "reduce motion" in the phone's settings: fewer pieces
     and no glow — but the feedback itself (the pop, the count, the sound)
     always stays.
   - Motion never decides anything. The server has already answered by
     the time any of this runs; it only shows what the server said.
   ===================================================================== */
import { settings } from '../settings.js';

export const DUR = { fast: 120, normal: 240, reward: 600, big: 1500 };
export const EASE = {
  out: 'cubic-bezier(.2,.8,.3,1)',          // arrives quickly, settles softly
  back: 'cubic-bezier(.34,1.56,.64,1)',      // a small overshoot — for the few things that should land with a bump
  inOut: 'cubic-bezier(.45,0,.55,1)',
};

/** True on LOW quality or when the phone asks for less motion: fewer pieces, no glow. */
export function lowMotion() {
  if (settings.quality === 'low') return true;
  try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}

/**
 * Restart a one-shot CSS animation on `el`: remove the class, force a reflow, add it back, and
 * take it off again when it ends so the element is left exactly as it was.
 */
export function play(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;                       // one reflow per call, only on user actions
  el.classList.add(cls);
  const done = (e) => { if (e.target !== el) return; el.classList.remove(cls); el.removeEventListener('animationend', done); };
  el.addEventListener('animationend', done);
  // belt and braces: never leave a class on if the animation was skipped (hidden element, reduce motion)
  setTimeout(() => el.classList.remove(cls), 1600);
}
export const pop = (el) => play(el, 'm-pop');          // a small, satisfying swell and settle
export const shake = (el) => play(el, 'm-shake');      // "no" — quick, side to side
export const pulse = (el) => play(el, 'm-pulse');      // "look here" — one soft ring, once
export const enter = (el) => play(el, 'm-enter');      // arrives: fade + slight rise

/** Light vibration where the phone supports it and the player has not switched it off. Never required. */
const BUZZ = { tap: 8, reward: 14, buy: 16, big: [16, 50, 26], poor: [10, 40, 10] };
export function haptic(kind) {
  if (settings.haptics === false) return;
  try { if (navigator.vibrate) navigator.vibrate(BUZZ[kind] || 10); } catch (e) { /* not supported: nothing */ }
}

/** Wait `ms` — but a tap on the chest screen can cut the wait short (see skippable). */
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A sequence the player can hurry along: every `step(ms)` waits, unless the player has tapped,
 * in which case the waits shrink to almost nothing. The steps still happen in order — tapping
 * speeds the show up, it never skips what it shows.
 */
export class Skippable {
  constructor() { this.fast = false; this.gone = false; }
  hurry() { this.fast = true; }
  step(ms) { return this.gone ? Promise.resolve() : wait(this.fast ? Math.min(ms, 60) : ms); }
  stop() { this.gone = true; }
}
