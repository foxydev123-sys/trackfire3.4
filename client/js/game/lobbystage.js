/* =====================================================================
   LOBBY STAGE — the tanks you see on the menu screen.

   Your tank stands on the ground south of the Citadel, turned about 35°
   so you see its front and one side, with Hawler behind it. As friends
   join your squad their tanks fall in beside you and the camera eases
   back so the whole line stays in frame; when one leaves it closes up
   again. Everyone's pick is live: change tank and the model swaps.

   The stage only ever runs on the menu and lobby screens — it is torn
   down before a match, so it costs a match nothing.
   ===================================================================== */
import * as THREE from '../three.js';
import { TankView } from './tank.js';
import { TANKS } from '../../shared/tanks.js';

// Every map carries its own staging ground — where the line-up stands, where the camera goes
// and what it looks at — in `map.lobby` (see LOBBY in shared/maps.js). The area around it has
// already been swept clear of rocks, trees and props, so nothing can hide a tank.
const FALLBACK = { stage: { x: 3.1, z: 26.5 }, look: { x: 0, z: 17 },
                   shot: { dist: 23, height: 5.4, side: -2.5, aim: 2.2 }, clear: 15 };

// Up to four standing spots. You take the middle one; the empty ones show a "+" to bring a
// friend in — the same shape as the squad slots in games like Brawl Stars.
//
// The line-up is only as wide as the squad needs: on your own it is you plus one open place,
// and it grows as people arrive. That keeps every tank big enough to see on a phone, instead
// of framing four spots when three of them are empty.
export const SLOTS = 4;
const SPACING = 6.6;            // metres between spots
const ARC = 1.2;                // the outer spots sit a little further back, so none is hidden
const TURN = 0.62;              // radians off facing the camera dead-on — about 35°
// How far the camera pulls back for a line-up of 1, 2, 3 or 4 spots, as a multiple of the
// map's own shot distance. Two tanks need much less room than four.
const ZOOM = [0.74, 0.88, 1.0, 1.12];

const FILL_ORDER = [1, 2, 0, 3];

// The menu shot is a close portrait of the line-up, never a view of the map. Whatever the framing
// maths asks for, the camera stays inside this range: at most this much further back than the
// composed shot, and at most this far to either side of it.
export const FIT_MIN = 0.85, FIT_MAX = 1.75, PAN_MAX = 16;
// A change to the line-up (someone joins or leaves, a tank swap) is an eased move, not a cut:
// quick enough that the tanks never sit under a panel for long, slow enough to read as motion.
export const MOVE_MS = 450;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const ok = (v) => typeof v === 'number' && Number.isFinite(v);

const TEAM_COL = [
  [0xd8a83c, 0xffe0a0],   // you — the game's amber
  [0x5f92e8, 0xbcd6ff],
  [0x6fb85f, 0xc4f0b8],
  [0xb07fd8, 0xe2c8ff],
];

export class LobbyStage {
  constructor() {
    this.W = null;              // the world we are staged in
    this.views = new Map();     // player id → { view, kind, slot }
    this.t = 0;
    this.L = FALLBACK;
    this.cam = { ...FALLBACK.shot };
    this.want = { ...FALLBACK.shot };
    this.spin = 0;              // a slow drift, so the shot is never dead still
    // The clear strip between the two menu columns, in screen pixels. The camera frames the
    // line-up into THIS, not into the whole window, so a tank is never left under a panel.
    this.safe = null;
    this.pan = 0; this.wantPan = 0;       // sideways dolly that centres the line-up on the strip
    this.fit = 1; this.wantFit = 1;       // how much further back to sit so the line-up fits it
    // Frames still owed a worked-out shot rather than an eased one. More than one, because the
    // squad bar and the side panel re-lay-out on the same change, and the shot has to be framed
    // around where they end up, not where they were.
    this.snapFor = 3;
    this._shown = 0;
    this.move = null;           // an eased move between two worked-out shots, or null
    this.good = null;           // the last shot that was measured and found valid
  }

