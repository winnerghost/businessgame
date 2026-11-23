// World interaction markers: light beams, ground rings and floating badges.
import * as THREE from 'three';
import { badgeTexture, beamTexture } from '../engine/textures.js';

const texCache = new Map();
function badge(label, color) {
  const k = label + color;
  if (!texCache.has(k)) texCache.set(k, badgeTexture(label, color));
  return texCache.get(k);
}

export class Markers {
  constructor(ctx, scene) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'markers';
    scene.add(this.group);
    this.items = new Map();
    this.beamTex = beamTexture();
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
    this.ringGeo = new THREE.RingGeometry(0.75, 1, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.time = 0;
  }

  add(o) {
    if (this.items.has(o.id)) this.remove(o.id);
    const m = {
      radius: 3.2, range: 220, beamH: 14, beamR: 0.9, scale: 1.0, enabled: true, ...o,
    };
    const g = new THREE.Group();
    g.position.set(m.x, 0.17, m.z);
    const col = new THREE.Color(m.color);
    if (m.beamH > 0) {
      const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ map: this.beamTex, color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      beam.scale.set(m.beamR, m.beamH, m.beamR);
      g.add(beam);
      m.beam = beam;
    }
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.scale.setScalar(m.radius * 0.6);
    g.add(ring);
    m.ring = ring;
    if (m.label) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: badge(m.label, m.color), depthWrite: false, transparent: true, fog: false }));
      sp.scale.setScalar(m.scale);
      sp.position.y = 3.6;
      sp.renderOrder = 5;
      g.add(sp);
      m.sprite = sp;
    }
    this.group.add(g);
    m.obj = g;
    this.items.set(m.id, m);
    return m;
  }

  remove(id) {
    const m = this.items.get(id);
    if (!m) return;
    this.group.remove(m.obj);
    m.obj.traverse((o) => { if (o.material) o.material.dispose(); });
    this.items.delete(id);
  }
  has(id) { return this.items.has(id); }
  get(id) { return this.items.get(id); }
  clearKind(kind) { for (const [id, m] of [...this.items]) if (m.kind === kind) this.remove(id); }

  // returns nearest interactable marker within its radius
  update(dt, pos) {
    this.time += dt;
    let best = null, bestD = Infinity;
    for (const m of this.items.values()) {
      const dx = m.x - pos.x, dz = m.z - pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const vis = m.enabled && (m.visible ? m.visible() : true) && d < m.range;
      m.obj.visible = vis;
      if (!vis) continue;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + m.x);
      m.ring.material.opacity = 0.35 + pulse * 0.45;
      m.ring.scale.setScalar(m.radius * (0.55 + pulse * 0.1));
      if (m.sprite) {
        m.sprite.position.y = 3.6 + Math.sin(this.time * 2 + m.z) * 0.12;
        const s = m.scale * Math.max(1, d / 30);
        m.sprite.scale.setScalar(Math.min(s, m.scale * 5));
        if (m.kind === 'objective') m.sprite.position.y = 3.6 + Math.min(40, d * 0.05);
      }
      if (m.beam) m.beam.material.opacity = (m.kind === 'objective' ? 0.55 : 0.4) * Math.min(1, Math.max(0, (d - 6) / 30));
      if (m.sprite) m.sprite.material.opacity = Math.min(1, Math.max(0.15, (d - 2) / 8));
      if (m.onInteract && d < m.radius && d < bestD) { best = m; bestD = d; }
    }
    return best;
  }
}
