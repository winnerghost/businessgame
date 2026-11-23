import { ctx } from '../../core/ctx.js';
import { money } from '../../core/utils.js';
import { DISTRICTS } from '../../game/data/districts.js';
import { UNIT_TYPE_NAMES, unitValue, unitRent, listingPrice, listingRent, residentialRentRoll, sellUnit, endLease, findTenant } from '../../game/properties.js';
import { esc, districtBadge } from './common.js';
import { showListing, showSetupWizard } from '../locations.js';

function mine() {
  const s = ctx.state;
  const rows = [
    ...s.owned.map((o) => ({ kind: 'owned', o, u: ctx.units[o.unitId] })),
    ...s.leases.map((l) => ({ kind: 'leased', l, u: ctx.units[l.unitId] })),
  ];
  if (!rows.length) return '<div class="empty"><div class="big">🔑</div>You don\'t own or lease any property yet. Browse listings below or visit Keystone Realty in Midtown.</div>';
  return `<table class="t"><thead><tr><th>Property</th><th>District</th><th>Tenure</th><th>Use</th><th class="r">Value / Rent</th><th class="r">Actions</th></tr></thead><tbody>
    ${rows.map((r) => {
      const biz = s.businesses.find((b) => b.unitId === r.u.id);
      const use = biz ? `<span class="pill gold">${esc(biz.name)}</span>` : r.o?.tenant ? `<span class="pill good">Rented: ${money(r.o.tenant.rent)}/mo</span>` : r.o?.use === 'listing' ? '<span class="pill warn">Seeking tenant</span>' : '<span class="pill">Vacant</span>';
      const val = r.kind === 'owned' ? `${money(unitValue(r.u), { compact: true })}<div class="muted" style="font-size:11px">paid ${money(r.o.price, { compact: true })}</div>` : `${money(r.l.rent)}/mo<div class="muted" style="font-size:11px">lease to day ${r.l.end}</div>`;
      const commercial = ['retail', 'office', 'industrial', 'building'].includes(r.u.type);
      const acts = [];
      if (!biz && commercial && !(r.o?.tenant)) acts.push(`<button class="btn small primary" data-act="setup" data-arg="${r.u.id}">Start business</button>`);
      if (r.kind === 'owned' && !biz && !r.o.tenant && r.o.use !== 'listing') acts.push(`<button class="btn small" data-act="tenant" data-arg="${r.u.id}">Find tenant</button>`);
      if (r.kind === 'owned') acts.push(`<button class="btn small" data-act="sell" data-arg="${r.u.id}">Sell</button>`);
      if (r.kind === 'leased') acts.push(`<button class="btn small bad" data-act="endLease" data-arg="${r.u.id}">End lease</button>`);
      acts.push(`<button class="btn small" data-act="wp" data-arg="${r.u.id}">📍</button>`);
      return `<tr><td><b>${esc(r.u.label)}</b><div class="muted" style="font-size:12px">${esc(r.u.address)} · ${r.u.area.toLocaleString()} m²${r.u.apartments > 1 ? ` · ${r.u.apartments} apts` : ''}</div></td><td>${districtBadge(r.u.district)}</td><td>${r.kind === 'owned' ? '<span class="pill info">Owned</span>' : '<span class="pill">Leased</span>'}</td><td>${use}</td><td class="r num">${val}</td><td class="r">${acts.join(' ')}</td></tr>`;
    }).join('')}</tbody></table>`;
}

