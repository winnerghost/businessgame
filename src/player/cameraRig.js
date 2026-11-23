// Third-person orbit camera with collision, auto-follow when driving, and shake.
import * as THREE from 'three';
import { clamp, damp, wrapAngle } from '../core/utils.js';

export class CameraRig {
  constructor(camera, ctx) {
    this.cam = camera;
    this.ctx = ctx;
    this.yaw = Math.PI;
    this.pitch = 0.22;
    this.dist = 6;
    this.targetDist = 6;
    this.focus = new THREE.Vector3();
    this.idleLook = 0;
    this.shakeAmt = 0;
    this.sensitivity = 1;
    this.mode = 'foot';
    this.fov = 60;
  }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  update(dt, input, target, { driving = false, heading = 0, speed = 0 } = {}) {
    const look = input.consumeLook();
    const s = 0.0025 * this.sensitivity;
    if (look.dx || look.dy) this.idleLook = 0; else this.idleLook += dt;
    this.yaw -= look.dx * s;
    this.pitch = clamp(this.pitch + look.dy * s, -0.35, 1.25);
    const w = input.consumeWheel();
    if (driving !== (this.mode === 'car')) {
      this.mode = driving ? 'car' : 'foot';
      this.targetDist = driving ? 9.5 : 6;
    }
    if (w) this.targetDist = clamp(this.targetDist + w * (driving ? 1.2 : 0.8), driving ? 5 : 2.2, driving ? 22 : 14);
    if (driving && this.idleLook > 1.2 && Math.abs(speed) > 2) {
      const behind = heading + (speed < -1 ? 0 : Math.PI);
      this.yaw += wrapAngle(behind - this.yaw) * (1 - Math.exp(-dt * 2.2));
      this.pitch = damp(this.pitch, 0.2, 1.5, dt);
    }
    this.dist = damp(this.dist, this.targetDist, 6, dt);
    const fh = driving ? 1.7 : 1.55;
    this.focus.set(target.x, target.y + fh, target.z);

    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    let d = this.dist;
    const col = this.ctx.collision;
    if (col) {
      const end = this.focus.clone().addScaledVector(off, d);
      const t = col.segment(this.focus.x, this.focus.y, this.focus.z, end.x, end.y, end.z);
      if (t < 1) d = Math.max(1.0, d * t - 0.4);
    }
    const pos = this.focus.clone().addScaledVector(off, d);
    if (pos.y < 0.4) pos.y = 0.4;
    // speed FOV kick
    const targetFov = 60 + (driving ? clamp(Math.abs(speed) - 15, 0, 40) * 0.35 : 0);
    this.fov = damp(this.fov, targetFov, 3, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }

    if (this.shakeAmt > 0.001) {
      pos.x += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      pos.y += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      this.shakeAmt = damp(this.shakeAmt, 0, 6, dt);
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(this.focus);
  }
  // camera-relative movement basis
  basis() {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    return { f, r };
  }
}
