// Pre-rendered city map used by the rotating minimap, the full-screen map, and GPS routing on the road graph.
import { ctx } from '../core/ctx.js';
import { CITY, roadX, roadZ } from '../world/layout.js';
import { DISTRICTS } from '../game/data/districts.js';

export const MAP = { x0: 0, z0: 0, w: 0, h: 0, scale: 1 };

export function buildMapImage(L) {
  const m = 160;
  MAP.x0 = CITY.X0 - m; MAP.z0 = CITY.Z0 - m;
  MAP.w = CITY.W + m * 2; MAP.h = CITY.SHORE_Z + 260 - MAP.z0;
  const c = document.createElement('canvas');
  c.width = MAP.w; c.height = MAP.h;
  const x = c.getContext('2d');
  const X = (v) => v - MAP.x0, Z = (v) => v - MAP.z0;
  x.fillStyle = '#18231b'; x.fillRect(0, 0, MAP.w, MAP.h);
  x.fillStyle = '#10293d'; x.fillRect(0, Z(CITY.SHORE_Z), MAP.w, MAP.h);
  x.fillStyle = '#3a3f46'; x.fillRect(X(CITY.X0 - 60), Z(CITY.Z0 + CITY.H), CITY.W + 120, CITY.SHORE_Z - CITY.Z0 - CITY.H);
  for (const p of L.piers) { x.fillStyle = '#5b4a3a'; x.fillRect(X(p.x - p.w / 2), Z(p.z - p.d / 2), p.w, p.d); }
  // roads
  x.fillStyle = '#2c3138';
  for (let i = 0; i <= CITY.NX; i++) x.fillRect(X(roadX(i) - CITY.ROAD / 2), Z(CITY.Z0), CITY.ROAD, CITY.H);
  for (let j = 0; j <= CITY.NZ; j++) x.fillRect(X(CITY.X0), Z(roadZ(j) - CITY.ROAD / 2), CITY.W, CITY.ROAD);
  // blocks tinted by district
  for (const b of L.blocks) {
    const D = DISTRICTS[b.district];
    x.fillStyle = b.district === 'park' ? '#2f5a33' : shade(D.color, 0.22);
    x.fillRect(X(b.x0), Z(b.z0), b.x1 - b.x0, b.z1 - b.z0);
  }
  for (const p of L.ponds) { x.fillStyle = '#1d4560'; x.beginPath(); x.arc(X(p.x), Z(p.z), p.r, 0, Math.PI * 2); x.fill(); }
  // buildings
  for (const b of L.buildings) {
    const h = Math.min(1, b.h / 200);
    x.fillStyle = `rgb(${70 + h * 60},${78 + h * 60},${90 + h * 60})`;
    x.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w, b.d);
  }
  // street labels
  x.fillStyle = 'rgba(255,255,255,0.35)'; x.font = '600 9px Inter, sans-serif';
  MAP.canvas = c;
  return c;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (v) => Math.round(v * k + 22 * (1 - k));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

// --------------------------------------------------------------------------- GPS
function nearestNode(p) {
  let best = null, bd = Infinity;
  for (const n of ctx.layout.nodes) {
    const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
export function gpsPath(from, to) {
  const L = ctx.layout;
  const a = nearestNode(from), b = nearestNode(to);
  if (!a || !b) return [from, to];
  const adj = ctx.traffic?.adj;
  if (!adj) return [from, to];
  const open = new Map([[a.id, 0]]);
  const g = new Map([[a.id, 0]]);
  const came = new Map();
  const H = (id) => Math.abs(L.nodes[id].x - b.x) + Math.abs(L.nodes[id].z - b.z);
  const closed = new Set();
  while (open.size) {
    let cur = null, cf = Infinity;
    for (const [id, f] of open) if (f < cf) { cf = f; cur = id; }
    if (cur === b.id) break;
    open.delete(cur); closed.add(cur);
    for (const nb of adj[cur]) {
      if (closed.has(nb)) continue;
      const ng = g.get(cur) + Math.hypot(L.nodes[nb].x - L.nodes[cur].x, L.nodes[nb].z - L.nodes[cur].z);
      if (ng < (g.get(nb) ?? Infinity)) { g.set(nb, ng); came.set(nb, cur); open.set(nb, ng + H(nb)); }
    }
  }
  const path = [];
  let k = b.id;
  while (k !== undefined) { path.unshift({ x: L.nodes[k].x, z: L.nodes[k].z }); k = came.get(k); if (k === a.id) { path.unshift({ x: a.x, z: a.z }); break; } }
  return [from, ...path, to];
}

// --------------------------------------------------------------------------- minimap
export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx2 = canvas.getContext('2d');
    this.size = 230;
    canvas.width = canvas.height = this.size * 2;
    this.range = 170; // metres radius shown
    this.route = null;
    this.routeTimer = 0;
  }
  update(dt, center, yaw, targets) {
    const x = this.ctx2, S = this.canvas.width, R = S / 2;
    const k = R / this.range;
    x.save();
    x.fillStyle = '#0d1218'; x.fillRect(0, 0, S, S);
    x.translate(R, R);
    x.rotate(yaw);
    x.scale(k, k);
    x.translate(-(center.x - MAP.x0), -(center.z - MAP.z0));
    if (MAP.canvas) x.drawImage(MAP.canvas, 0, 0);
    // route
    this.routeTimer -= dt;
    const goal = targets.find((t) => t.route);
    if (goal && this.routeTimer <= 0) { this.route = gpsPath(center, goal); this.routeTimer = 1; }
    if (!goal) this.route = null;
    if (this.route) {
      x.strokeStyle = goal.color || '#f2c14e'; x.lineWidth = 6 / k * 1.6; x.lineJoin = 'round'; x.lineCap = 'round';
      x.globalAlpha = 0.85;
      x.beginPath();
      this.route.forEach((p, i) => (i ? x.lineTo(p.x - MAP.x0, p.z - MAP.z0) : x.moveTo(p.x - MAP.x0, p.z - MAP.z0)));
      x.stroke();
      x.globalAlpha = 1;
    }
    x.restore();
    // blips (screen-space, clamped to edge)
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const t of targets) {
      const dx = (t.x - center.x) * k, dz = (t.z - center.z) * k;
      let px = dx * c - dz * s, py = dx * s + dz * c;
      const d = Math.hypot(px, py);
      const edge = R - 14;
      let clamped = false;
      if (d > edge) { if (!t.edge) continue; px *= edge / d; py *= edge / d; clamped = true; }
      x.beginPath();
      x.arc(R + px, R + py, (t.size || 6) * (clamped ? 0.8 : 1), 0, Math.PI * 2);
      x.fillStyle = t.color; x.fill();
      x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,0.7)'; x.stroke();
      if (t.label && !clamped) { x.fillStyle = '#fff'; x.font = '700 14px Inter, sans-serif'; x.textAlign = 'center'; x.fillText(t.label, R + px, R + py + 5); }
    }
    // player arrow (always points up = camera forward... rotate by relative heading)
    x.save();
    x.translate(R, R);
    x.rotate(Math.PI - (targets.heading ?? 0) + yaw);
    x.beginPath(); x.moveTo(0, -14); x.lineTo(9, 10); x.lineTo(0, 5); x.lineTo(-9, 10); x.closePath();
    x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#000'; x.lineWidth = 2; x.stroke();
    x.restore();
    // north marker
    x.fillStyle = '#f2c14e'; x.font = '800 18px Inter, sans-serif'; x.textAlign = 'center'; x.fillText('N', R - Math.sin(-yaw) * (R - 18), R - Math.cos(-yaw) * (R - 18) + 6);
  }
}
