// Procedural canvas textures for the whole city. No external image assets.
import * as THREE from 'three';
import { RNG } from '../core/utils.js';

const r = new RNG(1337);
let maxAniso = 8;
export function setMaxAnisotropy(a) { maxAniso = a; }

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, repeat = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (aniso) t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

function noise(ctx, w, h, amount = 18, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r.next() - 0.5) * amount;
    if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    else { d[i] += n; d[i + 1] += (r.next() - 0.5) * amount; d[i + 2] += (r.next() - 0.5) * amount; }
  }
  ctx.putImageData(img, 0, 0);
}

const rgb = (r_, g, b, a = 1) => `rgba(${r_ | 0},${g | 0},${b | 0},${a})`;

// ---------------------------------------------------------------- facades
// Every facade tile is 8 window columns x 8 floors. Geometry UVs use
// FACADE.colW metres per column and FACADE.floorH metres per floor.
export const FACADE = { cols: 8, rows: 8, colW: 3.2, floorH: 3.6 };

function windowRect(style, col, row, cw, ch) {
  switch (style) {
    case 'glass': return [cw * 0.04, ch * 0.16, cw * 0.92, ch * 0.8];
    case 'office': return [cw * 0.14, ch * 0.22, cw * 0.72, ch * 0.56];
    case 'brick': return [cw * 0.26, ch * 0.2, cw * 0.48, ch * 0.58];
    case 'panel': return [cw * 0.08, ch * 0.28, cw * 0.84, ch * 0.46];
    case 'industrial': return row % 4 === 1 ? [cw * 0.05, ch * 0.3, cw * 0.9, ch * 0.32] : null;
    default: return null;
  }
}

