// Minimal DOM helpers: delegated actions via data-act / data-change attributes.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function bind(root, handlers) {
  root.onclick = (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const fn = handlers[t.dataset.act];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(t.dataset.arg, t, e); window.__ctx?.audio?.play('click'); }
  };
  root.onchange = (e) => {
    const t = e.target.closest('[data-change]');
    if (!t || !root.contains(t)) return;
    const fn = handlers[t.dataset.change];
    if (fn) fn(t.type === 'checkbox' ? t.checked : t.value, t, e);
  };
  root.oninput = (e) => {
    const t = e.target.closest('[data-input]');
    if (!t || !root.contains(t)) return;
    const fn = handlers[t.dataset.input];
    if (fn) fn(t.value, t, e);
  };
}

export function stars(n) { const k = Math.round(n); return '★'.repeat(k) + '☆'.repeat(5 - k); }
export function bar(frac, cls = '') { return `<div class="bar ${cls}"><div style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%"></div></div>`; }
export function meter(label, v, max = 100, cls = '') {
  return `<div class="meter"><span class="muted">${label}</span>${bar(v / max, cls)}<span class="val num">${Math.round(v)}</span></div>`;
}
export function delta(v, fmt) { return `<span class="${v >= 0 ? 'good' : 'bad'}">${fmt(v)}</span>`; }