  /** Move the stage into `W` (the menu world). Safe to call with the same world again. */
  attach(W) {
    if (this.W === W) return;
    this.clear();
    this.W = W;
    this.L = (W && W.map && W.map.lobby) || FALLBACK;     // this map's own staging ground
    this.want = { ...this.L.shot };
    this.cam = { ...this.L.shot };
    this.pan = this.wantPan = 0; this.fit = this.wantFit = 1;                        // snap, don't sweep across the map
    this.snapFor = 3;
    // A new map is a new place: nothing about the old shot means anything here, so the first
    // frame on it is worked out from scratch rather than eased in from the other map's numbers.
    this.move = null; this.good = null; this.cut = true; this._shape = null;
  }

  clear() {
    for (const e of this.views.values()) e.view.dispose();
    this.views.clear();
  }

  groundY(x, z) { return this.W && this.W.map ? this.W.map.height(x, z) : 0; }

  /**
   * Set the whole line-up at once.
   * `players` = [{ id, tank }] in the order they should stand, you first.
   */
  setPlayers(players) {
    if (!this.W) return;
    const list = players.slice(0, SLOTS);
    const seen = new Set();
    this.taken = new Set();
    list.forEach((p, i) => {
      seen.add(p.id);
      const slot = FILL_ORDER[i];
      this.taken.add(slot);
      const kind = p.tank || 'zagros';
      let e = this.views.get(p.id);
      if (e && e.kind !== kind) { e.view.dispose(); e = null; }     // they switched tank
      if (!e) {
        const [col, acc] = TEAM_COL[i % 4];
        const view = new TankView(this.W.scene, col, acc, i === 0, kind);
        if (view.teamRing) view.teamRing.visible = false;           // no team ring on the menu
        view.setNight(!!this.W.night);
        e = { view, kind, slot, born: this.t };
        this.views.set(p.id, e);
      }
      e.slot = slot; e.me = i === 0;
    });
    for (const [id, e] of this.views) if (!seen.has(id)) { e.view.dispose(); this.views.delete(id); }
    // who stands where, and in which tank: any change to it is a line-up change, framed as a glide
    const shape = [...this.views.entries()].map(([id, e]) => id + ':' + e.slot + ':' + e.kind).sort().join('|');
    if (shape !== this._shape) {
      if (this._shape != null) { this.snapFor = Math.max(this.snapFor, 2); this.glide = true; }   // not the first line-up on this map
      this._shape = shape;
    }
    // Someone joining or leaving widens or narrows the line-up on the very next frame. Easing the
    // camera into the new shot over a second meant the newcomer's tank spent that second sliding
    // about under the side panel, so work the shot out first and arrive already framed.
    if (this.shown() !== this._shown) { this._shown = this.shown(); this.snapFor = 3; this.glide = true; }
  }

  /** How many standing places are shown: everyone here, plus one empty one to fill. */
  shown() { return Math.max(2, Math.min(SLOTS, this.views.size + 1)); }

  /** Where standing spot `i` is, of the `shown()` on the ground: a shallow arc, middle nearest. */
  spotOf(i) {
    const S = this.L.stage, n = this.shown(), off = this.orderOf(i) - (n - 1) / 2;
    return { x: S.x + off * SPACING, z: S.z - Math.abs(off) * ARC };
  }
  /** Where slot `i` sits left-to-right in a line-up of `shown()` places. */
  orderOf(i) {
    const n = this.shown(), used = FILL_ORDER.slice(0, n).slice().sort((a, b) => a - b);
    const at = used.indexOf(i);
    return at < 0 ? (n - 1) / 2 : at;
  }
  /** The places with nobody on them — one while there is room, none when the squad is full. */
  openSlots() {
    const taken = this.taken || new Set();
    return FILL_ORDER.slice(0, this.shown()).filter((i) => !taken.has(i));
  }

  /**
   * Tell the stage exactly which rectangles the UI paints over the scene, in pixels.
   * Real rectangles, not one inscribed strip: the menu columns do not reach the bottom of the
   * screen, and the tanks stand low, so the width beside and below them is theirs to use. Boxing
   * the line-up into the narrow strip between the columns was what shrank it to a thumbnail.
   */
  setSafe(rects, W, H) {
    rects = rects || [];
    // A shot is only right for the layout it was worked out against. The squad bar and the side
    // panel keep moving for a few frames after someone joins, so whenever a panel actually shifts,
    // work the shot out again rather than easing towards an answer that is already out of date.
    let sig = W + 'x' + H;
    for (const r of rects) sig += '|' + (r.x0 >> 1) + ',' + (r.x1 >> 1) + ',' + (r.y0 >> 1) + ',' + (r.y1 >> 1);
    if (sig !== this._sig) { this._sig = sig; this.snapFor = Math.max(this.snapFor, 1); }
    this.safe = { rects, W, H };
  }