function drawFacadeBase(ctx, style, S) {
  const cw = S / FACADE.cols, ch = S / FACADE.rows;
  if (style === 'glass') {
    ctx.fillStyle = '#26384a';
    ctx.fillRect(0, 0, S, S);
    for (let row = 0; row < FACADE.rows; row++) {
      for (let col = 0; col < FACADE.cols; col++) {
        const g = ctx.createLinearGradient(0, row * ch, 0, (row + 1) * ch);
        const k = r.float(0.85, 1.15);
        g.addColorStop(0, rgb(70 * k, 100 * k, 128 * k));
        g.addColorStop(1, rgb(34 * k, 52 * k, 72 * k));
        ctx.fillStyle = g;
        const [x, y, w, h] = windowRect(style, col, row, cw, ch);
        ctx.fillRect(col * cw + x, row * ch + y, w, h);
      }
      // spandrel
      ctx.fillStyle = '#1a242e';
      ctx.fillRect(0, row * ch, S, ch * 0.16);
    }
    ctx.fillStyle = '#9aa7b4';
    for (let col = 0; col <= FACADE.cols; col++) ctx.fillRect(col * cw - 2, 0, 4, S);
    for (let row = 0; row <= FACADE.rows; row++) ctx.fillRect(0, row * ch - 1, S, 3);
    noise(ctx, S, S, 6);
    return;
  }
  if (style === 'office') {
    ctx.fillStyle = '#a8a296';
    ctx.fillRect(0, 0, S, S);
    noise(ctx, S, S, 22);
    for (let row = 0; row < FACADE.rows; row++) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, row * ch + ch * 0.9, S, ch * 0.1);
      for (let col = 0; col < FACADE.cols; col++) {
        const [x, y, w, h] = windowRect(style, col, row, cw, ch);
        const g = ctx.createLinearGradient(0, row * ch + y, 0, row * ch + y + h);
        g.addColorStop(0, '#5d7488');
        g.addColorStop(1, '#1f2a35');
        ctx.fillStyle = '#7f7a70';
        ctx.fillRect(col * cw + x - 3, row * ch + y - 3, w + 6, h + 6);
        ctx.fillStyle = g;
        ctx.fillRect(col * cw + x, row * ch + y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(col * cw + x, row * ch + y, w * 0.45, h);
      }
    }
    return;
  }
  if (style === 'brick') {
    ctx.fillStyle = '#7d3a28';
    ctx.fillRect(0, 0, S, S);
    const bh = 8, bw = 22;
    for (let y = 0; y < S; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < S + bw; x += bw) {
        const k = r.float(0.75, 1.2);
        ctx.fillStyle = rgb(128 * k, 60 * k, 42 * k);
        ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
    noise(ctx, S, S, 16);
    for (let row = 0; row < FACADE.rows; row++) {
      for (let col = 0; col < FACADE.cols; col++) {
        const [x, y, w, h] = windowRect(style, col, row, cw, ch);
        const X = col * cw + x, Y = row * ch + y;
        ctx.fillStyle = '#e6dfd0';
        ctx.fillRect(X - 5, Y - 5, w + 10, h + 10);
        ctx.fillStyle = '#c9c0ae';
        ctx.fillRect(X - 8, Y + h + 3, w + 16, 7);
        const g = ctx.createLinearGradient(0, Y, 0, Y + h);
        g.addColorStop(0, '#4b5c6a');
        g.addColorStop(1, '#1b232b');
        ctx.fillStyle = g;
        ctx.fillRect(X, Y, w, h);
        ctx.fillStyle = '#e6dfd0';
        ctx.fillRect(X + w / 2 - 2, Y, 4, h);
        ctx.fillRect(X, Y + h * 0.45, w, 4);
      }
    }
    return;
  }
  if (style === 'panel') {
    ctx.fillStyle = '#dcd5c6';
    ctx.fillRect(0, 0, S, S);
    noise(ctx, S, S, 10);
    ctx.strokeStyle = 'rgba(90,80,70,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= FACADE.cols * 2; i++) { ctx.beginPath(); ctx.moveTo((i * cw) / 2, 0); ctx.lineTo((i * cw) / 2, S); ctx.stroke(); }
    for (let row = 0; row < FACADE.rows; row++) {
      ctx.fillStyle = 'rgba(60,50,40,0.18)';
      ctx.fillRect(0, row * ch + ch * 0.82, S, ch * 0.06);
      for (let col = 0; col < FACADE.cols; col++) {
        const [x, y, w, h] = windowRect(style, col, row, cw, ch);
        const g = ctx.createLinearGradient(0, row * ch + y, 0, row * ch + y + h);
        g.addColorStop(0, '#6a8196');
        g.addColorStop(1, '#24303b');
        ctx.fillStyle = '#3a3f44';
        ctx.fillRect(col * cw + x - 2, row * ch + y - 2, w + 4, h + 4);
        ctx.fillStyle = g;
        ctx.fillRect(col * cw + x, row * ch + y, w, h);
      }
    }
    return;
  }
  if (style === 'industrial') {
    for (let x = 0; x < S; x += 8) {
      ctx.fillStyle = (x / 8) % 2 ? '#8a9095' : '#7a8086';
      ctx.fillRect(x, 0, 8, S);
    }
    noise(ctx, S, S, 14);
    // rust streaks
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(110,70,40,${r.float(0.05, 0.18)})`;
      ctx.fillRect(r.float(0, S), r.float(0, S), r.float(2, 6), r.float(30, 140));
    }
    for (let row = 0; row < FACADE.rows; row++) {
      for (let col = 0; col < FACADE.cols; col++) {
        const rect = windowRect(style, col, row, cw, ch);
        if (!rect) continue;
        const [x, y, w, h] = rect;
        ctx.fillStyle = '#2d3a44';
        ctx.fillRect(col * cw + x, row * ch + y, w, h);
        ctx.fillStyle = '#9da3a8';
        for (let k = 1; k < 4; k++) ctx.fillRect(col * cw + x + (w * k) / 4 - 1, row * ch + y, 2, h);
      }
    }
  }
}

function drawFacadeEmissive(ctx, style, S, litChance) {
  const cw = S / FACADE.cols, ch = S / FACADE.rows;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  for (let row = 0; row < FACADE.rows; row++) {
    for (let col = 0; col < FACADE.cols; col++) {
      const rect = windowRect(style, col, row, cw, ch);
      if (!rect || !r.chance(litChance)) continue;
      const [x, y, w, h] = rect;
      const warm = r.chance(style === 'glass' || style === 'office' ? 0.55 : 0.85);
      const k = r.float(0.35, 0.9);
      const c = warm ? [255 * k, 196 * k, 120 * k] : [205 * k, 222 * k, 255 * k];
      const g = ctx.createLinearGradient(0, row * ch + y, 0, row * ch + y + h);
      g.addColorStop(0, rgb(c[0] * 0.7, c[1] * 0.7, c[2] * 0.7));
      g.addColorStop(1, rgb(c[0], c[1], c[2]));
      ctx.fillStyle = g;
      ctx.fillRect(col * cw + x, row * ch + y, w, h);
      if (r.chance(0.4)) { // blinds / silhouettes
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(col * cw + x, row * ch + y, w, h * r.float(0.1, 0.5));
      }
    }
  }
}

const facadeCache = {};
export function facadeTextures(style) {
  if (facadeCache[style]) return facadeCache[style];
  const S = 1024;
  const c1 = makeCanvas(S, S);
  drawFacadeBase(c1.getContext('2d'), style, S);
  const c2 = makeCanvas(S, S);
  const lit = { glass: 0.3, office: 0.3, brick: 0.42, panel: 0.38, industrial: 0.5 }[style] ?? 0.35;
  drawFacadeEmissive(c2.getContext('2d'), style, S, lit);
  facadeCache[style] = { map: toTexture(c1), emissive: toTexture(c2) };
  return facadeCache[style];
}

// Ground-floor shop fronts: 8 bays across, full height = 1 band.
export function storefrontTextures() {
  if (facadeCache.store) return facadeCache.store;
  const W = 1024, H = 256, bw = W / 8;
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const e = makeCanvas(W, H), ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  x.fillStyle = '#2b2f33'; x.fillRect(0, 0, W, H);
  const signColors = ['#c0392b', '#1f6f8b', '#2e7d32', '#6a1b9a', '#ef6c00', '#263238', '#00897b', '#ad1457'];
  for (let i = 0; i < 8; i++) {
    const X = i * bw;
    // fascia / sign band
    const sc = signColors[r.int(0, signColors.length - 1)];
    x.fillStyle = sc; x.fillRect(X + 4, 8, bw - 8, 54);
    x.fillStyle = 'rgba(255,255,255,0.85)';
    const tw = r.float(0.35, 0.7) * bw;
    x.fillRect(X + (bw - tw) / 2, 28, tw, 12);
    ex.fillStyle = 'rgba(255,240,210,0.9)';
    ex.fillRect(X + (bw - tw) / 2, 28, tw, 12);
    // display window
    const g = x.createLinearGradient(0, 74, 0, H - 10);
    g.addColorStop(0, '#4d5f6e'); g.addColorStop(1, '#1d262e');
    x.fillStyle = g; x.fillRect(X + 8, 74, bw - 16, H - 84);
    // interior shelves / goods silhouettes
    for (let k = 0; k < 6; k++) {
      x.fillStyle = `rgba(${r.int(120, 230)},${r.int(100, 200)},${r.int(80, 180)},0.35)`;
      x.fillRect(X + 14 + r.float(0, bw - 50), r.float(110, H - 50), r.float(10, 30), r.float(10, 40));
    }
    x.fillStyle = '#8b939a';
    x.fillRect(X + 8, 70, bw - 16, 4);
    x.fillRect(X + bw / 2 - 2, 74, 4, H - 84);
    // door on some bays
    if (i % 2 === 0) { x.fillStyle = '#151a1f'; x.fillRect(X + bw * 0.62, 110, bw * 0.24, H - 120); }
    // emissive interior glow
    const warm = r.chance(0.6);
    const eg = ex.createLinearGradient(0, 74, 0, H);
    eg.addColorStop(0, warm ? 'rgba(255,210,150,0.95)' : 'rgba(215,235,255,0.95)');
    eg.addColorStop(1, warm ? 'rgba(160,110,60,0.7)' : 'rgba(120,140,170,0.7)');
    ex.fillStyle = eg; ex.fillRect(X + 8, 74, bw - 16, H - 84);
  }
  noise(x, W, H, 8);
  facadeCache.store = { map: toTexture(c), emissive: toTexture(e) };
  return facadeCache.store;
}

export function roofTexture() {
  if (facadeCache.roof) return facadeCache.roof;
  const S = 256, c = makeCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#5b5d5e'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 40);
  facadeCache.roof = toTexture(c);
  return facadeCache.roof;
}

// ---------------------------------------------------------------- ground
export function asphaltTexture() {
  if (facadeCache.asphalt) return facadeCache.asphalt;
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#3a3c3f'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 34);
  for (let i = 0; i < 30; i++) {
    x.fillStyle = `rgba(0,0,0,${r.float(0.03, 0.09)})`;
    x.beginPath();
    x.ellipse(r.float(0, S), r.float(0, S), r.float(10, 60), r.float(6, 30), r.float(0, 3), 0, Math.PI * 2);
    x.fill();
  }
  facadeCache.asphalt = toTexture(c);
  return facadeCache.asphalt;
}

// Road segment: u runs along the road (1 tile = 24 m), v across (full width).
export function roadTexture() {
  if (facadeCache.road) return facadeCache.road;
  const W = 512, H = 256, c = makeCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#38393c'; x.fillRect(0, 0, W, H);
  noise(x, W, H, 30);
  // tyre wear
  x.fillStyle = 'rgba(0,0,0,0.10)';
  for (const v of [0.3, 0.39, 0.61, 0.7]) x.fillRect(0, H * v - 5, W, 10);
  // parking-lane edge lines (lanes are +-2.2m, parking at +-5.6m on a 14m road)
  x.fillStyle = '#d9d9d2';
  x.fillRect(0, H * 0.229 - 2, W, 4);
  x.fillRect(0, H * 0.771 - 2, W, 4);
  // parking bay ticks
  for (let u = 0; u < W; u += W / 4) { x.fillRect(u, 0, 3, H * 0.229); x.fillRect(u, H * 0.771, 3, H * 0.229); }
  // double yellow centre
  x.fillStyle = '#e0b43a';
  x.fillRect(0, H * 0.5 - 6, W, 3);
  x.fillRect(0, H * 0.5 + 3, W, 3);
  noise(x, W, H, 10);
  facadeCache.road = toTexture(c);
  return facadeCache.road;
}

export function intersectionTexture() {
  if (facadeCache.inter) return facadeCache.inter;
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#38393c'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 30);
  x.fillStyle = '#e4e4de';
  const stripe = S / 16;
  for (let i = 1; i < 15; i += 2) {
    x.fillRect(i * stripe, 4, stripe * 0.8, S * 0.1); // north crosswalk
    x.fillRect(i * stripe, S - S * 0.1 - 4, stripe * 0.8, S * 0.1);
    x.fillRect(4, i * stripe, S * 0.1, stripe * 0.8);
    x.fillRect(S - S * 0.1 - 4, i * stripe, S * 0.1, stripe * 0.8);
  }
  noise(x, S, S, 12);
  facadeCache.inter = toTexture(c, { repeat: false });
  return facadeCache.inter;
}

export function sidewalkTexture() {
  if (facadeCache.side) return facadeCache.side;
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#8e8a83'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 22);
  x.strokeStyle = 'rgba(60,55,50,0.35)';
  x.lineWidth = 2;
  const t = S / 8;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * t, 0); x.lineTo(i * t, S); x.stroke();
    x.beginPath(); x.moveTo(0, i * t); x.lineTo(S, i * t); x.stroke();
  }
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(40,35,30,${r.float(0.04, 0.12)})`;
    x.beginPath(); x.arc(r.float(0, S), r.float(0, S), r.float(2, 10), 0, Math.PI * 2); x.fill();
  }
  facadeCache.side = toTexture(c);
  return facadeCache.side;
}

