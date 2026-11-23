// Procedural low-poly vehicle geometry. Forward = +Z, origin at ground centre.
// Body uses white vertex colour (tinted per instance); glass/wheels are dark.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function colorize(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function clean(geo) {
  // ensure identical attribute sets for merging
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

function profileExtrude(points, width, bevel = 0.08) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2); // profile X (length) -> world +Z
  return geo;
}

function wheel(x, z, r, w) {
  const g = new THREE.CylinderGeometry(r, r, w, 14);
  g.rotateZ(Math.PI / 2);
  g.translate(x, r, z);
  return colorize(clean(g), 0.05, 0.05, 0.055);
}
function hub(x, z, r, w) {
  const g = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 10);
  g.rotateZ(Math.PI / 2);
  g.translate(x, r, z);
  return colorize(clean(g), 0.55, 0.56, 0.58);
}
function box(w, h, d, x, y, z, col) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return colorize(clean(g), ...col);
}

// Model specs: L length, W width, profile (side view, x along length from rear(-) to front(+), y up)
// Side profiles are sampled from smooth curves (x along length, rear -> front).
function curve(pts, steps = 3) {
  // Catmull-Rom through control points for rounded bodywork
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
const SPECS = {
  sedan: {
    L: 4.7, W: 1.86, wheelR: 0.34,
    body: curve([[-2.34, 0.32], [-0.9, 0.24], [0.9, 0.24], [2.34, 0.32], [2.38, 0.58], [2.18, 0.8], [1.2, 0.9], [-1.5, 0.95], [-2.3, 0.86], [-2.38, 0.6]]),
    cabin: curve([[-1.5, 0.9], [0.95, 0.88], [0.35, 1.36], [-0.25, 1.44], [-1.05, 1.42]], 3),
  },
  hatch: {
    L: 4.05, W: 1.78, wheelR: 0.32,
    body: curve([[-2.0, 0.32], [-0.7, 0.24], [0.7, 0.24], [2.0, 0.32], [2.05, 0.56], [1.88, 0.78], [0.85, 0.88], [-1.95, 0.95], [-2.06, 0.6]]),
    cabin: curve([[-1.94, 0.92], [0.78, 0.88], [0.1, 1.4], [-0.6, 1.48], [-1.82, 1.44]], 3),
  },
  suv: {
    L: 4.85, W: 1.98, wheelR: 0.4,
    body: curve([[-2.42, 0.42], [-0.9, 0.34], [0.9, 0.34], [2.42, 0.42], [2.46, 0.78], [2.28, 1.02], [1.2, 1.1], [-2.38, 1.12], [-2.46, 0.8]]),
    cabin: curve([[-2.32, 1.08], [1.1, 1.08], [0.5, 1.72], [-0.3, 1.8], [-2.2, 1.78]], 3),
  },
  sports: {
    L: 4.55, W: 1.96, wheelR: 0.34,
    body: curve([[-2.26, 0.28], [-0.8, 0.2], [0.8, 0.2], [2.28, 0.26], [2.34, 0.44], [1.95, 0.62], [0.75, 0.76], [-1.55, 0.86], [-2.26, 0.78], [-2.32, 0.5]]),
    cabin: curve([[-1.3, 0.78], [0.6, 0.76], [0.0, 1.14], [-0.5, 1.2], [-1.0, 1.16]], 3),
  },
  van: {
    L: 5.3, W: 2.05, wheelR: 0.38,
    body: curve([[-2.65, 0.38], [-1, 0.3], [1, 0.3], [2.62, 0.38], [2.68, 0.9], [2.42, 1.14], [1.8, 1.24], [-2.62, 1.26], [-2.68, 0.8]]),
    cabin: curve([[-2.62, 1.2], [1.75, 1.2], [1.2, 2.2], [0.4, 2.3], [-2.58, 2.3]], 2),
    cabinColor: 'body', windowBand: true,
  },
  truck: {
    L: 7.2, W: 2.35, wheelR: 0.48,
    body: [[-3.6, 0.5], [3.6, 0.5], [3.62, 1.2], [3.5, 1.5], [2.0, 1.55], [-3.6, 1.55]],
    cabin: [[1.95, 1.5], [3.45, 1.5], [3.25, 2.7], [1.95, 2.75]],
    cargo: true,
  },
};

export const CAR_MODELS = Object.keys(SPECS);

const cache = {};
export function carGeometry(model, { wheels = true } = {}) {
  const ck = model + (wheels ? '' : ':nw');
  if (cache[ck]) return cache[ck];
  const s = SPECS[model];
  const parts = [];
  const body = colorize(clean(profileExtrude(s.body, s.W)), 1, 1, 1);
  parts.push(body);
  const glassCol = [0.08, 0.1, 0.13];
  if (s.cabinColor === 'body') {
    parts.push(colorize(clean(profileExtrude(s.cabin, s.W - 0.06)), 1, 1, 1));
    // windshield + side window band
    parts.push(box(s.W - 0.02, 0.55, 0.08, 0, 1.75, s.L / 2 - 0.95, glassCol));
    parts.push(box(s.W + 0.01, 0.42, 1.0, 0, 1.78, s.L / 2 - 1.55, glassCol));
  } else {
    parts.push(colorize(clean(profileExtrude(s.cabin, s.W - 0.16, 0.05)), ...glassCol));
    // roof (body coloured) on top of glass cabin
    const top = s.cabin.map((p) => p[1]).reduce((a, b) => Math.max(a, b));
    const xs = s.cabin.filter((p) => p[1] > top - 0.06).map((p) => p[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (!s.cargo) parts.push(box(s.W - 0.22, 0.06, (x1 - x0) * 0.98, 0, top + 0.02, (x0 + x1) / 2, [1, 1, 1]));
  }
  if (s.cargo) parts.push(box(s.W, 2.4, 4.9, 0, 2.6, -1.05, [0.92, 0.92, 0.92]));
  const wz = s.L / 2 - (model === 'truck' ? 1.1 : 0.82);
  const wx = s.W / 2 - 0.12;
  const wheelPos = [];
  for (const z of [wz, -wz + (model === 'truck' ? 0.3 : 0)]) for (const x of [wx, -wx]) {
    wheelPos.push({ x, z, front: z > 0 });
    if (wheels) parts.push(wheel(x, z, s.wheelR, 0.26), hub(x + Math.sign(x) * 0.02, z, s.wheelR, 0.26));
  }
  if (!s.cargo) {
    const mz = s.L / 2 - (model === 'van' ? 1.9 : model === 'sports' ? 2.1 : 1.75);
    const my = model === 'van' ? 1.3 : model === 'suv' ? 1.15 : model === 'sports' ? 0.82 : 0.95;
    for (const sx of [1, -1]) parts.push(box(0.22, 0.13, 0.12, sx * (s.W / 2 + 0.08), my, mz, [1, 1, 1]));
    // dark side skirts & wheel-arch trims
    for (const sx of [1, -1]) parts.push(box(0.04, 0.1, s.L * 0.55, sx * (s.W / 2 + 0.005), 0.32, 0, [0.08, 0.08, 0.09]));
  }
  // bumpers / grille
  parts.push(box(s.W * 0.98, 0.18, 0.12, 0, 0.42, s.L / 2, [0.12, 0.12, 0.13]));
  parts.push(box(s.W * 0.98, 0.18, 0.12, 0, 0.42, -s.L / 2, [0.12, 0.12, 0.13]));
  const geo = mergeGeometries(parts, false);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const lights = [];
  const fy = (model === 'truck' ? 1.0 : 0.62), ry = (model === 'truck' ? 0.9 : 0.68);
  for (const x of [s.W / 2 - 0.32, -s.W / 2 + 0.32]) {
    lights.push(box(0.36, 0.13, 0.06, x, fy, s.L / 2 + 0.02, [1, 0.95, 0.82]));
    lights.push(box(0.34, 0.12, 0.06, x, ry, -s.L / 2 - (s.cargo ? -0.0 : 0.02), [1, 0.05, 0.03]));
  }
  if (model === 'truck') lights.push(box(0.3, 0.12, 0.06, 0, 1.0, -3.62, [1, 0.05, 0.03]));
  const lgeo = mergeGeometries(lights, false);
  cache[ck] = { body: geo, lights: lgeo, spec: s, wheelPos };
  return cache[ck];
}

// A single wheel (tyre + hub) centred at origin, axle along X.
export function wheelGeometry(r) {
  return mergeGeometries([wheel(0, 0, r, 0.26), hub(0.02, 0, r, 0.26)].map((g) => { g.translate(0, -r, 0); return g; }), false);
}

export function taxiSignGeometry() {
  return box(0.6, 0.2, 0.25, 0, 1.55, -0.2, [1, 0.85, 0.2]);
}

export const CAR_COLORS = [
  0xf2f2f2, 0x111316, 0x9aa1a8, 0x5c6168, 0x8b1a1a, 0x1c3f7a, 0x2c5e3f, 0xd9d3c4, 0x6b4a2f, 0xb8860b, 0x3d6f8f, 0x7a1f4b, 0xc9c9c9, 0x2a2a2a,
];
