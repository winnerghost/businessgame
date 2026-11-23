// In-world location dialogs: landmarks, property listings, and the business setup wizard.
import { ctx } from '../core/ctx.js';
import { money, clamp } from '../core/utils.js';
import { ENTITY_TYPES, PERMITS, BUSINESS_TYPES, SUPPLIER_TIERS, FACTORY_LINES } from '../game/data/businessTypes.js';
import { VEHICLES } from '../game/data/vehicles.js';
import { DISTRICTS } from '../game/data/districts.js';
import { registerCompany, buyBusinessLicense, applyPermit, negotiate, TACTICS, buyVehicle } from '../game/government.js';
import { listingPrice, listingRent, leaseUnit, buyUnit, unitValue, unitRent, UNIT_TYPE_NAMES, residentialRentRoll, findTenant } from '../game/properties.js';
import { canHost, setupCost, createBusiness, randomBizName, hasLicense, permitStatus } from '../game/business.js';
import { takeLoan, aprFor, monthlyPayment, companyEquity, netWorth } from '../game/finance.js';
import { headhunt, hire } from '../game/staff.js';
import { gigOffers, startGig } from '../game/gigs.js';
import { ipoRequirements, doIPO } from '../game/stocks.js';
import { refreshTenders, bidTender } from '../game/missions.js';
import { sleepUntilMorning } from '../game/sim.js';
import { saveGame } from '../game/save.js';
import { now } from '../game/state.js';
import { candidateTable } from './apps/staff.js';
import { esc, unitSummary, districtBadge } from './apps/common.js';

const pl = () => ctx.state.economy?.priceLevel ?? 1;

export function showLocation(id) {
  const fn = {
    home: homeDlg, cityhall: () => cityHallDlg('company'), bank: () => ctx.tablet.open('bank'), realty: () => ctx.tablet.open('properties', { tab: 'listings' }),
    exchange: exchangeDlg, recruiter: recruiterDlg, wholesale: wholesaleDlg, dealer: dealerDlg, depot: depotDlg,
  }[id];
  fn?.();
  ctx.audio?.play('door');
}

// ------------------------------------------------------------------ home
function homeDlg() {
  const d = now();
  ctx.modal.open({
    title: 'Your Apartment', sub: '2B, 1st St · Northside', icon: '🏠',
    body: `<p class="note" style="font-size:14px">A small one-bedroom with a view of the alley. It's home. ${d.hour >= 20 || d.hour < 6 ? 'It\'s late — get some rest.' : ''}</p>
      <div class="grid g3"><div class="opt" data-act="sleep"><div class="h">🛏️ Sleep until 7:00 AM</div><div class="d">Skip time. Your businesses keep running overnight. Autosaves.</div></div>
      <div class="opt" data-act="save"><div class="h">💾 Save game</div><div class="d">Write your progress to the autosave slot.</div></div>
      <div class="opt" data-act="laptop"><div class="h">💻 Open laptop</div><div class="d">Manage everything from your desk.</div></div></div>`,
    handlers: {
      sleep: () => { ctx.modal.close(); ctx.bus.emit('sleep'); },
      save: () => { if (saveGame('auto')) ctx.bus.emit('toast', { title: 'Game saved', kind: 'good' }); },
      laptop: () => { ctx.modal.close(); ctx.tablet.open('dashboard'); },
    },
  });
}
export function doSleep() { sleepUntilMorning(); saveGame('auto'); }