export function plazaTexture() {
  if (facadeCache.plaza) return facadeCache.plaza;
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#6e685f'; x.fillRect(0, 0, S, S);
  const t = S / 16;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    const k = r.float(0.9, 1.06);
    x.fillStyle = rgb(146 * k, 138 * k, 126 * k);
    x.fillRect(i * t + 1, j * t + 1, t - 2, t - 2);
  }
  noise(x, S, S, 12);
  facadeCache.plaza = toTexture(c);
  return facadeCache.plaza;
}

export function grassTexture() {
  if (facadeCache.grass) return facadeCache.grass;
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#4f7a35'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const k = r.float(0.7, 1.25);
    x.fillStyle = rgb(70 * k, 118 * k, 46 * k, 0.6);
    x.fillRect(r.float(0, S), r.float(0, S), 1.5, r.float(2, 6));
  }
  for (let i = 0; i < 25; i++) {
    x.fillStyle = `rgba(${r.int(90, 130)},${r.int(110, 140)},50,0.12)`;
    x.beginPath(); x.arc(r.float(0, S), r.float(0, S), r.float(20, 70), 0, Math.PI * 2); x.fill();
  }
  facadeCache.grass = toTexture(c);
  return facadeCache.grass;
}

export function dirtTexture() {
  if (facadeCache.dirt) return facadeCache.dirt;
  const S = 256, c = makeCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#6f675b'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 40);
  facadeCache.dirt = toTexture(c);
  return facadeCache.dirt;
}

