// Player-drivable car with arcade physics, spinning/steering wheels, lights and body roll.
import * as THREE from 'three';
import { carGeometry, wheelGeometry } from '../world/carModels.js';
import { VEHICLES } from '../game/data/vehicles.js';
import { clamp, damp, wrapAngle } from '../core/utils.js';
import { groundHeight } from '../world/layout.js';

export class PlayerVehicle {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0; // signed, along heading
    this.lat = 0; // lateral slip velocity
    this.steer = 0;
    this.roll = 0;
    this.pitch = 0;
    this.occupied = false;
    this.wheels = [];
    this.spec = null;
    this.headlight = new THREE.SpotLight(0xfff2dd, 0, 60, 0.5, 0.5, 1.2);
    this.headlight.position.set(0, 0.8, 1.8);
    this.headlight.target.position.set(0, 0, 14);
    this.body.add(this.headlight, this.headlight.target);
    this.hitCooldown = 0;
    this.horn = 0;
  }

  setModel(vehicleId, color) {
    const v = VEHICLES[vehicleId] || VEHICLES.civara;
    this.spec = v;
    for (const c of [...this.body.children]) if (c !== this.headlight && c !== this.headlight.target) this.body.remove(c);
    const g = carGeometry(v.model, { wheels: false });
    this.paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: color ?? v.color, roughness: 0.32, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5 });
    const mesh = new THREE.Mesh(g.body, this.paint);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.body.add(mesh);
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.body.add(new THREE.Mesh(g.lights, this.lightMat));
    this.wheels = [];
    const wg = wheelGeometry(g.spec.wheelR);
    const wm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    for (const w of g.wheelPos) {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, g.spec.wheelR, w.z);
      const m = new THREE.Mesh(wg, wm);
      m.castShadow = true;
      pivot.add(m);
      this.root.add(pivot);
      this.wheels.push({ pivot, mesh: m, front: w.front, x: w.x, z: w.z });
    }
    this.wheelR = g.spec.wheelR;
    this.length = g.spec.L;
    this.width = g.spec.W;
    this.headlight.position.z = g.spec.L / 2;
  }

  place(x, z, yaw) {
    this.pos.set(x, groundHeight(x, z), z);
    this.yaw = yaw;
    this.speed = 0; this.lat = 0;
    this.syncMesh();
  }

  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get kmh() { return Math.abs(this.speed) * 3.6; }

  update(dt, input, active) {
    const spec = this.spec;
    let throttle = 0, steerIn = 0, brake = false;
    if (active) {
      if (input.down('KeyW') || input.down('ArrowUp')) throttle += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) throttle -= 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) steerIn += 1;
      if (input.down('KeyD') || input.down('ArrowRight')) steerIn -= 1;
      brake = input.down('Space');
    }
    const top = spec.top;
    // longitudinal
    if (throttle > 0) {
      if (this.speed < -0.5) this.speed += 18 * dt; // braking from reverse
      else this.speed += spec.accel * (1 - Math.pow(Math.max(0, this.speed) / top, 2)) * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= 20 * dt; // brake
      else this.speed -= spec.accel * 0.6 * (1 - Math.min(1, -this.speed / (top * 0.3))) * dt;
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (1.2 + Math.abs(this.speed) * 0.04) * dt);
    }
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    this.speed -= this.speed * 0.02 * dt;

    // steering
    const sp = Math.abs(this.speed);
    const maxSteer = 0.6 / (1 + sp * 0.045);
    this.steer = damp(this.steer, steerIn * maxSteer, 8, dt);
    const wheelBase = this.length * 0.62;
    const yawRate = (this.speed / wheelBase) * Math.tan(this.steer);
    this.yaw = wrapAngle(this.yaw + yawRate * dt);

    // lateral slip (drift when handbraking)
    const grip = (brake ? 1.6 : 7.5) * spec.grip;
    this.lat += -yawRate * this.speed * 0.12 * dt * (brake ? 2.5 : 1);
    this.lat = damp(this.lat, 0, grip, dt);

    const f = this.forward;
    const right = new THREE.Vector3(-f.z, 0, f.x);
    const prev = this.pos.clone();
    this.pos.addScaledVector(f, this.speed * dt).addScaledVector(right, this.lat * dt);

    // collisions vs static world (two circles along the body)
    const col = this.ctx.collision;
    let hit = null;
    const r = this.width * 0.55;
    for (const off of [this.length * 0.3, -this.length * 0.3]) {
      const c = { x: this.pos.x + f.x * off, z: this.pos.z + f.z * off };
      const h = col.resolve(c, r, 0.5);
      if (h) {
        this.pos.x = c.x - f.x * off; this.pos.z = c.z - f.z * off;
        hit = h;
      }
    }
    // traffic
    const traffic = this.ctx.traffic;
    if (traffic) {
      const th = traffic.pushOut(this.pos, Math.max(this.length, 3) * 0.45, this);
      if (th) hit = hit || th;
    }
    this.hitCooldown -= dt;
    if (hit) {
      const n = new THREE.Vector3(hit.nx, 0, hit.nz);
      const impact = Math.abs(f.dot(n) * this.speed);
      if (impact > 4 && this.hitCooldown <= 0) {
        this.hitCooldown = 0.5;
        this.ctx.bus.emit('carImpact', impact);
        this.ctx.camRig?.shake(Math.min(1, impact / 20));
      }
      this.speed *= f.dot(n) < -0.3 ? -0.25 : 0.82;
    }
    const ground = groundHeight(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, ground, 12, dt);
    this.velocity = this.pos.clone().sub(prev).divideScalar(Math.max(dt, 1e-4));

    // visual dynamics
    const accelFeel = clamp(throttle * (1 - sp / top), -1, 1);
    this.pitch = damp(this.pitch, -accelFeel * 0.025 + (brake || (throttle < 0 && this.speed > 1) ? 0.03 : 0), 5, dt);
    this.roll = damp(this.roll, clamp(-yawRate * this.speed * 0.006, -0.07, 0.07), 6, dt);
    for (const w of this.wheels) {
      w.mesh.rotation.x += (this.speed / this.wheelR) * dt;
      w.pivot.rotation.y = w.front ? this.steer : 0;
    }
    const lights = this.ctx.gfx.lightsOn ?? 0;
    this.headlight.intensity = active || this.occupied ? lights * 60 : 0;
    this.lightMat.color.setScalar(1 + lights * 3 + (throttle < 0 || brake ? 1.5 : 0));
    this.syncMesh();
  }

  syncMesh() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.body.rotation.set(this.pitch, 0, this.roll);
  }
}
