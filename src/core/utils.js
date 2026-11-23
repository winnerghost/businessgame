// Shared helpers: seeded RNG, math, formatting.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }
  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min, max) { return Math.floor(min + (max - min + 1) * this.next()); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  normal(mean = 0, sd = 1) {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  weighted(items, weightFn) {
    let total = 0;
    for (const it of items) total += weightFn(it);
    let r = this.next() * total;
    for (const it of items) {
      r -= weightFn(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// Non-deterministic gameplay RNG (still seedable for tests)
export const rng = new RNG((Math.random() * 2 ** 31) | 0);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};

let _uid = 1;
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${(_uid++).toString(36)}`;

export function money(v, opts = {}) {
  const { decimals, sign = false, compact = false } = opts;
  if (v === undefined || v === null || Number.isNaN(v)) return '$0';
  const neg = v < 0;
  const a = Math.abs(v);
  let s;
  if (compact && a >= 1e9) s = (a / 1e9).toFixed(2) + 'B';
  else if (compact && a >= 1e6) s = (a / 1e6).toFixed(2) + 'M';
  else if (compact && a >= 1e4) s = (a / 1e3).toFixed(1) + 'K';
  else {
    const d = decimals !== undefined ? decimals : a < 100 && a % 1 !== 0 ? 2 : 0;
    s = a.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  return (neg ? '-' : sign ? '+' : '') + '$' + s;
}

export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
export const num = (v, d = 0) =>
  (v ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Tiny event bus
export class Bus {
  constructor() { this.handlers = new Map(); }
  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt).delete(fn);
  }
  emit(evt, ...args) {
    const hs = this.handlers.get(evt);
    if (hs) for (const h of [...hs]) {
      try { h(...args); } catch (e) { console.error(`[bus:${evt}]`, e); }
    }
  }
}