  /**
   * Is this panel a SIDE panel (it hugs the left or right edge and stops short of the middle) or a
   * BAR (it runs across the middle of the screen — the bottom row of tiles, the season line)?
   * The difference matters: a side panel limits how WIDE the line-up may be; a bar only limits how
   * HIGH or LOW it may stand, and only where it actually is.
   */
  isBar(r) { const mid = this.safe.W / 2; return r.x0 < mid - 1 && r.x1 > mid + 1; }

  /** How far left and right a box spanning `top`..`bot` on screen can reach without meeting a side panel. */
  clearAt(top, bot) {
    const S = this.safe, mid = S.W / 2;
    let x0 = 6, x1 = S.W - 6;
    for (const r of S.rects) {
      if (Math.min(bot, r.y1) - Math.max(top, r.y0) <= 2) continue;   // not level with this box
      // A bar across the middle is NOT a side panel. Treating the bottom row of tiles (which reaches
      // past the middle once YOUR TANK shows in it) as "a panel down the left whose edge is at the
      // far side of the screen" is what sent the camera 24 m sideways and twice as far back.
      if (this.isBar(r)) continue;
      if (r.x1 <= mid) x0 = Math.max(x0, r.x1 + 16);                  // a panel down the left
      else x1 = Math.min(x1, r.x0 - 16);                              // one down the right
    }
    return { x0, x1 };
  }
  /** The lowest and highest a box spanning `lo`..`hi` may reach before it meets a bar. */
  rowAt(lo, hi) {
    const S = this.safe, H = S.H;
    let top = 6, bot = H - 6;
    for (const r of S.rects) {
      if (!this.isBar(r)) continue;
      if (Math.min(hi, r.x1) - Math.max(lo, r.x0) <= 2) continue;      // not above or below this box
      if ((r.y0 + r.y1) / 2 > H / 2) bot = Math.min(bot, r.y0 - 6);  // a bar along the bottom: stand above it
      else top = Math.max(top, r.y1 + 6);                              // along the top: stay below it
    }
    return { top, bot };
  }