export function waterNormalTexture() {
  if (facadeCache.waterN) return facadeCache.waterN;
  const S = 256, c = makeCanvas(S, S), x = c.getContext('2d');
  const img = x.createImageData(S, S);
  // sum of sines -> height, then finite-difference normals (tileable)
  const waves = [];
  for (let i = 0; i < 9; i++) waves.push({ fx: r.int(1, 6), fy: r.int(-5, 5), a: r.float(0.3, 1) / (i + 1), p: r.float(0, 6.28) });
  const hgt = (u, v) => {
    let s = 0;
    for (const w of waves) s += w.a * Math.sin(2 * Math.PI * (w.fx * u + w.fy * v) + w.p);
    return s;
  };
  const e = 1 / S;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S;
    const dx = (hgt(u + e, v) - hgt(u - e, v)) * 6;
    const dy = (hgt(u, v + e) - hgt(u, v - e)) * 6;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    const k = (j * S + i) * 4;
    img.data[k] = (n.x * 0.5 + 0.5) * 255;
    img.data[k + 1] = (n.y * 0.5 + 0.5) * 255;
    img.data[k + 2] = (n.z * 0.5 + 0.5) * 255;
    img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  facadeCache.waterN = toTexture(c, { srgb: false });
  return facadeCache.waterN;
}

