// Lightweight canvas charts (line, area, bars) with HiDPI support.
export function drawChart(canvas, series, opts = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 150;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const x = canvas.getContext('2d');
  x.scale(dpr, dpr);
  x.clearRect(0, 0, w, h);
  const pad = { l: opts.noAxis ? 4 : 52, r: 8, t: 10, b: opts.noAxis ? 4 : 20 };
  const all = series.flatMap((s) => s.data).filter((v) => Number.isFinite(v));
  if (!all.length) { x.fillStyle = '#5d6a7a'; x.font = '12px Inter, sans-serif'; x.fillText('No data yet', w / 2 - 30, h / 2); return; }
  let min = Math.min(...all), max = Math.max(...all);
  if (opts.zero !== false) { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) { max += 1; min -= 1; }
  const span = max - min; max += span * 0.08; if (min < 0) min -= span * 0.05;
  const n = Math.max(...series.map((s) => s.data.length));
  const X = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (w - pad.l - pad.r));
  const Y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
  if (!opts.noAxis) {
    x.strokeStyle = 'rgba(255,255,255,0.06)'; x.fillStyle = '#6f7d8c'; x.font = '10px Inter, sans-serif'; x.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4, y = Y(v);
      x.beginPath(); x.moveTo(pad.l, y); x.lineTo(w - pad.r, y); x.stroke();
      x.fillText(opts.fmt ? opts.fmt(v) : Math.round(v).toLocaleString(), 2, y + 3);
    }
    if (min < 0) { x.strokeStyle = 'rgba(255,255,255,0.25)'; x.beginPath(); x.moveTo(pad.l, Y(0)); x.lineTo(w - pad.r, Y(0)); x.stroke(); }
    if (opts.labels) { x.fillStyle = '#6f7d8c'; const L = opts.labels; const step = Math.ceil(L.length / 6); L.forEach((l, i) => { if (i % step === 0) x.fillText(l, X(i) - 10, h - 5); }); }
  }
  for (const s of series) {
    if (s.type === 'bar') {
      const bw = Math.max(2, ((w - pad.l - pad.r) / n) * 0.7);
      s.data.forEach((v, i) => {
        x.fillStyle = v >= 0 ? (s.color || '#3ecf8e') : (s.neg || '#ff5d5d');
        const y0 = Y(0), y1 = Y(v);
        x.fillRect(X(i) - bw / 2, Math.min(y0, y1), bw, Math.abs(y1 - y0));
      });
      continue;
    }
    x.beginPath();
    s.data.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))));
    x.strokeStyle = s.color || '#f2c14e'; x.lineWidth = s.width || 2; x.lineJoin = 'round'; x.stroke();
    if (s.fill) {
      x.lineTo(X(s.data.length - 1), Y(Math.max(min, 0))); x.lineTo(X(0), Y(Math.max(min, 0))); x.closePath();
      const g = x.createLinearGradient(0, pad.t, 0, h);
      g.addColorStop(0, (s.color || '#f2c14e') + '55'); g.addColorStop(1, (s.color || '#f2c14e') + '00');
      x.fillStyle = g; x.fill();
    }
  }
}
