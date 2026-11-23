// Shared UI fragments for tablet apps and location dialogs.
import { ctx } from '../../core/ctx.js';
import { money, escapeHtml, pct } from '../../core/utils.js';
import { BUSINESS_TYPES } from '../../game/data/businessTypes.js';
import { DISTRICTS } from '../../game/data/districts.js';
import { UNIT_TYPE_NAMES, unitValue, unitRent } from '../../game/properties.js';

export const esc = escapeHtml;
export const STATUS = {
  fitout: ['Fit-out', 'warn'], ready: ['Ready to open', 'info'], open: ['Open', 'good'], paused: ['Paused', 'warn'], closed: ['Closed', 'bad'],
};
export function statusPill(b) {
  const [t, c] = STATUS[b.status] || [b.status, ''];
  const closedNow = b.status === 'open' && ctx.state.clock.min < b.closedUntil;
  return closedNow ? '<span class="pill bad">Temporarily closed</span>' : `<span class="pill ${c}">${t}</span>`;
}
export function bizIcon(b, size = 52) {
  const T = BUSINESS_TYPES[b.type];
  return `<div class="bizlogo" style="width:${size}px;height:${size}px;background:${b.color}22;border:1px solid ${b.color}66">${T.icon}</div>`;
}
export function unitLine(u) {
  const D = DISTRICTS[u.district];
  return `${esc(u.label)} · ${u.area.toLocaleString()} m² · <span style="color:${D.color}">${D.name}</span>`;
}
export function unitSummary(u) {
  return `<div class="grid g4" style="margin:6px 0 2px">
    <div class="kpi"><div class="l">Type</div><div class="v" style="font-size:16px">${UNIT_TYPE_NAMES[u.type]}</div></div>
    <div class="kpi"><div class="l">Floor area</div><div class="v num" style="font-size:16px">${u.area.toLocaleString()} m²</div></div>
    <div class="kpi"><div class="l">Market value</div><div class="v num" style="font-size:16px">${money(unitValue(u), { compact: true })}</div></div>
    <div class="kpi"><div class="l">Market rent</div><div class="v num" style="font-size:16px">${money(unitRent(u))}/mo</div></div></div>`;
}
export function districtBadge(id) {
  const D = DISTRICTS[id];
  return `<span class="pill" style="background:${D.color}22;color:${D.color}">${D.name}</span>`;
}
export function pctCls(v) { return v >= 0 ? 'good' : 'bad'; }
export function moneyCell(v, opts) { return `<span class="num ${v < 0 ? 'bad' : ''}">${money(v, opts)}</span>`; }
export { money, pct };