export function glowTexture(inner = 'rgba(255,220,160,1)', outer = 'rgba(255,200,120,0)') {
  const S = 128, c = makeCanvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return toTexture(c, { repeat: false });
}

export function beamTexture() {
  const W = 32, H = 256, c = makeCanvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  return toTexture(c, { repeat: false, srgb: false });
}

export function makeTextTexture(text, {
  w = 1024, h = 192, bg = '#14181d', fg = '#ffffff', font = '700 110px Inter, Arial, sans-serif', border = null, sub = null,
} = {}) {
  const c = makeCanvas(w, h), x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  if (border) { x.strokeStyle = border; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10); }
  x.fillStyle = fg;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  let f = font;
  x.font = f;
  while (x.measureText(text).width > w * 0.9 && size > 20) {
    size -= 4;
    f = font.replace(/\d+px/, `${size}px`);
    x.font = f;
  }
  x.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
  if (sub) {
    x.font = f.replace(/\d+px/, `${Math.round(size * 0.38)}px`);
    x.globalAlpha = 0.75;
    x.fillText(sub, w / 2, h * 0.8);
  }
  return toTexture(c, { repeat: false });
}

export function badgeTexture(label, color) {
  const w = 256, h = 256, c = makeCanvas(w, h), x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  x.beginPath();
  x.arc(w / 2, h / 2, 110, 0, Math.PI * 2);
  x.fillStyle = 'rgba(12,16,22,0.88)';
  x.fill();
  x.lineWidth = 14;
  x.strokeStyle = color;
  x.stroke();
  x.fillStyle = color;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  let size = label.length <= 1 ? 130 : label.length <= 2 ? 100 : label.length <= 3 ? 74 : 58;
  x.font = `800 ${size}px Inter, Arial, sans-serif`;
  x.fillText(label, w / 2, h / 2 + 6);
  return toTexture(c, { repeat: false });
}