// ------------------------------------------------------------------ city hall
function cityHallDlg(tab) {
  const s = ctx.state;
  const tabs = [['company', 'Company & license'], ['permits', 'Permits'], ['tenders', 'City tenders']];
  let body = '';
  if (tab === 'company') {
    body = s.company ? `<div class="callout gold"><b>${esc(s.company.name)}</b> — ${ENTITY_TYPES[s.company.entity].name}, registered day ${s.company.registered}.</div>
      <div class="card" style="margin-top:12px"><h3>General business license</h3>${hasLicense() ? `<span class="pill good">Active until day ${s.licenses.business.expires}</span>` : `<div class="row sb"><span>Required to operate any business.</span><button class="btn primary" data-act="license">Buy license (${money(250 * pl())}/yr)</button></div>`}</div>
      <div class="card" style="margin-top:12px"><h3>Change legal structure</h3><div class="opt-grid">${Object.values(ENTITY_TYPES).map((E) => `<div class="opt ${s.company.entity === E.id ? 'on' : ''}" ${s.company.entity === E.id ? '' : `data-act="convert" data-arg="${E.id}"`}><div class="h">${E.name}</div><div class="d">${E.liability} · tax ${(E.tax * 100).toFixed(0)}%</div><div class="p">${s.company.entity === E.id ? 'Current' : 'Convert: ' + money(E.fee * 1.5 * pl())}</div></div>`).join('')}</div></div>`
      : `<p class="note" style="font-size:13.5px">Choose a name and a legal structure for your company. This decides your tax rate, your personal liability, your credibility with banks — and whether you can ever go public.</p>
      <input type="text" id="coName" placeholder="Company name" value="${esc(ctx.modal.current?._name || '')}" maxlength="40" style="width:100%;margin-bottom:12px;font-size:15px;padding:10px">
      <div class="opt-grid">${Object.values(ENTITY_TYPES).map((E) => `<div class="opt ${ctx.modal.current?._ent === E.id ? 'on' : ''}" data-act="ent" data-arg="${E.id}"><div class="h">${E.name}</div><div class="d">${E.desc}</div><div class="p">${money(E.fee * pl())} filing${E.annual ? ` + ${money(E.annual * pl())}/yr` : ''}</div></div>`).join('')}</div>`;
  } else if (tab === 'permits') {
    const needed = [];
    for (const b of s.businesses) for (const pid of BUSINESS_TYPES[b.type].permits) needed.push({ pid, unitId: PERMITS[pid].perLocation ? b.unitId : null, b });
    const spaces = [...s.leases.map((l) => l.unitId), ...s.owned.map((o) => o.unitId)].filter((u) => ['retail', 'office', 'industrial', 'building'].includes(ctx.units[u].type));
    body = `${needed.length ? `<div class="card"><h3>Required for your businesses</h3>${needed.map(({ pid, unitId, b }) => { const st = permitStatus(pid, b.unitId); return `<div class="row sb" style="margin:8px 0"><span><b>${PERMITS[pid].name}</b> <span class="muted">· ${esc(b.name)}</span></span>${st === 'active' ? '<span class="pill good">Active</span>' : st === 'pending' ? '<span class="pill warn">Processing</span>' : `<button class="btn small primary" data-act="permit" data-arg="${pid}|${unitId || ''}">Apply ${money(PERMITS[pid].fee * pl())} · ${PERMITS[pid].days}d</button>`}</div>`; }).join('')}</div>` : '<div class="callout">Set up a business first — we\'ll show the permits it needs here. You can also apply in advance for a space below.</div>'}
      <div class="card" style="margin-top:12px"><h3>Apply for any permit</h3><div class="row wrap"><select id="pmType">${Object.values(PERMITS).filter((p) => p.id !== 'business_license').map((p) => `<option value="${p.id}">${p.name} — ${money(p.fee * pl())}, ${p.days}d</option>`).join('')}</select>
        <select id="pmUnit">${spaces.map((u) => `<option value="${u}">${esc(ctx.units[u].address)}</option>`).join('') || '<option value="">(no properties)</option>'}</select><button class="btn" data-act="permitAny">Apply</button></div>
        <div class="note" style="margin-top:8px">${Object.values(PERMITS).map((p) => `<b>${p.name}</b>: ${p.desc}`).join('<br>')}</div></div>`;
  } else {
    refreshTenders();
    body = `<p class="note">The city outsources services to local firms. Lower bids and higher reputation win more often. You may only hold one tender at a time.</p>${s.tender ? `<div class="callout gold">Active tender: <b>${esc(s.tender.title)}</b> — ${money(s.tender.bid)}, completes day ${s.tender.until}.</div>` : ''}
      <table class="t"><thead><tr><th>Tender</th><th>Sector</th><th class="r">Budget</th><th class="r">Duration</th><th class="r">Min rep</th><th class="r">Your bid</th></tr></thead><tbody>${s.tenders.map((t) => { const eligible = s.businesses.filter((b) => b.type === t.type && b.status === 'open'); return `<tr><td><b>${esc(t.title)}</b><div class="muted" style="font-size:11px">closes day ${t.closes}</div></td><td>${BUSINESS_TYPES[t.type].icon} ${BUSINESS_TYPES[t.type].name}</td><td class="r num">${money(t.value)}</td><td class="r">${t.days}d</td><td class="r">${t.minRep}</td>
        <td class="r">${eligible.length ? `<select id="tb_${t.id}">${eligible.map((b) => `<option value="${b.id}">${esc(b.name)} (rep ${Math.round(b.reputation)})</option>`).join('')}</select> <input type="number" id="tv_${t.id}" value="${Math.round(t.value * 0.9)}" step="1000" style="width:100px"> <button class="btn small primary" data-act="bid" data-arg="${t.id}">Bid</button>` : '<span class="dim">Need an open business of this type</span>'}</td></tr>`; }).join('')}</tbody></table>`;
  }
  const o = ctx.modal.current && ctx.modal.current.title === 'City Hall' ? ctx.modal.current : null;
  ctx.modal.open({
    title: 'City Hall', sub: 'Port Meridian Municipal Services', icon: '🏛️', wide: true, _name: o?._name, _ent: o?._ent,
    body: `<div class="subtabs">${tabs.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-arg="${k}">${n}</button>`).join('')}</div>${body}`,
    foot: tab === 'company' && !s.company ? [{ label: 'Cancel' }, { label: 'File registration', cls: 'primary', fn: () => { const n = document.getElementById('coName').value; const e = ctx.modal.current._ent; if (!n.trim() || !e) { ctx.bus.emit('toast', { title: 'Incomplete', text: 'Enter a name and choose a structure.', kind: 'warn' }); return false; } if (registerCompany(n, e)) { setTimeout(() => cityHallDlg('company'), 50); } return true; } }] : [{ label: 'Leave' }],
    handlers: {
      tab: (t) => cityHallDlg(t),
      ent: (id) => { ctx.modal.current._name = document.getElementById('coName')?.value; ctx.modal.current._ent = id; const n = ctx.modal.current._name; cityHallDlg('company'); ctx.modal.current._ent = id; ctx.modal.current._name = n; ctx.modal.refresh(); },
      license: () => { buyBusinessLicense(); cityHallDlg('company'); },
      convert: (id) => ctx.modal.confirm('Convert entity?', `Converting to ${ENTITY_TYPES[id].name} costs ${money(ENTITY_TYPES[id].fee * 1.5 * pl())} in legal fees.`, () => { registerCompany(s.company.name, id); setTimeout(() => cityHallDlg('company'), 50); }),
      permit: (arg) => { const [pid, u] = arg.split('|'); applyPermit(pid, u || null); cityHallDlg('permits'); },
      permitAny: () => { const pid = document.getElementById('pmType').value, u = document.getElementById('pmUnit').value; applyPermit(pid, u || null); cityHallDlg('permits'); },
      bid: (id) => { bidTender(id, document.getElementById('tb_' + id).value, parseFloat(document.getElementById('tv_' + id).value)); cityHallDlg('tenders'); },
    },
  });
}

// ------------------------------------------------------------------ exchange
function exchangeDlg() {
  const s = ctx.state;
  const eq = companyEquity();
  const reqs = ipoRequirements(eq, s.businesses.filter((b) => b.status === 'open').length);
  const ok = reqs.every((r) => r.ok) && !s.company?.public;
  ctx.modal.open({
    title: 'Port Meridian Exchange', sub: 'Trading floor & listings desk', icon: '🔔',
    body: `<div class="grid g2"><div class="opt" data-act="trade"><div class="h">📈 Trading terminal</div><div class="d">Buy and sell listed equities.</div></div><div class="opt ${s.company?.public ? 'on' : ''}"><div class="h">🏦 Listings desk</div><div class="d">${s.company?.public ? `${esc(s.company.name)} trades as <b>${s.company.ticker}</b>.` : 'Take your company public with an IPO.'}</div></div></div>
      ${s.company?.public ? '' : `<div class="card" style="margin-top:14px"><h3>IPO requirements</h3>${reqs.map((r) => `<div class="obj ${r.ok ? 'done' : ''}" style="text-decoration:none"><span class="tick"></span><span>${r.text}</span></div>`).join('')}
      ${ok ? `<div class="row" style="margin-top:12px"><span>Ticker</span><input type="text" id="tick" maxlength="4" value="${esc((s.company.name.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'VNT').toUpperCase())}" style="width:90px;text-transform:uppercase"><span class="note">Sell 25% of the company at ~${money(eq * 1.12, { compact: true })} valuation; underwriters take 6.5%.</span></div>` : ''}</div>`}`,
    foot: ok ? [{ label: 'Leave' }, { label: '🔔 Ring the bell — IPO', cls: 'primary', fn: () => { const t = (document.getElementById('tick').value || 'VNT').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); doIPO(eq, t); } }] : [{ label: 'Leave' }],
    handlers: { trade: () => { ctx.modal.close(); ctx.tablet.open('stocks'); } },
  });
}

// ------------------------------------------------------------------ recruiter
function recruiterDlg(sel = null) {
  const s = ctx.state;
  const types = [...new Set(s.businesses.map((b) => b.type))];
  const type = sel?.type || types[0] || 'cafe';
  const list = s.candidates.filter((c) => c.premium && c.typeId === type);
  ctx.modal.open({
    title: 'TalentBridge Staffing', sub: 'Executive & skilled recruitment · 15% placement fee', icon: '🤝', wide: true,
    body: `<p class="note">Our consultants source proven, high-skill candidates (65–96 skill). The placement fee is 15% of first-year wages, charged on hire.</p>
      <div class="row wrap" style="margin-bottom:12px"><select id="hhType">${(types.length ? types : Object.keys(BUSINESS_TYPES)).map((t) => `<option value="${t}" ${t === type ? 'selected' : ''}>${BUSINESS_TYPES[t].icon} ${BUSINESS_TYPES[t].name}</option>`).join('')}</select>
      ${BUSINESS_TYPES[type].roles.map((r) => `<button class="btn small" data-act="search" data-arg="${r.id}">Search: ${r.name}</button>`).join('')}</div>
      ${candidateTable(list)}`,
    foot: [{ label: 'Leave' }],
    handlers: {
      search: (role) => { const t = document.getElementById('hhType').value; headhunt(t, role); recruiterDlg({ type: t }); },
      hire: (cid) => { const bizId = document.getElementById('hb_' + cid)?.value; const w = parseFloat(document.getElementById('hw_' + cid)?.value); hire(cid, bizId, w); recruiterDlg({ type }); },
    },
  });
}

// ------------------------------------------------------------------ wholesale
function wholesaleDlg(result = null) {
  const s = ctx.state;
  ctx.modal.open({
    title: 'Ironworks Wholesale Market', sub: 'Distributors, importers and growers', icon: '📦', wide: true,
    body: `<p class="note">Sit down with a distributor and negotiate a supply agreement. Your scale, reputation and credit score improve your odds.</p>
      ${result ? `<div class="callout ${result.ok ? 'gold' : 'warn'}" style="margin-bottom:12px">${result.ok ? `🤝 Deal! ${(result.contract.discount * 100).toFixed(1)}% off all orders until day ${result.contract.until}.` : `They walked away from the table (your odds were ${Math.round(result.p * 100)}%). Try a different approach or another supplier.`}</div>` : ''}
      ${s.contracts.filter((c) => c.until > now().day).map((c) => `<div class="pill good" style="margin:0 6px 10px 0">${SUPPLIER_TIERS.find((x) => x.id === c.supplier).name}: −${(c.discount * 100).toFixed(1)}% to day ${c.until}</div>`).join('')}
      <div class="grid g3">${SUPPLIER_TIERS.map((t) => `<div class="card"><h3>${t.name}</h3><div class="note">${t.desc}</div><div class="note">Quality ${t.quality} · list price ×${t.costMul}</div><div class="stack" style="margin-top:10px">${TACTICS.map((x) => `<button class="btn small" data-act="neg" data-arg="${t.id}|${x.id}" title="${esc(x.desc)}">${x.name}</button>`).join('')}</div></div>`).join('')}</div>`,
    foot: [{ label: 'Leave' }],
    handlers: { neg: (arg) => { const [sup, tac] = arg.split('|'); const r = negotiate(sup, tac); if (r) { ctx.audio?.play(r.ok ? 'fanfare' : 'error'); wholesaleDlg(r); } } },
  });
}

// ------------------------------------------------------------------ dealer
function dealerDlg() {
  const s = ctx.state;
  const cur = VEHICLES[s.car.id];
  ctx.modal.open({
    title: 'Meridian Motors', sub: `Trade-in value of your ${cur.name}: ${money(cur.price * 0.45)}`, icon: '🚗', wide: true,
    body: `<div class="opt-grid">${Object.values(VEHICLES).map((v) => `<div class="opt ${s.car.id === v.id ? 'on' : ''}" ${s.car.id === v.id ? '' : `data-act="buy" data-arg="${v.id}"`}><div class="h">${v.name}</div><div class="d">${v.desc}</div><div class="d">Top speed ${Math.round(v.top * 3.6)} km/h · 0-100 ≈ ${(27.8 / v.accel).toFixed(1)}s${v.cargo ? ' · cargo capable' : ''}</div><div class="p">${s.car.id === v.id ? 'Your car' : money(v.price * pl())}</div></div>`).join('')}</div>
      <div class="row" style="margin-top:12px"><span class="muted">Paint</span>${['#f2f2f2', '#111316', '#8b1a1a', '#1c3f7a', '#2c5e3f', '#9aa1a8', '#b8860b', '#3d6f8f'].map((c) => `<span data-act="paint" data-arg="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};display:inline-block;cursor:pointer;border:2px solid ${ctx.modal.current?._paint === c ? '#f2c14e' : 'rgba(255,255,255,.2)'}"></span>`).join('')}</div>`,
    foot: [{ label: 'Leave' }],
    handlers: {
      paint: (c) => { ctx.modal.current._paint = c; ctx.modal.refresh(); },
      buy: (id) => { const paint = ctx.modal.current._paint; ctx.modal.confirm(`Buy the ${VEHICLES[id].name}?`, `Price ${money(VEHICLES[id].price * pl())} less trade-in ${money(cur.price * 0.45)}. It will be waiting outside.`, () => buyVehicle(id, paint ? parseInt(paint.slice(1), 16) : undefined)); },
    },
  });
}

// ------------------------------------------------------------------ depot
function depotDlg() {
  const s = ctx.state;
  const offers = (ctx._gigOffers && ctx._gigOffers.day === now().day && ctx._gigOffers.hour === now().hour) ? ctx._gigOffers.list : gigOffers();
  ctx._gigOffers = { day: now().day, hour: now().hour, list: offers };
  ctx.modal.open({
    title: 'SwiftRoute Courier Depot', sub: 'Same-day deliveries across Port Meridian', icon: '📮', wide: true,
    body: s.gig ? `<div class="callout">You're already on a job: <b>${esc(s.gig.cargo)}</b>.</div>` : `<p class="note">Pick a job. Pay depends on distance and cargo; arrive early for a speed bonus. Fragile cargo loses value every time you crash. Larger loads need a van or SUV.</p>
      <table class="t"><thead><tr><th>Cargo</th><th>From → To</th><th class="r">Distance</th><th class="r">Time</th><th class="r">Pay</th><th></th></tr></thead><tbody>${offers.map((g, i) => `<tr><td><b>${esc(g.cargo)}</b> ${g.fragile ? '<span class="pill warn">FRAGILE</span>' : ''} ${g.van ? '<span class="pill info">VAN</span>' : ''}</td><td class="muted">${esc(g.pickup.name)} → ${esc(g.drop.name)}</td><td class="r num">${(g.dist / 1000).toFixed(1)} km</td><td class="r num">${Math.floor(g.time / 60)}:${String(Math.round(g.time % 60)).padStart(2, '0')}</td><td class="r num gold">${money(g.pay)}</td><td class="r"><button class="btn small primary" data-act="take" data-arg="${i}">Accept</button></td></tr>`).join('')}</tbody></table>`,
    foot: [{ label: 'Leave' }],
    handlers: { take: (i) => { if (startGig(offers[+i])) { ctx._gigOffers = null; ctx.modal.close(); } } },
  });
}

// ------------------------------------------------------------------ property listing
export function showListing(unitId) {
  const s = ctx.state;
  const u = ctx.units[unitId];
  const l = s.listings.find((x) => x.unitId === unitId);
  const D = DISTRICTS[u.district];
  const bld = ctx.layout.buildingById[u.bId];
  const ownedByMe = s.owned.find((o) => o.unitId === unitId) || s.leases.find((o) => o.unitId === unitId);
  const fits = Object.values(BUSINESS_TYPES).filter((T) => canHost(T.id, u).ok);
  const price = l ? listingPrice(l) : unitValue(u);
  const rent = l ? listingRent(l) : unitRent(u);
  const apr = aprFor('mortgage');
  const loanAmt = Math.round(price * 0.75 / 1000) * 1000;
  const mPay = monthlyPayment(loanAmt, apr, 300);
  const rr = u.residential || u.type === 'residential' ? residentialRentRoll(u) : null;
  ctx.modal.open({
    title: `${u.label} — ${u.address}`, sub: `${UNIT_TYPE_NAMES[u.type]} in ${D.name}`, icon: '🏢', wide: true,
    body: `${unitSummary(u)}
      <div class="grid g2" style="margin-top:14px"><div class="card"><h3>Location</h3><div class="note">${esc(D.desc)}</div>
        ${u.type === 'retail' ? `<div class="meter"><span class="muted">Foot traffic</span><div class="bar"><div style="width:${clamp(u.foot, 0, 1.4) / 1.4 * 100}%"></div></div><span class="val num">${Math.round(u.foot * 100)}</span></div>` : ''}
        <div class="row sb"><span class="muted">Building</span><span>${bld.floors} floors · ${esc(bld.kind)}</span></div>
        <div class="row sb"><span class="muted">District crime</span><span>${Math.round(D.crime * 100)}</span></div></div>
      <div class="card"><h3>Suitable for</h3>${fits.length ? fits.map((T) => `<span class="pill" style="margin:2px">${T.icon} ${T.name}</span>`).join('') : '<span class="muted">Residential investment — find tenants for rental income.</span>'}
        ${rr ? `<div class="row sb" style="margin-top:10px"><span class="muted">Estimated rent roll</span><b class="num">${money(rr)}/mo</b></div><div class="row sb"><span class="muted">Gross yield</span><b class="num">${((rr * 12) / price * 100).toFixed(1)}%</b></div>` : ''}</div></div>
      ${ownedByMe ? '<div class="callout gold" style="margin-top:14px">You already control this property.</div>' : l ? `<div class="grid g2" style="margin-top:14px">
        ${l.mode !== 'sale' ? `<div class="card"><h3>Lease</h3><div style="font-size:24px;font-weight:800" class="num">${money(rent)}<span class="muted" style="font-size:13px">/month</span></div><div class="note">12-month lease · 2 months' deposit + first month due now: <b>${money(rent * 3)}</b>. Auto-renews at market rate.</div><button class="btn primary" style="margin-top:10px" data-act="lease">Sign lease</button></div>` : ''}
        ${l.mode !== 'lease' ? `<div class="card"><h3>Buy</h3><div style="font-size:24px;font-weight:800" class="num">${money(price)}</div><div class="note">+2.5% closing costs. Property tax 1.2%/yr. Values track the economy.</div><div class="row wrap" style="margin-top:10px"><button class="btn primary" data-act="buy">Buy outright</button><button class="btn" data-act="mortgage">Buy with mortgage</button></div>
          <div class="note" style="margin-top:8px">Mortgage: 25% down (${money(price - loanAmt)}) + closing, ${money(loanAmt)} at ${(apr * 100).toFixed(2)}% over 25 yrs ≈ <b>${money(mPay)}/mo</b>.</div></div>` : ''}</div>` : '<div class="callout warn" style="margin-top:14px">This property is not currently on the market.</div>'}`,
    foot: [{ label: 'Close' }, { label: '📍 Set waypoint', fn: () => { s.waypoint = { x: bld.door.x, z: bld.door.z, label: u.address }; } }],
    handlers: {
      lease: () => { if (leaseUnit(unitId)) { ctx.modal.close(); offerSetup(unitId); } },
      buy: () => { if (buyUnit(unitId)) { ctx.modal.close(); offerSetup(unitId); } },
      mortgage: () => {
        if (s.credit.score < 600) { ctx.bus.emit('toast', { title: 'Mortgage declined', text: 'Credit score below 600.', kind: 'bad' }); return; }
        const down = price - loanAmt + price * 0.025;
        if (s.cash < down) { ctx.bus.emit('toast', { title: 'Insufficient funds', text: `Need ${money(down)} for down payment & closing.`, kind: 'bad' }); return; }
        const loan = takeLoan('mortgage', loanAmt, 300, { secured: unitId, purpose: u.address });
        if (loan && buyUnit(unitId, { mortgageId: loan.id, price })) { ctx.modal.close(); offerSetup(unitId); }
      },
    },
  });
}

