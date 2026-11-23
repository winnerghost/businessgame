// Procedurally-built, procedurally-animated humanoid for the player.
import * as THREE from 'three';

function capsule(r, len, mat) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

export class Character {
  constructor({ suit = 0x1f2a3a, shirt = 0xf2f2f2, tie = 0x8b1d2c, skin = 0xd9a77f, hair = 0x2b1d14, pants = null } = {}) {
    const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    this.mats = { suit: M(suit, 0.65), shirt: M(shirt, 0.6), tie: M(tie, 0.5), skin: M(skin, 0.55), hair: M(hair, 0.9), shoe: M(0x111111, 0.35, 0.2), pants: M(pants ?? suit, 0.7) };
    const g = (this.root = new THREE.Group());
    this.hips = new THREE.Group();
    this.hips.position.y = 0.98;
    g.add(this.hips);

    // torso
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.25, 2, 2, 2), this.mats.suit);
    chest.geometry.translate(0, 0.33, 0);
    roundBox(chest.geometry, 0.07);
    chest.castShadow = true;
    this.torso.add(chest);
    const shirtV = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.26), this.mats.shirt);
    shirtV.position.set(0, 0.47, 0.128);
    this.torso.add(shirtV);
    const tieM = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.24), this.mats.tie);
    tieM.position.set(0, 0.44, 0.131);
    this.torso.add(tieM);
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.22), this.mats.pants);
    pelvis.position.y = 0.0;
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    // head
    this.neck = new THREE.Group();
    this.neck.position.y = 0.62;
    this.torso.add(this.neck);
    const neckM = capsule(0.055, 0.06, this.mats.skin);
    neckM.position.y = 0.04;
    this.neck.add(neckM);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 16), this.mats.skin);
    head.scale.set(0.92, 1.08, 1);
    head.position.y = 0.2;
    head.castShadow = true;
    this.neck.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.132, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mats.hair);
    hairM.position.set(0, 0.215, -0.008);
    hairM.scale.set(0.95, 1.05, 1.04);
    this.neck.add(hairM);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), this.mats.skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.19, 0.125);
    this.neck.add(nose);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), eyeMat);
      e.position.set(s * 0.042, 0.225, 0.11);
      this.neck.add(e);
    }

    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.27, 0.55, 0);
      this.torso.add(sh);
      const upper = capsule(0.06, 0.22, this.mats.suit);
      upper.position.y = -0.15;
      sh.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      sh.add(elbow);
      const fore = capsule(0.052, 0.2, this.mats.suit);
      fore.position.y = -0.13;
      elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), this.mats.skin);
      hand.position.y = -0.29;
      hand.scale.set(0.9, 1.2, 0.7);
      elbow.add(hand);
      this.arms.push({ sh, elbow, side: s });
    }
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.11, -0.02, 0);
      this.hips.add(hip);
      const thigh = capsule(0.075, 0.3, this.mats.pants);
      thigh.position.y = -0.22;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      hip.add(knee);
      const shin = capsule(0.065, 0.3, this.mats.pants);
      shin.position.y = -0.2;
      knee.add(shin);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.26), this.mats.shoe);
      roundBox(shoe.geometry, 0.03);
      shoe.position.set(0, -0.45, 0.05);
      shoe.castShadow = true;
      knee.add(shoe);
      this.legs.push({ hip, knee, side: s });
    }
    this.phase = 0;
    this.airborne = false;
  }

  // speed: m/s along ground; run factor 0..1
  animate(dt, speed, { airborne = false, sitting = false } = {}) {
    const moving = speed > 0.2;
    const k = Math.min(1, speed / 7);
    this.phase += dt * (moving ? 3.2 + speed * 1.05 : 0);
    const swing = moving ? 0.35 + 0.55 * k : 0;
    const p = this.phase;
    const t = performance.now() / 1000;
    for (const l of this.legs) {
      const ph = p + (l.side > 0 ? Math.PI : 0);
      const target = airborne ? -0.5 : Math.sin(ph) * swing;
      l.hip.rotation.x += (target - l.hip.rotation.x) * Math.min(1, dt * 14);
      const kn = airborne ? 0.9 : moving ? Math.max(0, -Math.cos(ph)) * (0.5 + k * 0.9) : 0.02;
      l.knee.rotation.x += (kn - l.knee.rotation.x) * Math.min(1, dt * 14);
    }
    for (const a of this.arms) {
      const ph = p + (a.side > 0 ? 0 : Math.PI);
      const target = airborne ? -2.4 : Math.sin(ph) * swing * 0.9;
      a.sh.rotation.x += (target - a.sh.rotation.x) * Math.min(1, dt * 12);
      a.sh.rotation.z = a.side * (0.08 + (airborne ? 0.3 : 0));
      const el = moving ? -0.25 - k * 0.9 : -0.12;
      a.elbow.rotation.x += (el - a.elbow.rotation.x) * Math.min(1, dt * 10);
    }
    const bob = moving ? Math.abs(Math.sin(p)) * 0.05 * (0.5 + k) : Math.sin(t * 1.6) * 0.008;
    this.hips.position.y = 0.98 + bob - (sitting ? 0.3 : 0);
    this.torso.rotation.x = moving ? 0.05 + k * 0.18 : 0;
    this.torso.rotation.y = moving ? Math.sin(p) * 0.08 * k : 0;
    this.neck.rotation.x = -this.torso.rotation.x * 0.6;
  }
}

// Push box vertices outward toward a rounded shape (cheap bevel look)
function roundBox(geo, r) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const c = bb.getCenter(new THREE.Vector3());
  const h = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c);
    const inner = new THREE.Vector3(
      Math.max(-h.x + r, Math.min(h.x - r, v.x)),
      Math.max(-h.y + r, Math.min(h.y - r, v.y)),
      Math.max(-h.z + r, Math.min(h.z - r, v.z)),
    );
    const d = v.clone().sub(inner);
    if (d.lengthSq() > 1e-9) d.setLength(r);
    v.copy(inner).add(d).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
}