  /**
   * Work out how the camera has to move so no tank ends up behind a panel.
   * Measured, not assumed: every tank's own eight corners are projected through the real camera,
   * compared against the real panel rectangles beside them, and the answer comes back as a
   * sideways dolly plus a pull-back — plus a note (`urgent`, `viol`) on whether the shot as it
   * stands is merely untidy or actually hiding somebody.
   */
  fitToSafe(camera) {
    const S = this.safe;
    // Nothing to frame, or no layout yet: aim for the composed shot and claim nothing is wrong.
    if (!S || !camera || !this.views.size || !(S.W > 0 && S.H > 0)) { this.wantPan = 0; this.wantFit = 1; this.viol = 0; this.urgent = false; this.valid = false; return; }
    const V = this._v || (this._v = new THREE.Vector3());

    // 1. where every tank actually lands on screen, hull and all
    const boxes = [];
    let depth = 0, n = 0;
    for (const e of this.views.values()) {
      const sp = this.spotOf(e.slot);
      const P = (e.view && e.view.root && e.view.root.position) || null;
      const cx = P ? P.x : sp.x, cz = P ? P.z : sp.z;
      const cy = P ? P.y : this.groundY(sp.x, sp.z);
      const sz = (TANKS[e.kind] && TANKS[e.kind].size) || 1;
      const hw = 1.7 * sz, ht = 2.6 * sz, hl = 2.7 * sz;
      let lo = 1e9, hi = -1e9, top = 1e9, bot = -1e9, on = false;
      for (const ox of [-hw, hw]) for (const oy of [0, 2 * ht]) for (const oz of [-hl, hl]) {
        V.set(cx + ox, cy + oy, cz + oz);
        const d = V.distanceTo(camera.position);
        V.project(camera);
        if (V.z >= 1 || !ok(V.x) || !ok(V.y)) continue;
        const px = (V.x * 0.5 + 0.5) * S.W, py = (-V.y * 0.5 + 0.5) * S.H;
        lo = Math.min(lo, px); hi = Math.max(hi, px);
        top = Math.min(top, py); bot = Math.max(bot, py);
        depth += d; n++; on = true;
      }
      if (on) boxes.push({ lo, hi, top, bot, me: !!e.me });
    }
    // Nobody landed on screen (a tank created this very frame, a camera still pointing at the old
    // map): nothing measured means nothing learned — change nothing, rather than guess.
    if (!boxes.length) { this.wantPan = this.pan; this.wantFit = this.fit; this.viol = 0; this.urgent = false; this.valid = false; return; }
    this.valid = true;
    this.lastBoxes = boxes;                 // for tests and QA: where each tank is on screen
    depth /= n;
    const tn = Math.tan(((camera.fov || 36) * Math.PI / 180) / 2);
    const mPerPx = (2 * depth * tn * (camera.aspect || S.W / S.H)) / S.W;

    // 2. for each tank, how far it is over the panels beside it — and how much room it has spare
    let pushR = 0, pushL = 0, slackL = 1e9, slackR = 1e9;
    let meC = null, top = 1e9, bot = -1e9;
    for (const b of boxes) {
      const c = this.clearAt(b.top, b.bot);
      pushR = Math.max(pushR, c.x0 - b.lo);          // hanging off the left edge of its room
      pushL = Math.max(pushL, b.hi - c.x1);          // off the right
      slackL = Math.min(slackL, b.lo - c.x0);
      slackR = Math.min(slackR, c.x1 - b.hi);
      top = Math.min(top, b.top); bot = Math.max(bot, b.bot);
      if (b.me) meC = (b.lo + b.hi) / 2;
    }
    const lineW = Math.max(1, Math.max(...boxes.map((b) => b.hi)) - Math.min(...boxes.map((b) => b.lo)));

    // 3. slide if sliding is enough; only when it is over on BOTH sides is the line-up too wide
    let shift = 0, grow = 1;
    // Is something actually covered right now? Then the correction is not a matter of taste and
    // must not be eased into over a second — the panels finish sliding in after the squad changes,
    // and a tank sitting under one while the camera saunters over is exactly the bug being fixed.
    this.urgent = pushR > 0.5 || pushL > 0.5;
    // (half a pixel of tolerance: a tank resting exactly against a panel is not "covered", and
    // treating it as covered stopped the shot ever easing back to centre)
    if (pushR > 0.5 && pushL > 0.5) {
      grow = (lineW + pushR + pushL) / lineW;
      shift = (pushR - pushL) / 2;
    } else if (pushR > 0.5 || pushL > 0.5) {
      shift = pushR - pushL;
    } else if (meC != null) {
      // Nothing is covered, so spend what room is left putting YOUR tank in the middle — but keep
      // a margin in hand and stop once it is close enough. Without a deadband the shot creeps
      // towards centre frame after frame until it quietly slides a squadmate under a panel.
      const room = 14;
      const want = S.W / 2 - meC;
      const capped = Math.max(-Math.max(0, slackL - room), Math.min(Math.max(0, slackR - room), want));
      shift = Math.abs(capped) > 10 ? capped * 0.35 : 0;
    }

    // 4. the line-up must also stay on screen top to bottom — and above the row of tiles along the
    // bottom and below the season line, but only where those bars actually are above or below it
    let overT = 0, overB = 0;
    for (const b of boxes) {
      const row = this.rowAt(b.lo, b.hi);
      overT = Math.max(overT, row.top - b.top);
      overB = Math.max(overB, b.bot - row.bot);
    }
    if (overT > 0 || overB > 0) {
      const h = Math.max(1, bot - top);
      grow = Math.max(grow, (h + overT + overB) / h);
      this.urgent = true;
    }

    // how badly this shot fails, in pixels — what `solve` minimises
    this.viol = Math.max(0, pushR) + Math.max(0, pushL) + overT + overB;
    let wp = this.pan - shift * mPerPx;                                // camera right = subject left
    // Sliding sideways has a limit. What the slide cannot cover, stepping back has to.
    if (ok(wp) && Math.abs(wp) > PAN_MAX && (pushR > 0.5 || pushL > 0.5)) {
      const left = (Math.abs(wp) - PAN_MAX) / mPerPx;                   // pixels still to find
      grow = Math.max(grow, (lineW + left) / lineW);
    }
    const wf = this.fit * grow;
    // Never believe a measurement that asks for something no menu shot needs.
    this.wantPan = ok(wp) ? Math.max(-PAN_MAX, Math.min(PAN_MAX, wp)) : this.pan;
    this.wantFit = ok(wf) ? Math.max(FIT_MIN, Math.min(FIT_MAX, wf)) : this.fit;
  }