function offerSetup(unitId) {
  const u = ctx.units[unitId];
  if (!Object.values(BUSINESS_TYPES).some((T) => canHost(T.id, u).ok)) {
    ctx.modal.confirm('Residential property acquired', 'Would you like Keystone Realty to find tenants for rental income?', () => findTenant(unitId), { yes: 'Find tenants' });
    return;
  }
  setTimeout(() => showSetupWizard(unitId), 300);
}

// ------------------------------------------------------------------ business setup wizard
export function showSetupWizard(unitId, st = {}) {
  const s = ctx.state;
  const u = ctx.units[unitId];
  const type = st.type || null;
  const T = type && BUSINESS_TYPES[type];
  const tier = st.tier ?? 1;
  const line = st.line || 'coffee';
  const cost = T ? setupCost(type, u, tier) : null;
  const D = DISTRICTS[u.district];
  const options = Object.values(BUSINESS_TYPES).map((B) => ({ B, chk: canHost(B.id, u) }));
  ctx.modal.open({
    title: 'Start a business', sub: `${u.label} · ${u.address} · ${u.area} m² · ${D.name}`, icon: '🏗️', wide: true,
    body: `<h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)">1. Choose a business</h3>
      <div class="opt-grid">${options.map(({ B, chk }) => `<div class="opt ${type === B.id ? 'on' : ''} ${chk.ok ? '' : 'off'}" ${chk.ok ? `data-act="type" data-arg="${B.id}"` : ''}><div class="h">${B.icon} ${B.name}</div><div class="d">${chk.ok ? B.blurb : chk.why}</div>${chk.ok ? `<div class="d">Local demand ×${(D.affinity[B.id] ?? 0.5).toFixed(2)}</div>` : ''}</div>`).join('')}</div>
      ${T ? `<h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-top:18px">2. Equipment & fit-out</h3>
        <div class="opt-grid">${T.equipment.map((e, i) => `<div class="opt ${tier === i ? 'on' : ''}" data-act="tier" data-arg="${i}"><div class="h">${e.tier}</div><div class="d">Quality ${e.quality} · capacity ×${e.capacity}</div><div class="p">${money(setupCost(type, u, i).equip)}</div></div>`).join('')}</div>
        ${T.model === 'factory' ? `<h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-top:18px">Product line</h3><div class="opt-grid">${Object.values(FACTORY_LINES).map((L) => `<div class="opt ${line === L.id ? 'on' : ''}" data-act="line" data-arg="${L.id}"><div class="h">${L.name}</div><div class="d">${L.raw} → ${L.output}. ${L.feeds.length ? 'Supplies your ' + L.feeds.join(', ') : 'Wholesale only'}.</div></div>`).join('')}</div>` : ''}
        <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-top:18px">3. Name</h3>
        <div class="row"><input type="text" id="bzName" value="${esc(st.name || randomBizName(type))}" maxlength="40" style="flex:1;font-size:15px;padding:10px"><button class="btn" data-act="reroll">🎲</button></div>
        <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Startup costs</h3><div class="row sb"><span class="muted">Fit-out (${u.area} m² × ${money(T.fitoutPerM2 * pl())})</span><b class="num">${money(cost.fit)}</b></div><div class="row sb"><span class="muted">Equipment</span><b class="num">${money(cost.equip)}</b></div><div class="row sb" style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><b>Due now</b><b class="num gold">${money(cost.total)}</b></div><div class="note">Fit-out takes ${T.fitoutDays} days. Budget extra for permits, opening stock and the first payroll.</div></div>
        <div class="card"><h3>Before you can open</h3><div class="note">${s.company ? '✓ Company registered' : '✗ Register a company (City Hall)'}<br>${hasLicense() ? '✓ Business license' : '✗ Business license (City Hall)'}<br>${T.permits.length ? T.permits.map((p) => `${permitStatus(p, unitId) === 'active' ? '✓' : '✗'} ${PERMITS[p].name} (${money(PERMITS[p].fee * pl())}, ${PERMITS[p].days}d)`).join('<br>') : '✓ No special permits'}<br>✗ Hire: ${T.roles.filter((r) => r.required).map((r) => r.name).join(', ')}${T.model === 'retail' ? '<br>✗ Order opening stock' : ''}${type === 'logistics' ? '<br>✗ Buy at least one truck' : ''}</div></div></div>` : ''}`,
    foot: T ? [{ label: 'Cancel' }, { label: `Start fit-out (${money(cost.total)})`, cls: 'primary', fn: () => { const name = document.getElementById('bzName').value.trim(); const b = createBusiness(unitId, type, { name, tier, line }); if (b) setTimeout(() => ctx.tablet.open('businesses', { id: b.id, tab: 'overview' }), 200); return !!b; } }] : [{ label: 'Cancel' }],
    handlers: {
      type: (t) => showSetupWizard(unitId, { type: t, tier: 1 }),
      tier: (i) => showSetupWizard(unitId, { ...st, type, tier: +i, name: document.getElementById('bzName')?.value }),
      line: (l) => showSetupWizard(unitId, { ...st, type, tier, line: l, name: document.getElementById('bzName')?.value }),
      reroll: () => showSetupWizard(unitId, { ...st, type, tier, line, name: randomBizName(type) }),
    },
  });
}

export function showBusinessDoor(b) {
  ctx.tablet.open('businesses', { id: b.id, tab: 'overview' });
}
export { districtBadge, netWorth };
