// AI traffic: lane following on the road graph, traffic signals, car-following and turning curves.
import * as THREE from 'three';
import { CITY } from './layout.js';
import { carGeometry, CAR_COLORS } from './carModels.js';
import { RNG } from '../core/utils.js';

const MIX = [['sedan', 0.3], ['hatch', 0.22], ['suv', 0.18], ['van', 0.1], ['truck', 0.07], ['sports', 0.05], ['taxi', 0.08]];
const CYCLE = 34;

function bezier(p0, p1, p2, t, out) {
  const u = 1 - t;
  out.x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
  out.z = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
  return out;
}
function bezierTan(p0, p1, p2, t) {
  const x = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const z = 2 * (1 - t) * (p1.z - p0.z) + 2 * t * (p2.z - p1.z);
  return Math.atan2(x, z);
}

export class Traffic {
  constructor(ctx, layout, builder, count) {
    this.ctx = ctx;
    this.L = layout;
    this.rng = new RNG(4242);
    this.cars = [];
    this.time = 0;
    this.R2 = CITY.ROAD / 2;
    // adjacency
    this.adj = layout.nodes.map(() => []);
    for (const s of layout.segments) { this.adj[s.a.id].push(s.b.id); this.adj[s.b.id].push(s.a.id); }
    this.signalByNode = new Map();
    layout.signals.forEach((s, i) => this.signalByNode.set(s.node, { ...s, index: i, last: '' }));
    this.signalLamps = builder.signalLamps;
    this.signalLampAxis = builder.signalLampAxis;

    // instanced pools
    this.pools = {};
    const bodyMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 });
    const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    ctx.gfx.registerNightBasic(lightMat, 1.0, 4.0);
    const counts = {};
    const models = [];
    for (let i = 0; i < count; i++) {
      const m = this.rng.weighted(MIX, (x) => x[1])[0];
      models.push(m);
      const geoModel = m === 'taxi' ? 'sedan' : m;
      counts[geoModel] = (counts[geoModel] || 0) + 1;
    }
    for (const [model, n] of Object.entries(counts)) {
      const g = carGeometry(model);
      const body = new THREE.InstancedMesh(g.body, bodyMat, n);
      body.castShadow = ctx.gfx.q.shadows;
      body.receiveShadow = true;
      body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      body.frustumCulled = false;
      const lights = new THREE.InstancedMesh(g.lights, lightMat, n);
      lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      lights.frustumCulled = false;
      builder.group.add(body, lights);
      this.pools[model] = { body, lights, used: 0, spec: g.spec };
    }
    const col = new THREE.Color();
    for (const m of models) {
      const geoModel = m === 'taxi' ? 'sedan' : m;
      const pool = this.pools[geoModel];
      const idx = pool.used++;
      col.setHex(m === 'taxi' ? 0xf2c230 : m === 'truck' ? this.rng.pick([0xf2f2f2, 0x9aa1a8, 0x1c3f7a]) : this.rng.pick(CAR_COLORS));
      pool.body.setColorAt(idx, col);
      const car = {
        model: geoModel, pool, idx, L: pool.spec.L, W: pool.spec.W,
        pos: new THREE.Vector3(), yaw: 0, speed: 0, cruise: this.rng.float(10.5, 14.5) * (m === 'truck' ? 0.8 : 1),
        a: 0, b: 0, next: 0, s: 0, phase: 'road', t: 0, turn: null, stuck: 0, ghost: 0,
      };
      this.spawnRandom(car);
      this.cars.push(car);
    }
    for (const p of Object.values(this.pools)) if (p.body.instanceColor) p.body.instanceColor.needsUpdate = true;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
  }

  nodePos(id) { return this.L.nodes[id]; }

  spawnRandom(car, near = null) {
    for (let tries = 0; tries < 30; tries++) {
      const seg = this.L.segments[this.rng.int(0, this.L.segments.length - 1)];
      const fwd = this.rng.chance(0.5);
      const a = fwd ? seg.a.id : seg.b.id, b = fwd ? seg.b.id : seg.a.id;
      const s = this.rng.float(5, CITY.PITCH - CITY.ROAD - 10);
      this.setRoad(car, a, b, s);
      if (near) {
        const d = Math.hypot(car.pos.x - near.x, car.pos.z - near.z);
        if (d < 90 || d > 360) continue;
        if (near.camF) {
          const dx = car.pos.x - near.x, dz = car.pos.z - near.z;
          if ((dx * near.camF.x + dz * near.camF.z) / d > 0.2 && d < 220) continue; // don't pop in view
        }
      }
      let ok = true;
      for (const o of this.cars) if (o !== car && o.pos.distanceToSquared(car.pos) < 100) { ok = false; break; }
      if (ok) break;
    }
    car.speed = car.cruise * 0.6;
  }

  setRoad(car, a, b, s = 0) {
    car.a = a; car.b = b; car.s = s; car.phase = 'road'; car.t = 0;
    const A = this.nodePos(a), B = this.nodePos(b);
    car.dx = Math.sign(B.x - A.x); car.dz = Math.sign(B.z - A.z);
    car.len = CITY.PITCH - CITY.ROAD;
    car.axis = car.dx !== 0 ? 'x' : 'z';
    // plan the next node
    const opts = this.adj[b].filter((n) => n !== a);
    if (!opts.length) car.next = a;
    else {
      const straight = opts.find((n) => { const N = this.nodePos(n); return Math.sign(N.x - B.x) === car.dx && Math.sign(N.z - B.z) === car.dz; });
      car.next = straight !== undefined && this.rng.chance(0.55) ? straight : this.rng.pick(opts);
    }
    this.roadPos(car);
  }

  roadPos(car) {
    const A = this.nodePos(car.a);
    const rx = -car.dz, rz = car.dx;
    car.pos.set(A.x + car.dx * (this.R2 + car.s) + rx * CITY.LANE, 0, A.z + car.dz * (this.R2 + car.s) + rz * CITY.LANE);
    car.yaw = Math.atan2(car.dx, car.dz);
  }

  beginTurn(car) {
    const B = this.nodePos(car.b), C = this.nodePos(car.next);
    const d1 = { x: car.dx, z: car.dz };
    const d2 = { x: Math.sign(C.x - B.x), z: Math.sign(C.z - B.z) };
    const p0 = { x: B.x - d1.x * this.R2 + -d1.z * CITY.LANE, z: B.z - d1.z * this.R2 + d1.x * CITY.LANE };
    const p2 = { x: B.x + d2.x * this.R2 + -d2.z * CITY.LANE, z: B.z + d2.z * this.R2 + d2.x * CITY.LANE };
    let p1;
    const straight = d1.x === d2.x && d1.z === d2.z;
    if (straight) p1 = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
    else if (d1.x === -d2.x && d1.z === -d2.z) p1 = { x: B.x + d1.x * this.R2, z: B.z + d1.z * this.R2 }; // u-turn
    else {
      const k = (p2.x - p0.x) * d1.x + (p2.z - p0.z) * d1.z;
      p1 = { x: p0.x + d1.x * k, z: p0.z + d1.z * k };
    }
    let len = 0;
    const a = { x: 0, z: 0 }, b = { x: p0.x, z: p0.z };
    for (let i = 1; i <= 8; i++) { bezier(p0, p1, p2, i / 8, a); len += Math.hypot(a.x - b.x, a.z - b.z); b.x = a.x; b.z = a.z; }
    car.turn = { p0, p1, p2, len: Math.max(1, len), straight };
    car.phase = 'turn';
    car.t = 0;
  }

  signalState(nodeId, axis) {
    const sig = this.signalByNode.get(nodeId);
    if (!sig) return 'G';
    const t = (this.time + sig.phase) % CYCLE;
    if (axis === 'x') return t < 14 ? 'G' : t < 17 ? 'A' : 'R';
    return t < 17 ? 'R' : t < 31 ? 'G' : 'A';
  }

  update(dt, focus, camF) {
    this.time += dt;
    const cars = this.cars;
    const player = this.ctx.player, veh = this.ctx.vehicle;
    const obstacles = [];
    if (player && !player.inCar) obstacles.push({ x: player.pos.x, z: player.pos.z, r: 0.6, ped: true });
    if (veh && veh.spec) obstacles.push({ x: veh.pos.x, z: veh.pos.z, r: veh.length / 2, yaw: veh.yaw });

    for (const c of cars) {
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      // car-following
      let gap = 60;
      if (c.ghost > 0) c.ghost -= dt;
      else {
        for (const o of cars) {
          if (o === c) continue;
          const rx = o.pos.x - c.pos.x, rz = o.pos.z - c.pos.z;
          const ahead = rx * fx + rz * fz;
          if (ahead <= 0 || ahead > 35) continue;
          const lat = Math.abs(rx * fz - rz * fx);
          if (lat > 1.9) continue;
          const align = fx * Math.sin(o.yaw) + fz * Math.cos(o.yaw);
          if (align < 0.2 && c.phase !== 'turn') continue;
          gap = Math.min(gap, ahead - (c.L + o.L) / 2);
        }
        for (const o of obstacles) {
          const rx = o.x - c.pos.x, rz = o.z - c.pos.z;
          const ahead = rx * fx + rz * fz;
          if (ahead <= 0 || ahead > 30) continue;
          const lat = Math.abs(rx * fz - rz * fx);
          if (lat > (o.ped ? 2.2 : 2.4)) continue;
          gap = Math.min(gap, ahead - c.L / 2 - o.r);
        }
      }
      let desired = c.cruise;
      desired = Math.min(desired, Math.max(0, gap - 2.5) * 0.85);
      if (c.phase === 'road') {
        const remain = c.len - c.s;
        const st = this.signalState(c.b, c.axis);
        const stopDist = remain - c.L / 2 - 1.0;
        if (st !== 'G' && !(st === 'A' && stopDist < 4)) {
          if (stopDist > -1) desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 4.5 * Math.max(0, stopDist - 0.5))));
        }
        // slow for turns
        const N = this.nodePos(c.next), B = this.nodePos(c.b);
        const turning = Math.sign(N.x - B.x) !== c.dx || Math.sign(N.z - B.z) !== c.dz;
        if (turning && remain < 25) desired = Math.min(desired, 6 + remain * 0.25);
      } else {
        desired = Math.min(desired, c.turn.straight ? c.cruise : 6.5);
      }
      if (desired > c.speed) c.speed = Math.min(desired, c.speed + 3.2 * dt);
      else c.speed = Math.max(desired, c.speed - 9 * dt);
      if (c.speed < 0.2 && gap < 8) {
        c.stuck += dt;
        if (c.stuck > 7) { c.ghost = 3; c.stuck = 0; }
      } else c.stuck = Math.max(0, c.stuck - dt);

      // advance
      if (c.phase === 'road') {
        c.s += c.speed * dt;
        if (c.s >= c.len) { this.beginTurn(c); c.t = 0; }
        else this.roadPos(c);
      }
      if (c.phase === 'turn') {
        c.t += (c.speed * dt) / c.turn.len;
        if (c.t >= 1) {
          const prev = c.b;
          this.setRoad(c, prev, c.next, (c.t - 1) * c.turn.len);
        } else {
          bezier(c.turn.p0, c.turn.p1, c.turn.p2, c.t, c.pos);
          c.yaw = bezierTan(c.turn.p0, c.turn.p1, c.turn.p2, c.t);
        }
      }
      // keep traffic around the player
      const dfx = c.pos.x - focus.x, dfz = c.pos.z - focus.z;
      if (dfx * dfx + dfz * dfz > 420 * 420) this.spawnRandom(c, { x: focus.x, z: focus.z, camF });
    }
    // write instances
    const m = this._m, q = this._q;
    for (const c of cars) {
      q.setFromAxisAngle(this._up, c.yaw);
      m.compose(c.pos, q, this._s);
      c.pool.body.setMatrixAt(c.idx, m);
      c.pool.lights.setMatrixAt(c.idx, m);
    }
    for (const p of Object.values(this.pools)) { p.body.instanceMatrix.needsUpdate = true; p.lights.instanceMatrix.needsUpdate = true; }
    this.updateSignals();
  }

  updateSignals() {
    if (!this.signalLamps) return;
    const col = new THREE.Color();
    let dirty = false;
    for (const sig of this.signalByNode.values()) {
      const sx = this.signalState(sig.node, 'x'), sz = this.signalState(sig.node, 'z');
      const key = sx + sz;
      if (key === sig.last) continue;
      sig.last = key;
      dirty = true;
      for (let k = 0; k < 4; k++) {
        const i = sig.index * 4 + k;
        const st = this.signalLampAxis[i] === 'x' ? sx : sz;
        col.setRGB(...(st === 'G' ? [0.1, 1, 0.35] : st === 'A' ? [1, 0.65, 0.05] : [1, 0.06, 0.04]));
        this.signalLamps.setColorAt(i, col);
      }
    }
    if (dirty && this.signalLamps.instanceColor) this.signalLamps.instanceColor.needsUpdate = true;
  }

  // Push a circle out of traffic cars. Returns contact normal or null.
  pushOut(pos, r, vehicle) {
    let hit = null;
    for (const c of this.cars) {
      const dx0 = pos.x - c.pos.x, dz0 = pos.z - c.pos.z;
      if (dx0 * dx0 + dz0 * dz0 > 100) continue;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      for (const off of [c.L * 0.25, -c.L * 0.25]) {
        const cx = c.pos.x + fx * off, cz = c.pos.z + fz * off;
        const dx = pos.x - cx, dz = pos.z - cz;
        const R = r + c.W * 0.6;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (R - d); pos.z += (dz / d) * (R - d);
          hit = { nx: dx / d, nz: dz / d, car: c };
          if (vehicle) { c.speed *= 0.3; c.stuck = 0; }
        }
      }
    }
    return hit;
  }
}
