/* =====================================================================
   THE WALLET COUNTERS — what the three pills at the top SHOW, kept apart
   from what the wallet actually HOLDS.

   The server is the only one who changes the wallet. When it does, the
   pills do not jump: they count. And while a reward is being shown (a
   quest paid out, a chest opened) the pills wait for the coins to fly home
   and count up as they land, instead of changing the moment the server's
   message arrives.

     view.set(wallet)          the server's numbers (always the truth)
     view.hold()               a reward or purchase is being shown: wait
     view.fly(kind, from, n)   send a few tokens from an element to its pill;
                               the pill counts up as they land
     view.spend(kind, n)       a price paid: the pill dips and counts down
     view.poor(kinds)          not enough: the pill shakes, nothing changes
     view.release()            done: settle on the real numbers

   Whatever happens — screens change, a modal closes early, a message is
   lost — the shown number always ends on the real one: release() goes to
   the truth, and a hold lets go by itself after a few seconds.
   ===================================================================== */
import { DUR, lowMotion, play, haptic } from './motion.js';

const PILL = { coins: 'wbCoins', gems: 'wbGems', parts: 'wbParts' };
const ICON = { coins: 'coin', gems: 'gem', parts: 'parts' };
export const KINDS = ['coins', 'gems', 'parts'];
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(Math.round(n)).toLocaleString('en-US');
const HOLD_MAX_MS = 20000;        // no hold outlives this, whatever went wrong (a chest waiting for COLLECT holds it)

export class WalletView {
  constructor(audio) {
    this.audio = audio;
    this.real = { coins: null, gems: null, parts: null };      // the server's numbers
    this.shown = { coins: null, gems: null, parts: null };     // what the pill says right now
    this.goal = { coins: null, gems: null, parts: null };      // where the pill is counting to
    this.tw = {};                                               // running count per kind
    this.holds = 0; this._holdT = 0;
    this.pool = [];                                             // reusable flying tokens
  }

  /* ---------- the truth ---------- */
  set(W) {
    if (!W) return;
    for (const k of KINDS) {
      const v = Number(W[k] || 0);
      const first = this.real[k] === null;
      this.real[k] = v;
      if (first) { this.shown[k] = this.goal[k] = v; this.text(k, v); continue; }
      if (!this.holds) this.countTo(k, v);
    }
  }
  hold() {
    this.holds++;
    clearTimeout(this._holdT);
    this._holdT = setTimeout(() => { this.holds = 0; this.settle(); }, HOLD_MAX_MS);
  }
  release() { this.holds = Math.max(0, this.holds - 1); if (!this.holds) { clearTimeout(this._holdT); this.settle(); } }
  /** Count every pill to the real number. */
  settle() { for (const k of KINDS) if (this.real[k] !== null) this.countTo(k, this.real[k]); }