export function starsTexture() {
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 600; i++) {
    x.fillStyle = `rgba(255,255,255,${r.float(0.2, 1)})`;
    x.fillRect(r.float(0, S), r.float(0, S), r.chance(0.1) ? 2 : 1, r.chance(0.1) ? 2 : 1);
  }
  return toTexture(c, { srgb: true });
}

// Transparent lane-marking decal for road segments: u along the road (1 tile = 24 m), v across.
export function roadMarkingsTexture() {
  if (facadeCache.marks) return facadeCache.marks;
  const W = 512, H = 256, c = makeCanvas(W, H), x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  const paint = (style) => { x.fillStyle = style; };
  paint('rgba(235,235,228,0.92)');
  x.fillRect(0, H * 0.229 - 2, W, 4);
  x.fillRect(0, H * 0.771 - 2, W, 4);
  for (let u = 0; u < W; u += W / 4) { x.fillRect(u, 0, 3, H * 0.229); x.fillRect(u, H * 0.771, 3, H * 0.229); }
  paint('rgba(226,176,52,0.95)');
  x.fillRect(0, H * 0.5 - 6, W, 3);
  x.fillRect(0, H * 0.5 + 3, W, 3);
  // wear: knock holes in the paint
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = `rgba(0,0,0,${r.float(0.2, 0.9)})`;
    x.fillRect(r.float(0, W), r.float(0, H), r.float(1, 4), r.float(1, 3));
  }
  x.globalCompositeOperation = 'source-over';
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  facadeCache.marks = t;
  return t;
}

export function crosswalkTexture() {
  if (facadeCache.cross) return facadeCache.cross;
  const S = 512, c = makeCanvas(S, S), x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  x.fillStyle = 'rgba(236,236,230,0.92)';
  const stripe = S / 16;
  for (let i = 1; i < 15; i += 2) {
    x.fillRect(i * stripe, 6, stripe * 0.8, S * 0.11);
    x.fillRect(i * stripe, S - S * 0.11 - 6, stripe * 0.8, S * 0.11);
    x.fillRect(6, i * stripe, S * 0.11, stripe * 0.8);
    x.fillRect(S - S * 0.11 - 6, i * stripe, S * 0.11, stripe * 0.8);
  }
  // stop lines
  x.fillRect(S * 0.5, S * 0.13, S * 0.5 - 6, 6);
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1600; i++) {
    x.fillStyle = `rgba(0,0,0,${r.float(0.2, 0.9)})`;
    x.fillRect(r.float(0, S), r.float(0, S), r.float(1, 4), r.float(1, 3));
  }
  x.globalCompositeOperation = 'source-over';
  facadeCache.cross = toTexture(c, { repeat: false });
  return facadeCache.cross;
}