  /** Called every menu frame. Returns the camera position and target to use. */
  frame(dt, camera) {
    this.t += dt;
    // Face the camera, then turn 35° off it, so you see the front and one side of every tank.
    const yaw = Math.atan2(this.cam.side, this.cam.dist) + TURN;
    for (const e of this.views.values()) {
      const s = this.spotOf(e.slot);
      // Idle life: a slow sway, each tank out of phase with the others, and now and then the turret
      // looks a little to one side and back — alive, never driving about.
      const sway = Math.sin(this.t * 0.5 + e.slot * 1.3) * 0.035;
      const look = this.idleLook(e);
      e.view.setPose(s.x, s.z, yaw + sway, yaw + sway + look, (x, z) => this.groundY(x, z), dt, 0);
      if (e.view.hull && e.born != null) e.view.hull.position.y += Math.sin(this.t * 1.7 + e.slot) * 0.012;  // engine idle
      e.view.setShield(false, this.t);
    }
    // frame however many are actually standing there, so two tanks fill the screen properly
    const z = ZOOM[Math.min(ZOOM.length - 1, Math.max(0, this.shown() - 1))];
    this.want = { dist: this.L.shot.dist * z, height: this.L.shot.height * (0.82 + 0.18 * z),
                  side: this.L.shot.side, aim: this.L.shot.aim };
    this.spin += dt * 0.055;
    const drift = Math.sin(this.spin) * 1.1;                 // a slow, small left-right drift
    const S = this.L.stage;

    // --- an eased move under way (someone joined or left): follow it, nothing else to decide
    if (this.move) {
      const m = this.move;
      m.t += dt * 1000;
      const k = easeOut(Math.min(1, m.t / m.ms));
      this.pan = m.a.pan + (m.b.pan - m.a.pan) * k;
      this.fit = m.a.fit + (m.b.fit - m.a.fit) * k;
      for (const key of ['dist', 'height', 'side', 'aim']) this.cam[key] = m.a.cam[key] + (m.b.cam[key] - m.a.cam[key]) * k;
      this.place(camera, this.pan, this.fit, drift);
      if (m.t >= m.ms) { this.move = null; this.fitToSafe(camera); this.keep(); }
      // a panel that moves while we glide (the squad bar growing) is folded in by re-planning
      if (this.snapFor > 0) this.plan(camera, drift);
      return { x: S.x, z: S.z };
    }

    const k = 1 - Math.exp(-dt * 2.2);
    for (const key of ['dist', 'height', 'side', 'aim']) this.cam[key] += (this.want[key] - this.cam[key]) * k;
    this.pan += (this.wantPan - this.pan) * k;
    this.fit += (this.wantFit - this.fit) * k;
    // `pan` slides the whole shot sideways — camera and aim point together — so the line-up moves
    // across the frame into the clear strip without changing the character of the shot. `fit`
    // pulls the camera back until the whole line-up fits that strip.
    this.place(camera, this.pan, this.fit, drift);
    this.fitToSafe(camera);                 // measure where that landed, ready for the next frame

    // The rule, and the whole point of this machinery: no frame is ever drawn with a tank behind
    // a panel. Easing is for composition, and composition can wait a moment; a hidden tank cannot.
    if ((this.urgent || this.snapFor > 0) && this.safe) {
      this.plan(camera, drift);
    } else if (this.safe && this.valid && !this.urgent) {
      this.relax(camera, drift, dt);
    }
    this.guard(camera, drift);
    return { x: S.x, z: S.z };
  }

