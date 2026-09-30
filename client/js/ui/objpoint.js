/* =====================================================================
   WHERE AN OBJECTIVE MARKER GOES ON SCREEN — pure maths, no DOM, so it
   can be tested on its own (tools/objpoint-test.js).

   Given where an objective lands on screen (from the camera projection),
   decide:
     - on screen: a small marker right above it;
     - off screen: an arrow on the edge of the screen, on the line from the
       middle of the screen towards the objective, pointing at it;
     - BEHIND the camera: projection flips things through the centre, so the
       direction is mirrored back first — otherwise an objective behind-left
       would be pointed at front-right.
   The arrow is kept off the HUD controls (sticks, fire button, minimap,
   score bar): if the edge point lands on one, it slides along the edge,
   towards the middle of that edge, until it is clear.
   ===================================================================== */

/**
 * @param p   {x, y, behind} screen position of the objective (behind = it was behind the camera)
 * @param W,H screen size
 * @param M   {t, r, b, l} margins the arrows keep from each edge
 * @param avoid rectangles [{x0, y0, x1, y1}] to keep arrows out of
 * @returns {x, y, ang (degrees, 0 = arrow points down), edge (bool), side ('t'|'r'|'b'|'l'|null)}
 */
export function placeGuide(p, W, H, M = { t: 60, r: 46, b: 46, l: 46 }, avoid = []) {
  const cx = W / 2, cy = H / 2;
  let px = p ? p.x : cx, py = p ? p.y : H * 2;
  if (p && p.behind) { px = cx - (px - cx); py = cy - (py - cy); if (Math.abs(py - cy) < 1) py = H * 2; }
  const inside = p && !p.behind && p.on !== false && px > M.l && px < W - M.r && py > M.t && py < H - M.b;
  if (inside) return { x: px, y: py, ang: 0, edge: false, side: null };
  // off screen: where the line from the centre towards it crosses the inset rectangle
  let dx = px - cx, dy = py - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = 1;
  const hx = dx > 0 ? W - M.r - cx : cx - M.l, hy = dy > 0 ? H - M.b - cy : cy - M.t;
  const k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
  let x = cx + dx * k, y = cy + dy * k;
  const side = Math.abs(x - (W - M.r)) < 0.5 ? 'r' : Math.abs(x - M.l) < 0.5 ? 'l' : Math.abs(y - M.t) < 0.5 ? 't' : 'b';
  // keep clear of the controls: slide along this edge towards its middle, a step at a time
  const hit = (x, y) => avoid.some((r) => x > r.x0 - 22 && x < r.x1 + 22 && y > r.y0 - 22 && y < r.y1 + 22);
  for (let i = 0; i < 40 && hit(x, y); i++) {
    if (side === 't' || side === 'b') x += (cx - x) > 0 ? 16 : -16;
    else y += (cy - y) > 0 ? 16 : -16;
  }
  const ang = Math.atan2(dy, dx) * 180 / Math.PI - 90;   // the arrow graphic points down at 0°
  return { x, y, ang, edge: true, side };
}

/** Whole metres, and a tidy step when far away, so the label does not flicker every frame. */
export function niceDist(m) {
  if (typeof m !== 'number' || !(m >= 0)) return '';
  const r = m < 100 ? Math.round(m) : Math.round(m / 5) * 5;
  return r + 'm';
}
