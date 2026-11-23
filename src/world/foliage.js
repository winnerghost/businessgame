// Leaf-card trees: tapered trunks with branches and alpha-tested leaf clusters (instancing-friendly).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RNG } from '../core/utils.js';

function leafTexture(kind) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const r = new RNG(kind === 'pine' ? 11 : kind === 'palm' ? 12 : 10);
  x.clearRect(0, 0, S, S);
  if (kind === 'palm') {
    // a single frond: central rachis with leaflets
    x.strokeStyle = '#5b6b2e'; x.lineWidth = 6;
    x.beginPath(); x.moveTo(20, S / 2); x.quadraticCurveTo(S / 2, S / 2 - 40, S - 10, S / 2 + 30); x.stroke();
    for (let i = 0; i < 46; i++) {
      const t = i / 46;
      const px = 20 + t * (S - 30), py = S / 2 - Math.sin(t * Math.PI) * 30 + t * 30;
      const len = 120 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 20;
      for (const s of [-1, 1]) {
        const g = r.float(0.8, 1.15);
        x.strokeStyle = `rgb(${70 * g | 0},${112 * g | 0},${40 * g | 0})`;
        x.lineWidth = 5;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + len * 0.35, py + s * len); x.stroke();
      }
    }
  } else {
    const n = kind === 'pine' ? 2600 : 1700;
    for (let i = 0; i < n; i++) {
      // clustered distribution inside a soft circle
      const a = r.float(0, Math.PI * 2), d = Math.sqrt(r.next()) * S * 0.46;
      const px = S / 2 + Math.cos(a) * d, py = S / 2 + Math.sin(a) * d * 0.92;
      const shade = 0.55 + 0.45 * (1 - d / (S * 0.46)) * r.float(0.7, 1.1);
      const top = py < S / 2 ? 1.1 : 0.85;
      const g = shade * top;
      if (kind === 'pine') {
        x.strokeStyle = `rgb(${34 * g | 0},${70 * g | 0},${40 * g | 0})`;
        x.lineWidth = 2.2;
        const l = r.float(8, 16), ang = r.float(0, Math.PI);
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l); x.stroke();
      } else {
        const hue = r.float(0.85, 1.15);
        x.fillStyle = `rgb(${62 * g * hue | 0},${104 * g | 0},${38 * g / hue | 0})`;
        x.beginPath();
        x.ellipse(px, py, r.float(5, 10), r.float(3, 6), r.float(0, Math.PI), 0, Math.PI * 2);
        x.fill();
      }
    }
    // a few twigs
    x.strokeStyle = 'rgba(70,52,38,0.8)'; x.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      x.beginPath(); x.moveTo(S / 2, S * 0.95);
      x.quadraticCurveTo(S / 2 + r.float(-80, 80), S * 0.6, S / 2 + r.float(-200, 200), S * r.float(0.2, 0.5)); x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function card(w, h, cx, cy, cz, yaw, pitch, roll = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateZ(roll);
  g.rotateX(pitch);
  g.rotateY(yaw);
  g.translate(cx, cy, cz);
  // bend normals outward from crown centre for soft volumetric shading
  return g;
}

function sphericalNormals(geo, center) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).sub(center).normalize();
    n.setXYZ(i, v.x, v.y * 0.8 + 0.25, v.z);
  }
  n.needsUpdate = true;
}

export function makeTreeKit(castShadow) {
  const r = new RNG(77);
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4e3b2c, roughness: 0.95 });
  const kit = {};
  // ----- broadleaf
  {
    const trunk = new THREE.CylinderGeometry(0.14, 0.28, 4.2, 7); trunk.translate(0, 2.1, 0);
    const parts = [trunk];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.CylinderGeometry(0.05, 0.11, 2.4, 5);
      b.translate(0, 1.2, 0); b.rotateZ(r.float(0.5, 0.9)); b.rotateY((i / 4) * Math.PI * 2 + r.float(-0.3, 0.3)); b.translate(0, 3.2 + r.float(0, 0.8), 0);
      parts.push(b);
    }
    const wood = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; }));
    const cards = [];
    const C = new THREE.Vector3(0, 5.4, 0);
    for (let i = 0; i < 22; i++) {
      const a = r.float(0, Math.PI * 2), e = r.float(-0.5, 1.1), d = r.float(0.4, 2.1);
      const x = Math.cos(a) * Math.cos(e) * d * 1.2, y = C.y + Math.sin(e) * d, z = Math.sin(a) * Math.cos(e) * d * 1.2;
      cards.push(card(r.float(2.6, 3.6), r.float(2.4, 3.2), x, y, z, r.float(0, Math.PI), r.float(-0.6, 0.6), r.float(0, Math.PI)));
    }
    const leaves = mergeGeometries(cards);
    sphericalNormals(leaves, C);
    kit.round = { wood, leaves, map: leafTexture('round') };
  }
  // ----- pine
  {
    const trunk = new THREE.CylinderGeometry(0.1, 0.26, 7, 7); trunk.translate(0, 3.5, 0);
    trunk.deleteAttribute('uv');
    const cards = [];
    const C = new THREE.Vector3(0, 4.5, 0);
    for (let tier = 0; tier < 6; tier++) {
      const y = 2.2 + tier * 1.05, w = 4.6 - tier * 0.68;
      for (let k = 0; k < 3; k++) cards.push(card(w, 1.7, 0, y, 0, (k / 3) * Math.PI + tier * 0.4, Math.PI / 2 - 0.35, 0));
      cards.push(card(w * 0.8, w * 0.7, 0, y + 0.3, 0, tier, 0, 0));
    }
    const leaves = mergeGeometries(cards);
    sphericalNormals(leaves, C);
    kit.pine = { wood: trunk, leaves, map: leafTexture('pine') };
  }
  // ----- palm
  {
    const trunk = new THREE.CylinderGeometry(0.16, 0.24, 7.2, 8, 6);
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 3.6; p.setX(i, p.getX(i) + Math.sin(y * 0.25) * 0.35); }
    trunk.translate(0, 3.6, 0);
    trunk.deleteAttribute('uv');
    trunk.computeVertexNormals();
    const cards = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.PlaneGeometry(4.2, 1.6);
      g.translate(2.0, 0, 0);
      g.rotateX(Math.PI / 2);
      g.rotateZ(-0.35 - r.float(0, 0.4));
      g.rotateY((i / 9) * Math.PI * 2);
      g.translate(0.3, 7.2, 0);
      cards.push(g);
    }
    const leaves = mergeGeometries(cards);
    sphericalNormals(leaves, new THREE.Vector3(0.3, 6.6, 0));
    kit.palm = { wood: trunk, leaves, map: leafTexture('palm') };
  }
  kit.barkMat = barkMat;
  kit.leafMat = (k) => new THREE.MeshStandardMaterial({
    map: kit[k].map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, transparent: false,
  });
  kit.castShadow = castShadow;
  return kit;
}
