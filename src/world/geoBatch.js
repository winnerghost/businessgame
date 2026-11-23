// Accumulates quads/boxes into one BufferGeometry (positions, normals, uvs, colours).
import * as THREE from 'three';

export class GeoBatch {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this.n = 0;
  }
  // p: 4 corners [x,y,z] counter-clockwise when viewed from the front; uv: 4 [u,v]
  quad(p0, p1, p2, p3, normal, uvs, color = [1, 1, 1]) {
    const b = this.n;
    for (const p of [p0, p1, p2, p3]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(normal[0], normal[1], normal[2]); this.col.push(color[0], color[1], color[2]); }
    for (const t of uvs) this.uv.push(t[0], t[1]);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n += 4;
  }
  tri(p0, p1, p2, color = [1, 1, 1]) {
    const a = new THREE.Vector3(...p0), bb = new THREE.Vector3(...p1), c = new THREE.Vector3(...p2);
    const nrm = bb.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const b = this.n;
    for (const p of [p0, p1, p2]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nrm.x, nrm.y, nrm.z); this.col.push(color[0], color[1], color[2]); this.uv.push(0, 0); }
    this.idx.push(b, b + 1, b + 2);
    this.n += 3;
  }
  // Axis-aligned box; uvMode: 'world' (scale metres) or 'unit'
  box(cx, y0, cz, w, h, d, color = [1, 1, 1], { bottom = false, top = true, uvScale = 0 } = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const s = uvScale || 2;
    const U = (a, b) => [[0, 0], [a / s, 0], [a / s, b / s], [0, b / s]];
    // +z (south) face
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], U(w, h), color);
    // -z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], U(w, h), color);
    // +x
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], U(d, h), color);
    // -x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], U(d, h), color);
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], U(w, d), color);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], U(w, d), color);
  }
  cylinder(cx, y0, cz, r, h, color = [1, 1, 1], segs = 12, top = true) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const am = (a0 + a1) / 2;
      this.quad([cx + c1 * r, y0, cz + s1 * r], [cx + c0 * r, y0, cz + s0 * r], [cx + c0 * r, y0 + h, cz + s0 * r], [cx + c1 * r, y0 + h, cz + s1 * r],
        [Math.cos(am), 0, Math.sin(am)], [[(i + 1) / segs, 0], [i / segs, 0], [i / segs, 1], [(i + 1) / segs, 1]], color);
      if (top) this.tri([cx, y0 + h, cz], [cx + c1 * r, y0 + h, cz + s1 * r], [cx + c0 * r, y0 + h, cz + s0 * r], color);
    }
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  get empty() { return this.n === 0; }
}