  /**
   * Work out the right shot for the line-up as it now stands, and get there: in one go on a new
   * map or when something is already hidden, as a short eased move when the line-up changed.
   */
  plan(camera, drift) {
    if (this.snapFor > 0) this.snapFor--;
    const from = { pan: this.pan, fit: this.fit, cam: { ...this.cam } };
    this.solve(camera, drift);
    const to = { pan: this.pan, fit: this.fit, cam: { ...this.cam } };
    const far = Math.abs(to.pan - from.pan) > 0.05 || Math.abs(to.fit - from.fit) > 0.004 || Math.abs(to.cam.dist - from.cam.dist) > 0.05;
    if (this.glide && !this.cut && far && this.valid) {
      // start from where the camera IS (mid-move included), so a second change never jumps
      this.move = { a: from, b: to, t: 0, ms: MOVE_MS };
      this.pan = from.pan; this.fit = from.fit; this.cam = { ...from.cam };
      this.place(camera, this.pan, this.fit, drift);
    } else if (this.valid) this.keep();
    if (this.snapFor <= 0) { this.glide = false; this.cut = false; }
  }

  /**
   * Once nothing is covered, drift back towards the composed shot (no extra pull-back, no side
   * slide) — but only as far as it stays clear. Without this the pull-back was a ratchet: anything
   * that ever pushed the camera out (one odd frame of layout) left it out there for good.
   */
  relax(camera, drift, dt) {
    const f0 = this.fit, p0 = this.pan;
    if (Math.abs(f0 - 1) < 0.002) { this.keep(); return; }
    const f1 = f0 + (1 - f0) * Math.min(1, dt * 2.5);
    const wp = this.wantPan;
    this.place(camera, p0, f1, drift);
    this.fitToSafe(camera);
    if (this.valid && this.viol <= 0.5) { this.fit = f1; this.wantFit = Math.min(this.wantFit, f1); this.keep(); return; }
    // one step closer would hide someone: stay put for now…
    this.place(camera, p0, f0, drift);
    this.fitToSafe(camera);
    this.wantFit = f0; this.wantPan = wp;
    // …and every so often look for the TIGHTEST clear shot from scratch — starting at the composed
    // distance and working outwards — because the way back in may need a small sideways step too.
    this.reframeIn = (this.reframeIn || 0) - dt;
    if (this.reframeIn > 0 || this.move) return;
    this.reframeIn = 0.6;
    const from = { pan: p0, fit: f0, cam: { ...this.cam } };
    this.pan = p0; this.fit = 1;
    this.solve(camera, drift);
    if (this.valid && this.viol <= 0.5 && this.fit < f0 - 0.01) {
      const to = { pan: this.pan, fit: this.fit, cam: { ...this.cam } };
      this.move = { a: from, b: to, t: 0, ms: MOVE_MS };
    }
    this.pan = from.pan; this.fit = from.fit; this.cam = from.cam;
    this.place(camera, this.pan, this.fit, drift);
    this.fitToSafe(camera);
  }

  /**
   * The closest clear shot for the line-up as it stands, worked out from scratch (starting at the
   * composed distance). Changes nothing — for QA and tests, to check the camera is not further
   * back than it has to be.
   */
  tightest(camera) {
    const keep = { pan: this.pan, fit: this.fit, cam: { ...this.cam }, wp: this.wantPan, wf: this.wantFit, viol: this.viol, urgent: this.urgent, valid: this.valid };
    const drift = Math.sin(this.spin) * 1.1;
    this.fit = 1; this.solve(camera, drift);
    const out = { fit: this.fit, pan: this.pan, viol: this.viol };
    Object.assign(this, { pan: keep.pan, fit: keep.fit, cam: keep.cam, wantPan: keep.wp, wantFit: keep.wf, viol: keep.viol, urgent: keep.urgent, valid: keep.valid });
    this.place(camera, this.pan, this.fit, drift);
    return out;
  }