function listings(p) {
  const s = ctx.state;
  const f = { type: p.type || 'all', district: p.district || 'all', mode: p.mode || 'all', sort: p.sort || 'price' };
  let L = s.listings.map((l) => ({ l, u: ctx.units[l.unitId] })).filter((x) => x.u);
  if (f.type !== 'all') L = L.filter((x) => x.u.type === f.type);
  if (f.district !== 'all') L = L.filter((x) => x.u.district === f.district);
  if (f.mode !== 'all') L = L.filter((x) => x.l.mode === f.mode || x.l.mode === 'both');
  L.sort((a, b) => (f.sort === 'price' ? listingRent(a.l) - listingRent(b.l) : f.sort === 'area' ? b.u.area - a.u.area : b.u.foot - a.u.foot));
  const sel = (name, opts, cur) => `<select data-change="filter" data-arg="${name}">${opts.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return `<div class="row wrap" style="margin-bottom:12px">
      ${sel('type', [['all', 'All types'], ...Object.entries(UNIT_TYPE_NAMES)], f.type)}
      ${sel('district', [['all', 'All districts'], ...Object.values(DISTRICTS).filter((d) => d.id !== 'park').map((d) => [d.id, d.name])], f.district)}
      ${sel('mode', [['all', 'Sale or lease'], ['lease', 'For lease'], ['sale', 'For sale']], f.mode)}
      ${sel('sort', [['price', 'Cheapest'], ['area', 'Largest'], ['foot', 'Most foot traffic']], f.sort)}
      <span class="sp"></span><span class="muted">${L.length} listings</span></div>
    <table class="t"><thead><tr><th>Property</th><th>District</th><th class="r">Area</th><th class="r">Foot traffic</th><th class="r">Lease</th><th class="r">Price</th><th></th></tr></thead><tbody>
    ${L.map(({ l, u }) => `<tr data-act="view" data-arg="${u.id}" style="cursor:pointer"><td><b>${esc(u.label)}</b> <span class="pill">${UNIT_TYPE_NAMES[u.type]}</span><div class="muted" style="font-size:12px">${esc(u.address)}${u.apartments > 1 ? ` · ${u.apartments} apartments` : ''}</div></td><td>${districtBadge(u.district)}</td><td class="r num">${u.area.toLocaleString()} m²</td><td class="r">${u.type === 'retail' ? `<span class="num">${Math.round(u.foot * 100)}</span>` : '<span class="dim">—</span>'}</td>
      <td class="r num">${l.mode !== 'sale' ? money(listingRent(l)) + '/mo' : '<span class="dim">—</span>'}</td><td class="r num">${l.mode !== 'lease' ? money(listingPrice(l), { compact: true }) : '<span class="dim">—</span>'}</td><td class="r"><button class="btn small">View</button></td></tr>`).join('')}
    </tbody></table>`;
}

export const properties = {
  id: 'properties', name: 'Properties', icon: '🏢',
  render(p) {
    const tab = p.tab || (ctx.state.owned.length + ctx.state.leases.length ? 'mine' : 'listings');
    return `<div class="subtabs"><button class="${tab === 'mine' ? 'on' : ''}" data-act="tab" data-arg="mine">My properties</button><button class="${tab === 'listings' ? 'on' : ''}" data-act="tab" data-arg="listings">Listings</button><button class="${tab === 'guide' ? 'on' : ''}" data-act="tab" data-arg="guide">District guide</button></div>
      ${tab === 'mine' ? mine() : tab === 'listings' ? listings(p) : guide()}`;
  },
  actions: {
    tab: (t) => { ctx.tablet.params.tab = t; ctx.tablet.render(true); },
    filter: (v, el) => { ctx.tablet.params[el.dataset.arg] = v; ctx.tablet.params.tab = 'listings'; ctx.tablet.render(true); },
    view: (u) => showListing(u),
    setup: (u) => showSetupWizard(u),
    tenant: (u) => { findTenant(u); ctx.tablet.render(); },
    sell: (u) => ctx.modal.confirm('Sell this property?', `Estimated sale price ${money(unitValue(ctx.units[u]))} less 5% broker & closing fees. Any mortgage is paid off from the proceeds.`, () => { sellUnit(u); ctx.tablet.render(); }, { yes: 'Sell' }),
    endLease: (u) => ctx.modal.confirm('End this lease?', 'Ending early costs up to 3 months\' rent × 50%. Your deposit is returned.', () => { endLease(u); ctx.tablet.render(); }, { yes: 'End lease', cls: 'bad' }),
    wp: (u) => { const b = ctx.layout.buildingById[ctx.units[u].bId]; ctx.state.waypoint = { x: b.door.x, z: b.door.z, label: ctx.units[u].address }; ctx.bus.emit('toast', { title: 'Waypoint set', text: ctx.units[u].address, kind: 'info' }); },
  },
};

function guide() {
  return `<div class="grid g2">${Object.values(DISTRICTS).filter((d) => d.id !== 'park').map((d) => `<div class="card"><h3 style="color:${d.color}">${d.name}</h3><div class="note" style="margin-bottom:10px">${esc(d.desc)}</div>
    <div class="grid g3"><div class="kpi"><div class="l">Foot traffic</div><div class="v num" style="font-size:18px">${Math.round(d.foot * 100)}</div></div><div class="kpi"><div class="l">Wealth</div><div class="v num" style="font-size:18px">${Math.round(d.wealth * 100)}</div></div><div class="kpi"><div class="l">Crime</div><div class="v num" style="font-size:18px">${Math.round(d.crime * 100)}</div></div></div>
    <div class="row sb" style="margin-top:10px"><span class="muted">Retail rent</span><b class="num">${d.rent.retail ? money(d.rent.retail) + '/m²/mo' : '—'}</b></div>
    <div class="row sb"><span class="muted">Best for</span><span>${Object.entries(d.affinity).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k).join(', ')}</span></div></div>`).join('')}</div>`;
}
export { residentialRentRoll, unitRent };