  /* ---------- counting ---------- */
  text(k, v) { const el = $(PILL[k] + 'N'); if (el) { el.textContent = fmt(v); el.dataset.v = Math.round(v); } }
  /** Count `k` from what it shows now to `to`, eased; longer for bigger changes, never slow. */
  countTo(k, to, ms) {
    to = Math.round(to);
    if (this.goal[k] === to && this.tw[k]) return;
    const from = this.shown[k] === null ? to : this.shown[k];
    this.goal[k] = to;
    if (from === to) { this.text(k, to); return; }
    const d = ms || Math.min(DUR.reward + 200, DUR.normal + Math.log10(Math.abs(to - from) + 1) * 110);
    const t0 = performance.now(), tick = (now) => {
      if (this.goal[k] !== to) return;                          // a newer count took over
      const u = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - u, 3);
      this.shown[k] = from + (to - from) * e;
      this.text(k, this.shown[k]);
      if (u < 1) this.tw[k] = requestAnimationFrame(tick); else { this.shown[k] = to; this.tw[k] = 0; }
    };
    cancelAnimationFrame(this.tw[k] || 0);
    this.tw[k] = requestAnimationFrame(tick);
  }
  /** What a pill says right now (for tests). */
  showing(k) { const el = $(PILL[k] + 'N'); return el ? Number(el.dataset.v) : null; }

  /* ---------- a reward flying home ---------- */
  /**
   * Send `amount` of `kind` from `from` (an element or a rect) to its pill: a few tokens (never
   * one per coin — 3 to 6 stand for any amount), the pill counting up a share as each lands.
   * Resolves when the last one has landed. The amount is only what to SHOW — the real number was
   * set by the server already, and the pill can never count past it.
   */
  fly(kind, from, amount) {
    const pill = $(PILL[kind]);
    const bar = $('walletBar');
    if (!amount || !pill || !bar || bar.hidden || !pill.animate) { return Promise.resolve(); }
    const low = lowMotion();
    const n = Math.max(2, Math.min(low ? 3 : 6, 2 + Math.round(Math.log10(amount + 1))));
    const src = from && from.getBoundingClientRect ? from.getBoundingClientRect() : from;
    const dst = pill.getBoundingClientRect();
    const sx = src ? src.left + src.width / 2 : innerWidth / 2, sy = src ? src.top + src.height / 2 : innerHeight / 2;
    const tx = dst.left + 18, ty = dst.top + dst.height / 2;
    const start = this.goal[kind] ?? this.shown[kind] ?? this.real[kind] ?? 0;   // from where the pill is heading
    const cap = this.real[kind] ?? start + amount;
    return new Promise((resolve) => {
      let landed = 0;
      for (let i = 0; i < n; i++) {
        const el = this.token(kind);
        const ox = (Math.random() - 0.5) * 46, oy = (Math.random() - 0.5) * 30;
        el.style.left = (sx + ox) + 'px'; el.style.top = (sy + oy) + 'px';
        // a short hop up and out, then a curve into the pill
        const mx = (tx - sx - ox) * 0.35 + (Math.random() - 0.5) * 60, my = Math.min(-40, (ty - sy - oy) * 0.3) - 30 - Math.random() * 40;
        const a = el.animate([
          { transform: 'translate(0,0) scale(.5)', opacity: 0 },
          { transform: `translate(${mx}px,${my}px) scale(1.15)`, opacity: 1, offset: 0.32 },
          { transform: `translate(${tx - sx - ox}px,${ty - sy - oy}px) scale(.7)`, opacity: 1 },
        ], { duration: DUR.reward + i * 40, delay: i * 55, easing: 'cubic-bezier(.45,0,.4,1)', fill: 'both' });
        a.onfinish = a.oncancel = () => {
          el.style.display = 'none'; this.pool.push(el);
          landed++;
          // the pill takes its share as each token arrives — and never goes past the truth
          const v = Math.min(cap, start + (amount * landed) / n);
          this.countTo(kind, v, 140);
          play(pill, 'bump');
          if (this.audio) this.audio.play(kind === 'gems' ? 'gem' : 'coin', null, kind === 'parts' ? 0.45 : 0.6);
          if (landed === n) resolve();
        };
      }
    });
  }
  token(kind) {
    let el = this.pool.pop();
    if (!el) { el = document.createElement('i'); document.body.appendChild(el); }
    el.className = `ic i3 i-${ICON[kind]} flyer`;
    el.style.display = '';
    return el;
  }

  /* ---------- paying ---------- */
  /** A price was paid: the pill dips red, a "−N" floats off it, and it counts down to the truth. */
  spend(kind, n) {
    const pill = $(PILL[kind]); if (!pill || !n) return;
    play(pill, 'spend');
    const f = document.createElement('span');
    f.className = 'wb-float neg'; f.textContent = '−' + fmt(n);
    pill.appendChild(f);
    setTimeout(() => f.remove(), 900);
    // count down by the PRICE — not straight to the new total, which may already include what the
    // purchase pays back (a chest's coins), and that should arrive by flying in, afterwards
    const base = this.goal[kind] ?? this.shown[kind] ?? this.real[kind] ?? 0;
    this.countTo(kind, Math.max(0, base - n), DUR.normal + 160);
  }
  /** Not enough: the pill(s) you are short of shake and flash — quick, and nothing else happens. */
  poor(kinds) {
    for (const k of kinds) { const pill = $(PILL[k]); if (pill) play(pill, 'poor'); }
    if (this.audio) this.audio.play('poor');
    haptic('poor');
  }
}