  /** Remember a shot that was measured and is inside the menu range. */
  keep() {
    if (ok(this.pan) && ok(this.fit) && this.fit >= FIT_MIN - 1e-6 && this.fit <= FIT_MAX + 1e-6 && Math.abs(this.pan) <= PAN_MAX + 1e-6)
      this.good = { pan: this.pan, fit: this.fit, cam: { ...this.cam } };
  }
  /** Last line of defence: an impossible shot is never drawn — fall back to the last good one. */
  guard(camera, drift) {
    const bad = !ok(this.pan) || !ok(this.fit) || !ok(this.cam.dist) || this.fit < FIT_MIN - 1e-6 || this.fit > FIT_MAX + 1e-6 || Math.abs(this.pan) > PAN_MAX + 1e-6;
    if (!bad) return;
    const g = this.good || { pan: 0, fit: 1, cam: { ...this.want } };
    this.pan = this.wantPan = g.pan; this.fit = this.wantFit = g.fit; this.cam = { ...g.cam };
    this.place(camera, this.pan, this.fit, drift);
  }

  /** Now and then a tank's turret looks a little to one side, holds, and comes back. */
  idleLook(e) {
    const T = 7 + e.slot * 1.9;                          // each tank on its own slow cycle
    const u = ((this.t + e.slot * 2.3) % T) / T;         // 0..1 through the cycle
    if (u < 0.72) return 0;
    const w = (u - 0.72) / 0.28;                         // the last ~quarter: look, hold, return
    return Math.sin(w * Math.PI) * (e.slot % 2 ? 0.22 : -0.22);
  }

  /** Put `camera` where a given pan and fit would put it. No drawing, so it is safe to iterate. */
  place(camera, pan, fit, drift) {
    const S = this.L.stage, K = this.L.look;
    const cx = S.x + this.cam.side + drift + pan;
    const cz = S.z + this.cam.dist * fit;
    const cy = this.groundY(cx, cz) + this.cam.height * (0.55 + 0.45 * fit);
    camera.position.set(cx, cy, cz);
    camera.lookAt(K.x + drift * 0.3 + pan, this.groundY(K.x, K.z) + this.cam.aim, K.z);
    camera.updateMatrixWorld && camera.updateMatrixWorld(true);
  }

  /**
   * Run the framing to its answer without drawing a frame. Placing the camera and measuring the
   * result is cheap — a couple of dozen rounds costs less than one frame — so when the line-up
   * changes shape we settle the shot here and show it already correct rather than sliding into it.
   */
  solve(camera, drift) {
    this.cam = { ...this.want };
    // Search outwards from the composed shot, never from wherever the camera happens to be: the
    // search only ever widens, so starting from an already-wide shot could only ever find that.
    this.fit = 1;
    // Damped, and it keeps the best shot it saw rather than wherever the last round happened to
    // land: taking the whole correction each round makes the pull-back and the sideways slide
    // fight each other, and the search walks away from a perfectly good answer it already had.
    let bp = this.pan, bf = this.fit, best = Infinity;
    for (let i = 0; i < 64; i++) {
      this.place(camera, this.pan, this.fit, drift);
      this.fitToSafe(camera);
      if (this.viol < best - 0.01) { best = this.viol; bp = this.pan; bf = this.fit; }
      const dp = this.wantPan - this.pan, df = this.wantFit - this.fit;
      if (best <= 0.01 && Math.abs(dp) < 0.01 && Math.abs(df) < 0.002) break;
      this.pan = Math.max(-PAN_MAX, Math.min(PAN_MAX, this.pan + dp * 0.5));
      this.fit = Math.max(FIT_MIN, Math.min(FIT_MAX, this.fit + df * 0.5));
    }
    this.pan = bp; this.fit = bf;
    this.place(camera, this.pan, this.fit, drift);
    this.fitToSafe(camera);
  }

  /** Where standing spot `i` shows up on screen, `up` metres above the ground. */
  slotScreen(i, camera, out, up = 1.6) {
    const s = this.spotOf(i);
    out.set(s.x, this.groundY(s.x, s.z) + up, s.z);
    out.project(camera);
    return { x: (out.x * 0.5 + 0.5) * innerWidth, y: (-out.y * 0.5 + 0.5) * innerHeight, on: out.z < 1 };
  }
}
