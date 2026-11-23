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
const SPECS = {
  sedan: {
    L: 4.6, W: 1.85, wheelR: 0.34,
    body: [[-2.3, 0.3], [2.3, 0.3], [2.32, 0.62], [2.2, 0.82], [0.95, 0.92], [-1.6, 0.95], [-2.28, 0.86]],
    cabin: [[-1.45, 0.92], [0.85, 0.92], [0.2, 1.42], [-1.0, 1.44]],
  },
  hatch: {
    L: 4.0, W: 1.78, wheelR: 0.32,
    body: [[-1.98, 0.3], [2.0, 0.3], [2.02, 0.6], [1.9, 0.8], [0.8, 0.9], [-1.95, 0.95]],
    cabin: [[-1.92, 0.93], [0.72, 0.9], [0.05, 1.45], [-1.75, 1.47]],
  },
  suv: {
    L: 4.8, W: 1.98, wheelR: 0.4,
    body: [[-2.4, 0.38], [2.4, 0.38], [2.42, 0.78], [2.3, 1.02], [1.15, 1.1], [-2.38, 1.12]],
    cabin: [[-2.32, 1.1], [1.05, 1.1], [0.45, 1.78], [-2.2, 1.8]],
  },
  sports: {
    L: 4.5, W: 1.95, wheelR: 0.34,
    body: [[-2.25, 0.25], [2.25, 0.25], [2.3, 0.48], [2.0, 0.66], [0.7, 0.8], [-1.6, 0.86], [-2.25, 0.78]],
    cabin: [[-1.25, 0.8], [0.55, 0.8], [-0.05, 1.18], [-0.95, 1.2]],
  },
  van: {
    L: 5.3, W: 2.05, wheelR: 0.38,
    body: [[-2.65, 0.35], [2.65, 0.35], [2.67, 0.95], [2.4, 1.15], [1.8, 1.25], [-2.65, 1.25]],
    cabin: [[-2.62, 1.22], [1.75, 1.22], [1.25, 2.25], [-2.6, 2.3]],
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
