// Instanced pedestrians walking sidewalk loops around blocks, reacting to the player.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITY } from './layout.js';
import { DISTRICTS } from '../game/data/districts.js';
import { RNG, smoothstep } from '../core/utils.js';

const SHIRTS = [0x2b4c7e, 0x7a1f1f, 0xe8e2d0, 0x2f5d3a, 0x444444, 0xc78a24, 0x6a3d7a, 0x1d1d1d, 0x8fa3b8, 0xb85c38, 0xd8d8d8, 0x3a6f8f];
const PANTS = [0x1f2633, 0x2b2b2b, 0x4a4036, 0x3b4a5a, 0x6b6b6b, 0x23324a];
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa1665e];

export class Pedestrians {
  constructor(ctx, layout, group, count) {
    this.ctx = ctx;
    this.L = layout;
    const rng = (this.rng = new RNG(777));
    const blocks = layout.blocks.filter((b) => b.district !== 'park' || true);
    const weight = (b) => (DISTRICTS[b.district]?.foot ?? 0.3) + (b.district === 'park' ? 0.3 : 0);
    this.peds = [];
    const SW = CITY.SIDEWALK;
    for (let i = 0; i < count; i++) {
      const b = rng.weighted(blocks, weight);
      const inset = SW * rng.float(0.35, 0.75);
      const x0 = b.x0 + inset, x1 = b.x1 - inset, z0 = b.z0 + inset, z1 = b.z1 - inset;
      const w = x1 - x0, h = z1 - z0;
      this.peds.push({
        x0, z0, w, h, per: 2 * (w + h), p: rng.float(0, 2 * (w + h)), dir: rng.chance(0.5) ? 1 : -1,
        speed: rng.float(1.0, 1.7), phase: rng.float(0, 6), x: 0, z: 0, yaw: 0, off: 0, offV: 0,
        nightOk: rng.chance(0.35), scale: rng.float(0.92, 1.08), pause: 0,
      });
    }
    // geometry: torso+arms (shirt), head (skin), leg (pants)
    const torso = new THREE.CapsuleGeometry(0.19, 0.42, 3, 8); torso.scale(1, 1, 0.65); torso.translate(0, 1.22, 0);
    const armL = new THREE.CapsuleGeometry(0.055, 0.5, 2, 6); armL.translate(-0.25, 1.15, 0);
    const armR = armL.clone(); armR.translate(0.5, 0, 0);
    const bodyGeo = mergeGeometries([torso, armL, armR].map((g) => { g.deleteAttribute('uv'); return g; }));
    const headGeo = new THREE.SphereGeometry(0.12, 10, 8); headGeo.translate(0, 1.68, 0);
    const legGeo = new THREE.CapsuleGeometry(0.07, 0.72, 2, 6); legGeo.translate(0, -0.43, 0);
    const n = count;
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), Math.max(1, n));
      m.castShadow = ctx.gfx.q.shadows;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      group.add(m);
      return m;
    };
    this.body = mk(bodyGeo);
    this.head = mk(headGeo);
    // legs need 2 instances per ped
    this.legs = new THREE.InstancedMesh(legGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), Math.max(1, n * 2));
    this.legs.castShadow = ctx.gfx.q.shadows;
    this.legs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.legs.frustumCulled = false;
    group.add(this.legs);
    const c = new THREE.Color();
    this.peds.forEach((p, i) => {
      this.body.setColorAt(i, c.setHex(rng.pick(SHIRTS)));
      this.head.setColorAt(i, c.setHex(rng.pick(SKIN)));
      const pc = rng.pick(PANTS);
      this.legs.setColorAt(i * 2, c.setHex(pc));
      this.legs.setColorAt(i * 2 + 1, c.setHex(pc));
    });
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  pathPos(p, t) {
    t = ((t % p.per) + p.per) % p.per;
    if (t < p.w) return [p.x0 + t, p.z0, 1, 0];
    t -= p.w;
    if (t < p.h) return [p.x0 + p.w, p.z0 + t, 0, 1];
    t -= p.h;
    if (t < p.w) return [p.x0 + p.w - t, p.z0 + p.h, -1, 0];
    t -= p.w;
    return [p.x0, p.z0 + p.h - t, 0, -1];
  }

  update(dt, focus, nightFactor) {
    const player = this.ctx.player, veh = this.ctx.vehicle;
    const threats = [];
    if (player && !player.inCar) threats.push({ x: player.pos.x, z: player.pos.z, r: 1.1, v: 0 });
    if (veh && veh.spec) threats.push({ x: veh.pos.x, z: veh.pos.z, r: 3.2 + Math.abs(veh.speed) * 0.12, v: Math.abs(veh.speed) });
    const visibleFrac = 1 - smoothstep(0.2, 0.9, nightFactor) * 0.7;
    const m = this._m, q = this._q, e = this._e, v = this._v, s = this._s;
    const t = performance.now() / 1000;
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      const visible = p.nightOk || (i / this.peds.length) < visibleFrac;
      const dfx = p.x - focus.x, dfz = p.z - focus.z;
      const far = dfx * dfx + dfz * dfz > 300 * 300;
      if (!visible) {
        this.body.setMatrixAt(i, this._hidden); this.head.setMatrixAt(i, this._hidden);
        this.legs.setMatrixAt(i * 2, this._hidden); this.legs.setMatrixAt(i * 2 + 1, this._hidden);
        continue;
      }
      if (p.pause > 0) p.pause -= dt;
      else {
        p.p += p.speed * p.dir * dt;
        if (Math.random() < dt * 0.01) p.pause = 2 + Math.random() * 4;
      }
      const [x, z, tx, tz] = this.pathPos(p, p.p);
      // sidestep threats
      let push = 0;
      const nx = -tz * p.dir, nz = tx * p.dir; // left normal
      for (const th of threats) {
        const dx = x + nx * p.off - th.x, dz = z + nz * p.off - th.z;
        const d = Math.hypot(dx, dz);
        if (d < th.r + 1.5) {
          const side = dx * nx + dz * nz >= 0 ? 1 : -1;
          push += side * (th.r + 1.5 - d) * (th.v > 6 ? 4 : 1.5);
          if (th.v > 8 && d < th.r + 1) { p.pause = 0; p.speed = Math.min(3.5, p.speed + 0.3); }
        }
      }
      p.offV += (push - p.off * 1.5) * dt * 4;
      p.offV *= Math.exp(-dt * 4);
      p.off = Math.max(-1.6, Math.min(1.6, p.off + p.offV * dt));
      p.x = x + nx * p.off;
      p.z = z + nz * p.off;
      p.yaw = Math.atan2(tx * p.dir, tz * p.dir);
      if (far) {
        continue; // keep last matrix (cheap)
      }
      const moving = p.pause <= 0;
      p.phase += dt * p.speed * 4.2 * (moving ? 1 : 0);
      const bob = moving ? Math.abs(Math.sin(p.phase)) * 0.04 : Math.sin(t + i) * 0.005;
      const sc = p.scale;
      s.set(sc, sc, sc);
      e.set(0, p.yaw, 0);
      q.setFromEuler(e);
      v.set(p.x, 0.15 + bob, p.z);
      m.compose(v, q, s);
      this.body.setMatrixAt(i, m);
      this.head.setMatrixAt(i, m);
      const swing = moving ? Math.sin(p.phase) * 0.45 : 0;
      for (const side of [-1, 1]) {
        e.set(swing * side, p.yaw, 0, 'YXZ');
        q.setFromEuler(e);
        const lx = side * 0.1 * sc;
        v.set(p.x + Math.cos(p.yaw) * lx, 0.15 + 0.9 * sc + bob, p.z - Math.sin(p.yaw) * lx);
        m.compose(v, q, s);
        this.legs.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m);
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    this.legs.instanceMatrix.needsUpdate = true;
  }
}
