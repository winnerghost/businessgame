// Static 2.5D collision: axis-aligned boxes (with height) and circles in a spatial hash.
import { clamp } from '../core/utils.js';

export class Collision {
  constructor(cell = 24) {
    this.cell = cell;
    this.grid = new Map();
    this.items = [];
    this._stamp = 0;
  }
  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  _insert(item, x0, z0, x1, z1) {
    const c = this.cell;
    for (let cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++) {
      for (let cz = Math.floor(z0 / c); cz <= Math.floor(z1 / c); cz++) {
        const k = this._key(cx, cz);
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(item);
      }
    }
  }
  addBox(x0, z0, x1, z1, h = 999, tag = null) {
    const it = { type: 'box', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, tag, _s: 0 };
    this.items.push(it);
    this._insert(it, it.x0, it.z0, it.x1, it.z1);
    return it;
  }
  addCircle(x, z, r, h = 999, tag = null) {
    const it = { type: 'circle', x, z, r, h, tag, _s: 0 };
    this.items.push(it);
    this._insert(it, x - r, z - r, x + r, z + r);
    return it;
  }
  query(x, z, r) {
    const out = [];
    const c = this.cell;
    const s = ++this._stamp;
    for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
      for (let cz = Math.floor((z - r) / c); cz <= Math.floor((z + r) / c); cz++) {
        const arr = this.grid.get(this._key(cx, cz));
        if (!arr) continue;
        for (const it of arr) if (it._s !== s) { it._s = s; out.push(it); }
      }
    }
    return out;
  }
  // Push a circle (p.x,p.z, radius r, at height y) out of static geometry. Returns contact normal or null.
  resolve(p, r, y = 0) {
    let hit = null;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (const it of this.query(p.x, p.z, r + 1)) {
        if (y > it.h) continue;
        if (it.type === 'box') {
          const cx = clamp(p.x, it.x0, it.x1), cz = clamp(p.z, it.z0, it.z1);
          let dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            let nx, nz, pen;
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              nx = dx / d; nz = dz / d; pen = r - d;
            } else {
              // centre inside the box: push out the nearest side
              const l = p.x - it.x0, rr = it.x1 - p.x, t = p.z - it.z0, b = it.z1 - p.z;
              const m = Math.min(l, rr, t, b);
              if (m === l) { nx = -1; nz = 0; pen = l + r; }
              else if (m === rr) { nx = 1; nz = 0; pen = rr + r; }
              else if (m === t) { nx = 0; nz = -1; pen = t + r; }
              else { nx = 0; nz = 1; pen = b + r; }
            }
            p.x += nx * pen; p.z += nz * pen;
            hit = { nx, nz, item: it };
            any = true;
          }
        } else {
          const dx = p.x - it.x, dz = p.z - it.z;
          const d2 = dx * dx + dz * dz, R = r + it.r;
          if (d2 < R * R && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            const nx = dx / d, nz = dz / d;
            p.x += nx * (R - d); p.z += nz * (R - d);
            hit = { nx, nz, item: it };
            any = true;
          }
        }
      }
      if (!any) break;
    }
    return hit;
  }
  // First hit fraction along a 3D segment against boxes (used by the camera).
  segment(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dz);
    let best = 1;
    const steps = Math.ceil(len / this.cell) + 1;
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      for (const it of this.query(ax + dx * t, az + dz * t, this.cell * 0.75)) {
        if (it.type !== 'box' || seen.has(it)) continue;
        seen.add(it);
        // slab test in 3D
        let tmin = 0, tmax = 1;
        const slabs = [[ax, dx, it.x0, it.x1], [ay, dy, -1, it.h], [az, dz, it.z0, it.z1]];
        let ok = true;
        for (const [o, d, lo, hi] of slabs) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } }
          else {
            let t1 = (lo - o) / d, t2 = (hi - o) / d;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
            if (tmin > tmax) { ok = false; break; }
          }
        }
        if (ok && tmin < best) best = tmin;
      }
    }
    return best;
  }
}
