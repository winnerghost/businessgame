// On-foot player controller: walking, running, jumping, collisions, entering the car.
import * as THREE from 'three';
import { Character } from './character.js';
import { damp, wrapAngle } from '../core/utils.js';
import { groundHeight } from '../world/layout.js';

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.char = new Character();
    this.root = this.char.root;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.onGround = true;
    this.speed = 0;
    this.inCar = false;
    this.stamina = 1;
    this.radius = 0.35;
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, groundHeight(x, z), z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.sync();
  }

  update(dt, input, camRig, active) {
    if (this.inCar) return;
    const { f, r } = camRig.basis();
    const move = new THREE.Vector3();
    if (active) {
      if (input.down('KeyW') || input.down('ArrowUp')) move.add(f);
      if (input.down('KeyS') || input.down('ArrowDown')) move.sub(f);
      if (input.down('KeyD') || input.down('ArrowRight')) move.add(r);
      if (input.down('KeyA') || input.down('ArrowLeft')) move.sub(r);
    }
    const wants = move.lengthSq() > 0;
    const running = active && (input.down('ShiftLeft') || input.down('ShiftRight')) && this.stamina > 0.05;
    const maxSpeed = wants ? (running ? 8.2 : 3.4) : 0;
    if (wants) {
      move.normalize();
      const targetYaw = Math.atan2(move.x, move.z);
      this.yaw += wrapAngle(targetYaw - this.yaw) * (1 - Math.exp(-dt * 12));
    }
    this.stamina = Math.min(1, Math.max(0, this.stamina + (running && wants ? -0.06 : 0.12) * dt));
    const target = move.multiplyScalar(maxSpeed);
    const accel = this.onGround ? 10 : 2;
    this.vel.x = damp(this.vel.x, target.x, accel, dt);
    this.vel.z = damp(this.vel.z, target.z, accel, dt);

    if (active && input.hit('Space') && this.onGround) {
      this.vy = 5.2;
      this.onGround = false;
      this.ctx.audio?.play('jump');
    }
    this.vy -= 18 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vy * dt;
    const g = groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= g) {
      // allow stepping onto curbs
      this.pos.y = g;
      this.vy = 0;
      this.onGround = true;
    }
    this.ctx.collision.resolve(this.pos, this.radius, this.pos.y + 0.3);
    this.ctx.traffic?.pushOut(this.pos, this.radius + 0.9, null);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.char.animate(dt, this.speed, { airborne: !this.onGround });
    this.sync();
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
}
