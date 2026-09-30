/* =====================================================================
   THE AIMING GUIDE — a dashed line from the barrel to where the shell
   will land:   - - - - - - - - - (o)

   It started as a THREE.Line, which WebGL always draws one pixel wide:
   on the pale desert sand it all but vanished. The next version put each
   point on a big dark disc — readable, but it looked like a row of black
   and white dots. Now it is the original DASHES again, drawn as flat white
   strips, each with a VERY thin dark edge just around it (a few
   centimetres, faint): enough to lift the white off bright sand, never
   enough to read as black. White stays the thing you see.

   Cheap: two meshes for the dashes (all dark edges are one geometry, all
   white dashes another) plus the landing ring and its edge — four draw
   calls, the same as before. Only as many dashes as the shot is long are
   drawn, through the draw range; nothing is rebuilt from frame to frame.
   ===================================================================== */
import * as THREE from '../three.js';

const N = 34;               // enough dashes for the longest range
const STEP = 1.15;          // metres from the start of one dash to the next
// The shape, in metres. A dash is a strip much longer than it is wide; the dark edge adds only
// RIM on every side — far thinner than the white strip itself.
export const DASH = { len: 0.62, wide: 0.13, rim: 0.035, step: STEP,
  whiteOpacity: 0.92, rimOpacity: 0.34, ring: [0.58, 0.72] };

/** N flat strips along local +Z, `w` wide and `l` long, as one triangle list (2 triangles each). */
function strips(w, l, y) {
  const pos = new Float32Array(N * 6 * 3);
  let o = 0;
  const put = (x, z) => { pos[o++] = x; pos[o++] = y; pos[o++] = z; };
  for (let i = 0; i < N; i++) {
    const z0 = 0.55 + i * STEP - (l - DASH.len) / 2, z1 = z0 + l, h = w / 2;
    put(-h, z0); put(h, z1); put(h, z0);
    put(-h, z0); put(-h, z1); put(h, z1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}
const PER = 6;              // vertices per strip

export class AimGuide {
  constructor() {
    this.root = new THREE.Group();
    this.root.frustumCulled = false;
    const R = DASH.rim;
    // the thin dark edge: the same strips, RIM larger all round, just under the white
    this.shade = new THREE.Mesh(strips(DASH.wide + 2 * R, DASH.len + 2 * R, 0),
      new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: DASH.rimOpacity, depthWrite: false, side: THREE.DoubleSide }));
    this.dots = new THREE.Mesh(strips(DASH.wide, DASH.len, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: DASH.whiteOpacity, depthWrite: false, side: THREE.DoubleSide }));
    for (const m of [this.shade, this.dots]) { m.frustumCulled = false; m.renderOrder = 3; this.root.add(m); }
    // the landing ring, with the same thin edge inside and out
    const [r0, r1] = DASH.ring;
    this.ringShade = new THREE.Mesh(new THREE.RingGeometry(r0 - R, r1 + R, 28),
      new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: DASH.rimOpacity, depthWrite: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    for (const m of [this.ringShade, this.ring]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 3; }
    this.count = 0;
  }
  addTo(scene) { scene.add(this.root, this.ringShade, this.ring); }
  set visible(v) { this.root.visible = this.ring.visible = this.ringShade.visible = !!v; }
  get visible() { return this.root.visible; }
  /** Draw from `from` (the muzzle) to `to` (where it lands), in `color`; `strong` when aiming a power or armed. */
  set(from, to, color = 0xffffff, strong = false) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, d = Math.hypot(dx, dy, dz);
    this.root.position.set(from.x, from.y, from.z);
    this.root.lookAt(to.x, to.y, to.z);
    // only the dashes that end before the landing ring
    const n = Math.max(0, Math.min(N, Math.floor((d - DASH.ring[1] - 0.55) / STEP) + 1));
    if (n !== this.count) { this.count = n; this.shade.geometry.setDrawRange(0, n * PER); this.dots.geometry.setDrawRange(0, n * PER); }
    this.dots.material.color.setHex(color); this.ring.material.color.setHex(color);
    this.dots.material.opacity = strong ? 1 : DASH.whiteOpacity;
    this.shade.material.opacity = strong ? DASH.rimOpacity + 0.08 : DASH.rimOpacity;
    this.ring.position.set(to.x, to.y + 0.02, to.z);
    this.ringShade.position.set(to.x, to.y + 0.01, to.z);
  }
}
