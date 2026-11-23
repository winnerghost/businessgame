import { ctx } from '../../core/ctx.js';
import { money, clamp } from '../../core/utils.js';
import { plSummary, CATS, now } from '../../game/state.js';
import { BUSINESS_TYPES, SUPPLIER_TIERS, FACTORY_LINES, UPGRADES, MARKETING, TAX } from '../../game/data/businessTypes.js';
import {
  trailing, valuation, openingChecklist, openBusiness, setPaused, refPrice, unitCostOf, priceIndex, marketShare, competitorsFor, pendingQty,
  orderStock, restockNow, setPrice, setHours, supplierOf, ownFactoryFor, computeQuality, avgMorale, hourlyCapacity, runCampaign, upgradeCost,
  upgradeApplies, buyUpgrade, upgradeEquipment, sellBusiness, closeBusiness, rename, acceptLead, declineLead, agencyCapacity, buyTruck,
  factoryCapacity, factoryRefPrice, hotelRooms, fixedCostsMonthly, openHoursPerDay, priceLevel, inventoryValue, typeDef,
} from '../../game/business.js';
import { roleDef, productivity, fire, giveRaise, train, trainingCost, marketWage } from '../../game/staff.js';
import { esc, statusPill, bizIcon, districtBadge } from './common.js';
import { meter, stars } from '../dom.js';
import { showSetupWizard } from '../locations.js';

const TABS = [['overview', 'Overview'], ['ops', 'Operations'], ['staff', 'Staff'], ['marketing', 'Marketing'], ['upgrades', 'Upgrades'], ['finance', 'Finances'], ['reviews', 'Reviews']];
const biz = (id) => ctx.state.businesses.find((b) => b.id === id);

function listView(T) {
  const s = ctx.state;
  const vacant = [...s.leases.map((l) => l.unitId), ...s.owned.filter((o) => o.use !== 'rental' && o.use !== 'listing').map((o) => o.unitId)]
    .filter((u) => !s.businesses.some((b) => b.unitId === u) && ['retail', 'office', 'industrial', 'building'].includes(ctx.units[u]?.type));
  return `
    ${vacant.length ? `<div class="callout gold" style="margin-bottom:14px"><b>You have ${vacant.length} empty space${vacant.length > 1 ? 's' : ''} ready for a business.</b> ${vacant.map((u) => `<button class="btn small primary" style="margin-left:8px" data-act="setup" data-arg="${u}">Set up at ${esc(ctx.units[u].address)}</button>`).join('')}</div>` : ''}
    ${s.businesses.length ? `<div class="grid g3">${s.businesses.map((b) => {
      const tr = trailing(b, 30);
      const Ty = BUSINESS_TYPES[b.type];
      return `<div class="card click" data-act="open" data-arg="${b.id}">
        <div class="row">${bizIcon(b, 44)}<div style="min-width:0"><div style="font-weight:800;font-size:15px">${esc(b.name)}</div><div class="muted" style="font-size:12px">${Ty.name} · ${esc(ctx.units[b.unitId].address)}</div></div></div>
        <div class="row sb" style="margin-top:12px">${statusPill(b)} ${districtBadge(b.district)}</div>
        <div class="grid g3" style="margin-top:12px">
          <div class="kpi"><div class="l">30d rev</div><div class="v num" style="font-size:16px">${money(tr.rev, { compact: true })}</div></div>
          <div class="kpi"><div class="l">30d profit</div><div class="v num ${tr.profit >= 0 ? 'good' : 'bad'}" style="font-size:16px">${money(tr.profit, { compact: true })}</div></div>
          <div class="kpi"><div class="l">Value</div><div class="v num" style="font-size:16px">${money(valuation(b), { compact: true })}</div></div>
        </div>
        ${T.chart([{ data: b.hist.slice(-30).map((h) => h.profit), type: 'bar' }], { noAxis: true }, 'short')}
      </div>`;
    }).join('')}</div>` : `<div class="empty"><div class="big">🏗️</div><div style="font-size:16px;font-weight:700">You don't run any businesses yet</div><p class="note">1. Register a company at City Hall · 2. Lease or buy a space (Properties) · 3. Set up a business there · 4. Permits, staff & stock · 5. Open!</p><button class="btn primary" data-act="props">Find a property</button></div>`}`;
}

function detailView(b, tab, T) {
  const Ty = typeDef(b);
  const u = ctx.units[b.unitId];
  const tr = trailing(b, 30);
  const head = `<div class="bizhead">${bizIcon(b)}<div style="flex:1;min-width:0"><h1>${esc(b.name)}</h1><div class="muted">${Ty.name} · ${esc(u.address)} · ${u.area} m² ${districtBadge(b.district)} ${statusPill(b)}</div></div>
    <div class="row wrap">
      ${b.status === 'ready' ? `<button class="btn primary" data-act="openBiz" data-arg="${b.id}">🎉 Open for business</button>` : ''}
      ${b.status === 'open' ? `<button class="btn" data-act="pause" data-arg="${b.id}">Pause</button>` : ''}
      ${b.status === 'paused' ? `<button class="btn good" data-act="resume" data-arg="${b.id}">Resume</button>` : ''}
      <button class="btn" data-act="waypoint" data-arg="${b.id}">📍 Waypoint</button>
      <button class="btn" data-act="rename" data-arg="${b.id}">Rename</button>
      <button class="btn" data-act="back">← All</button>
    </div></div>
    <div class="subtabs">${TABS.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-arg="${k}">${n}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'overview') body = overview(b, Ty, tr, T);
  else if (tab === 'ops') body = operations(b, Ty, T);
  else if (tab === 'staff') body = staffTab(b, Ty);
  else if (tab === 'marketing') body = marketingTab(b);
  else if (tab === 'upgrades') body = upgradesTab(b, Ty);
  else if (tab === 'finance') body = financeTab(b, T);
  else if (tab === 'reviews') body = reviewsTab(b);
  return head + body;
}

function overview(b, Ty, tr, T) {
  const checklist = b.status === 'fitout' || b.status === 'ready' ? openingChecklist(b) : null;
  const comps = competitorsFor(b);
  const share = ['retail', 'membership'].includes(Ty.model) ? marketShare(b) : null;
  const last = b.lastDay || {};
  const hours = Ty.model === 'retail' || Ty.model === 'membership' ? `${b.hours[0]}:00 – ${b.hours[1] % 24}:00` : '';
  const model = Ty.model;
  let extra = '';
  if (model === 'membership') extra = `<div class="kpi"><div class="l">Members</div><div class="v num">${b.members.toLocaleString()}</div><div class="s">+${last.signups || 0} yesterday</div></div>`;
  else if (model === 'hotel') extra = `<div class="kpi"><div class="l">Occupancy</div><div class="v num">${Math.round((b.occupancy || 0) * 100)}%</div><div class="s">${hotelRooms(b)} rooms</div></div>`;
  else if (model === 'agency') extra = `<div class="kpi"><div class="l">Active contracts</div><div class="v num">${b.contracts.length}</div><div class="s">${b.leads.length} leads · ${b.completed || 0} done</div></div>`;
  else if (model === 'factory') extra = `<div class="kpi"><div class="l">Finished goods</div><div class="v num">${Math.round(b.finished).toLocaleString()}</div><div class="s">${FACTORY_LINES[b.line].output}</div></div>`;
  else extra = `<div class="kpi"><div class="l">Customers yesterday</div><div class="v num">${(last.served || 0).toLocaleString()}</div><div class="s">${last.lost ? `<span class="bad">${last.lost} turned away</span>` : 'none turned away'}</div></div>`;
  return `
    ${checklist ? `<div class="card" style="margin-bottom:14px"><h3>Opening checklist</h3><div class="chk-list">${checklist.map((i) => `<div class="it ${i.ok ? 'ok' : i.pending ? 'pend' : 'no'}"><span class="dot">${i.ok ? '✓' : i.pending ? '…' : ''}</span>${esc(i.text)}${i.pending ? ' <span class="pill warn">processing</span>' : ''}</div>`).join('')}</div>
      <div class="row" style="margin-top:12px">${Ty.model === 'retail' ? `<button class="btn" data-act="restock" data-arg="${b.id}">Order opening stock</button>` : ''}<button class="btn" data-act="hire" data-arg="${b.id}">Hire staff</button>${b.status === 'ready' ? `<button class="btn primary" data-act="openBiz" data-arg="${b.id}">Open for business</button>` : ''}</div>
      ${checklist.some((i) => i.permit && !i.ok && !i.pending) ? '<div class="note" style="margin-top:8px">Permits are issued at <b>City Hall</b> — drive there and walk in (press E at the entrance).</div>' : ''}</div>` : ''}
    <div class="grid g5">
      <div class="card kpi"><div class="l">30d revenue</div><div class="v num">${money(tr.rev, { compact: true })}</div><div class="s">${money(tr.avgRev)}/day</div></div>
      <div class="card kpi"><div class="l">30d profit</div><div class="v num ${tr.profit >= 0 ? 'good' : 'bad'}">${money(tr.profit, { compact: true })}</div><div class="s">margin ${tr.rev ? Math.round((tr.profit / tr.rev) * 100) : 0}%</div></div>
      <div class="card kpi"><div class="l">Valuation</div><div class="v num gold">${money(valuation(b), { compact: true })}</div><div class="s">${Ty.valuation}× earnings multiple</div></div>
      <div class="card kpi">${extra}</div>
      <div class="card kpi"><div class="l">${share !== null ? 'Market share' : 'Capacity used'}</div><div class="v num">${share !== null ? Math.round(share * 100) + '%' : Math.round((last.cap ? last.served / last.cap : 0) * 100) + '%'}</div><div class="s">${share !== null ? `${comps.length} competitor${comps.length === 1 ? '' : 's'} nearby` : ''}</div></div>
    </div>
    <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-top:14px">
      <div class="card"><h3>Revenue & profit (30 days)</h3>${T.chart([{ data: b.hist.slice(-30).map((h) => h.revenue), color: '#5aa9ff', fill: true }, { data: b.hist.slice(-30).map((h) => h.profit), color: '#f2c14e' }], { fmt: (v) => money(v, { compact: true }) }, 'tall')}
        <div class="legend"><span><i style="background:#5aa9ff"></i>Revenue</span><span><i style="background:#f2c14e"></i>Profit</span>${hours ? `<span class="sp"></span><span>Hours ${hours}</span>` : ''}</div></div>
      <div class="card"><h3>Health</h3>
        ${meter('Quality', computeQuality(b))}${meter('Reputation', b.reputation, 100, 'good')}${meter('Awareness', b.awareness * 100, 100, 'info')}${meter('Satisfaction', b.satisfaction)}${meter('Staff morale', avgMorale(b), 100, avgMorale(b) < 45 ? 'bad' : 'good')}
        ${Ty.model === 'retail' ? meter('Price index', priceIndex(b) * 100, 200) + `<div class="note">100 = market price. Higher prices raise margin but cut demand and satisfaction.</div>` : ''}
      </div>
    </div>
    ${Ty.model === 'retail' ? `<div class="card" style="margin-top:14px"><h3>Customers by hour (today)</h3>${T.chart([{ data: b.hourly.slice(), type: 'bar', color: '#5aa9ff' }], { labels: Array.from({ length: 24 }, (_, i) => i + 'h') })}</div>` : ''}
    ${comps.length ? `<div class="card" style="margin-top:14px"><h3>Local competition — ${esc(BUSINESS_TYPES[b.type].name)} in this district</h3><table class="t"><thead><tr><th>Name</th><th class="r">Quality</th><th class="r">Reputation</th><th class="r">Price index</th><th class="r">Awareness</th></tr></thead><tbody>
      <tr><td><b>${esc(b.name)} (you)</b></td><td class="r num">${Math.round(b.quality)}</td><td class="r num">${Math.round(b.reputation)}</td><td class="r num">${priceIndex(b).toFixed(2)}</td><td class="r num">${Math.round(b.awareness * 100)}%</td></tr>
      ${comps.map((c) => `<tr><td>${esc(c.name)} ${c.krane ? '<span class="pill bad">KRANE</span>' : ''}</td><td class="r num">${Math.round(c.quality)}</td><td class="r num">${Math.round(c.reputation)}</td><td class="r num">${c.priceIdx.toFixed(2)}</td><td class="r num">${Math.round(c.awareness * 100)}%</td></tr>`).join('')}
    </tbody></table></div>` : ''}`;
}

function operations(b, Ty, T) {
  const sup = supplierOf(b);
  const hourOpts = (sel) => Array.from({ length: 25 }, (_, h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  const hoursCard = (Ty.model === 'retail' || Ty.model === 'membership') ? `<div class="card"><h3>Opening hours</h3><div class="row"><select data-change="hOpen" data-arg="${b.id}">${hourOpts(b.hours[0])}</select><span>to</span><select data-change="hClose" data-arg="${b.id}">${hourOpts(b.hours[1])}</select><span class="muted">${openHoursPerDay(b)} h/day</span></div><div class="note" style="margin-top:8px">Staff are paid for every open hour. Match hours to the demand curve of your trade.</div></div>` : '';
  if (Ty.model === 'retail') {
    const ownF = ownFactoryFor(b);
    return `
      <div class="card"><h3>Pricing & inventory <span class="muted" style="text-transform:none;letter-spacing:0">Prices excl. ${(TAX.sales * 100).toFixed(2)}% sales tax</span></h3>
        <div class="price-row muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em"><span>Product</span><span>Unit cost</span><span>Market</span><span>Your price</span><span>Stock</span></div>
        ${Ty.products.map((p) => {
          const ref = refPrice(b, p), cost = unitCostOf(b, p) * sup.costMul, price = b.prices[p.id];
          const margin = (price - cost) / price;
          const hist = b.sold[p.id] || [];
          const f = hist.length ? hist.slice(-5).reduce((a, x) => a + x, 0) / Math.min(5, hist.length) : 0;
          return `<div class="price-row"><span><b>${esc(p.name)}</b><br><span class="muted" style="font-size:11px">shelf ${p.shelf}d · elasticity ${p.elasticity}</span></span>
            <span class="num">${money(cost, { decimals: 2 })}<br><span class="${margin > 0.4 ? 'good' : margin > 0.15 ? 'warn' : 'bad'}" style="font-size:11px">${Math.round(margin * 100)}% margin</span></span>
            <span class="num">${money(ref, { decimals: 2 })}</span>
            <span class="row"><button class="btn small" data-act="price" data-arg="${b.id}|${p.id}|-0.05">−</button><input type="number" step="0.05" value="${price.toFixed(2)}" data-change="setPrice" data-arg="${b.id}|${p.id}" style="width:80px"><button class="btn small" data-act="price" data-arg="${b.id}|${p.id}|0.05">+</button></span>
            <span class="num">${Math.floor(b.stock[p.id] || 0).toLocaleString()} <span class="muted">${pendingQty(b, p.id) ? `+${pendingQty(b, p.id)} inbound` : ''}</span><br><span class="muted" style="font-size:11px">demand ≈ ${Math.round(f)}/day</span>
              <span class="row" style="margin-top:4px"><input type="number" min="1" value="${Math.max(10, Math.round(f || 40))}" id="q_${p.id}" style="width:70px"><button class="btn small" data-act="order" data-arg="${b.id}|${p.id}">Order</button></span></span></div>`;
        }).join('')}
        <div class="row" style="margin-top:12px"><label class="chk"><input type="checkbox" ${b.autoRestock ? 'checked' : ''} data-change="autoRestock" data-arg="${b.id}"> Auto-reorder nightly</label>
          <span class="muted">Target</span><select data-change="restockDays" data-arg="${b.id}">${[1, 2, 3, 5, 7, 14].map((d) => `<option ${d === b.restockDays ? 'selected' : ''} value="${d}">${d} day${d > 1 ? 's' : ''} of stock</option>`).join('')}</select>
          <span class="sp"></span><button class="btn" data-act="restock" data-arg="${b.id}">Reorder now</button></div>
        <div class="note" style="margin-top:6px">${b.staff.some((e) => roleDef(b.type, e.role)?.manager) ? '✓ Your manager forecasts demand accurately.' : 'No manager: automatic orders are rough guesses (±30%). Hire a manager for accurate forecasting.'} Inventory value: ${money(inventoryValue(b))}.</div>
      </div>
      <div class="card" style="margin-top:14px"><h3>Supplier</h3><div class="opt-grid">
        ${SUPPLIER_TIERS.map((t) => { const c = ctx.state.contracts.find((x) => x.supplier === t.id && x.until > now().day); return `<div class="opt ${b.supplier === t.id ? 'on' : ''}" data-act="supplier" data-arg="${b.id}|${t.id}"><div class="h">${t.name}</div><div class="d">${t.desc}</div><div class="d">Quality ${t.quality} · cost ×${t.costMul.toFixed(2)} · lead ${t.lead}d${c ? ` · <span class="good">contract −${Math.round(c.discount * 100)}%</span>` : ''}</div></div>`; }).join('')}
        ${ownF ? `<div class="opt ${b.supplier === 'own' ? 'on' : ''}" data-act="supplier" data-arg="${b.id}|own"><div class="h">🏭 ${esc(ownF.name)} (your factory)</div><div class="d">Vertical integration: goods at production cost. Quality ${Math.round(ownF.quality)}. Stock: ${Math.round(ownF.finished)}</div></div>` : ''}
      </div><div class="note" style="margin-top:8px">Negotiate discounted supply contracts in person at the Ironworks Wholesale Market.</div></div>
      <div class="grid g2" style="margin-top:14px">${hoursCard}<div class="card"><h3>Capacity</h3><div class="row sb"><span class="muted">Service capacity</span><b class="num">${Math.round(hourlyCapacity(b))} customers/hour</b></div><div class="row sb"><span class="muted">Peak demand yesterday</span><b class="num">${Math.max(0, ...b.hourly)} /hour</b></div><div class="note" style="margin-top:8px">Capacity comes from staff skill & morale, equipment tier and ${Ty.seatsPerM2 ? 'seating' : 'floor space'}.</div></div></div>`;
  }
  if (Ty.model === 'membership') {
    return `<div class="card"><h3>Membership pricing</h3>${Ty.products.map((p) => `<div class="price-row"><span><b>${esc(p.name)}</b></span><span></span><span class="num">${money(refPrice(b, p))}</span><span class="row"><button class="btn small" data-act="price" data-arg="${b.id}|${p.id}|-0.05">−</button><input type="number" step="1" value="${b.prices[p.id].toFixed(2)}" data-change="setPrice" data-arg="${b.id}|${p.id}" style="width:80px"><button class="btn small" data-act="price" data-arg="${b.id}|${p.id}|0.05">+</button></span><span></span></div>`).join('')}
      <div class="grid g3" style="margin-top:14px"><div class="kpi"><div class="l">Members</div><div class="v num">${b.members.toLocaleString()}</div></div><div class="kpi"><div class="l">Floor capacity</div><div class="v num">${Math.round(b.area / Ty.m2PerUser)}</div><div class="s">concurrent users</div></div><div class="kpi"><div class="l">Peak crowding</div><div class="v num ${(b.lastDay?.crowd || 0) > 1 ? 'bad' : ''}">${Math.round((b.lastDay?.crowd || 0) * 100)}%</div></div></div>
      <div class="note" style="margin-top:8px">Overcrowding drives churn. Personal trainers sell PT sessions and lift satisfaction. January is peak signup season.</div></div><div style="margin-top:14px">${hoursCard}</div>`;
  }
  if (Ty.model === 'hotel') {
    const p = Ty.products[0];
    return `<div class="card"><h3>Room rate</h3><div class="price-row"><span><b>Average daily rate</b></span><span class="num">${money(unitCostOf(b, p))} cost/night</span><span class="num">${money(refPrice(b, p))} market</span><span class="row"><button class="btn small" data-act="price" data-arg="${b.id}|room|-0.05">−</button><input type="number" step="5" value="${b.prices.room.toFixed(0)}" data-change="setPrice" data-arg="${b.id}|room" style="width:90px"><button class="btn small" data-act="price" data-arg="${b.id}|room|0.05">+</button></span><span></span></div>
      <div class="grid g3" style="margin-top:14px"><div class="kpi"><div class="l">Rooms</div><div class="v num">${hotelRooms(b)}</div></div><div class="kpi"><div class="l">Occupancy</div><div class="v num">${Math.round((b.occupancy || 0) * 100)}%</div></div><div class="kpi"><div class="l">Housekeeping capacity</div><div class="v num">${Math.round(b.staff.filter((e) => e.role === 'housekeeper').reduce((a, e) => a + 14 * productivity(e), 0))}</div><div class="s">rooms/day</div></div></div>
      <div class="note" style="margin-top:8px">Each housekeeper turns ~14 rooms per day. OTAs take 17% commission on most bookings. Summer and weekends are peak season.</div></div>`;
  }
  if (Ty.model === 'agency') {
    const cap = agencyCapacity(b);
    const backlog = b.contracts.reduce((a, c) => a + c.hours - c.progress, 0);
    return `<div class="grid g2"><div class="card"><h3>Billing rate</h3><div class="row"><button class="btn small" data-act="price" data-arg="${b.id}|rate|-0.05">−</button><input type="number" step="5" value="${b.prices.rate.toFixed(0)}" data-change="setPrice" data-arg="${b.id}|rate" style="width:90px"><button class="btn small" data-act="price" data-arg="${b.id}|rate|0.05">+</button><span class="muted">/hour · market ${money(refPrice(b, Ty.products[0]))}</span></div>
        <div class="note" style="margin-top:8px">Clients compare your rate to their budget. Higher reputation raises what they'll pay.</div>
        <label class="chk" style="margin-top:10px"><input type="checkbox" ${b.autoAccept ? 'checked' : ''} data-change="autoAccept" data-arg="${b.id}"> Manager auto-accepts profitable leads</label></div>
      <div class="card"><h3>Delivery capacity</h3><div class="row sb"><span class="muted">${b.type === 'logistics' ? 'Truck-hours' : 'Billable hours'} per workday</span><b class="num">${Math.round(cap)}</b></div><div class="row sb"><span class="muted">Backlog</span><b class="num">${Math.round(backlog)} h (${cap ? (backlog / cap).toFixed(1) : '∞'} days)</b></div>
        ${b.type === 'logistics' ? `<div class="row sb"><span class="muted">Fleet</span><b>${b.trucks} truck${b.trucks === 1 ? '' : 's'}</b></div><button class="btn" style="margin-top:8px" data-act="truck" data-arg="${b.id}">Buy truck (${money(68000 * priceLevel())})</button>` : ''}</div></div>
      <div class="card" style="margin-top:14px"><h3>Incoming leads</h3>${b.leads.length ? `<table class="t"><thead><tr><th>Client</th><th>Project</th><th class="r">Hours</th><th class="r">Budget/h</th><th class="r">Value at your rate</th><th class="r">Deadline</th><th></th></tr></thead><tbody>${b.leads.map((l) => `<tr><td>${esc(l.client)} ${l.big ? '<span class="pill gold">BIG</span>' : ''}</td><td>${esc(l.title)}</td><td class="r num">${l.hours}</td><td class="r num ${l.budgetRate >= b.prices.rate ? 'good' : 'bad'}">${money(l.budgetRate)}</td><td class="r num">${money(l.hours * b.prices.rate)}</td><td class="r">${l.deadlineDays} days</td><td class="r"><button class="btn small good" data-act="accept" data-arg="${b.id}|${l.id}">Bid</button> <button class="btn small" data-act="decline" data-arg="${b.id}|${l.id}">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted">No leads right now. Sales staff, reputation and B2B marketing generate more.</div>'}</div>
      <div class="card" style="margin-top:14px"><h3>Active contracts</h3>${b.contracts.length ? b.contracts.map((c) => `<div style="margin:10px 0"><div class="row sb"><span><b>${esc(c.client)}</b> — ${esc(c.title)}</span><span class="num">${money(c.value)} · due ${c.due < now().day ? `<span class="bad">${now().day - c.due}d LATE</span>` : `in ${c.due - now().day}d`}</span></div><div class="bar ${c.due < now().day ? 'bad' : 'good'}" style="margin-top:6px"><div style="width:${(c.progress / c.hours) * 100}%"></div></div><div class="muted" style="font-size:11px;margin-top:3px">${Math.round(c.progress)} / ${c.hours} h</div></div>`).join('') : '<div class="muted">No active contracts.</div>'}</div>`;
  }
  if (Ty.model === 'factory') {
    const L = FACTORY_LINES[b.line];
    const ref = factoryRefPrice(b);
    return `<div class="grid g2"><div class="card"><h3>${esc(L.name)}</h3><div class="row sb"><span class="muted">Input</span><b>${esc(L.raw)} · ${money(b.rawUnitCost || L.rawCost, { decimals: 2 })}/unit</b></div><div class="row sb"><span class="muted">Output</span><b>${esc(L.output)}</b></div><div class="row sb"><span class="muted">Daily capacity</span><b class="num">${Math.round(factoryCapacity(b)).toLocaleString()} units</b></div><div class="row sb"><span class="muted">Finished goods</span><b class="num">${Math.round(b.finished).toLocaleString()} (${money(b.finishedCost)})</b></div>
        ${L.feeds.length ? `<div class="note" style="margin-top:8px">Your ${L.feeds.map((f) => BUSINESS_TYPES[f].name.toLowerCase()).join(', ')} businesses can source from this plant at cost (Operations → Supplier).</div>` : ''}</div>
      <div class="card"><h3>Wholesale sales</h3><div class="row"><button class="btn small" data-act="fprice" data-arg="${b.id}|-0.05">−</button><input type="number" step="0.1" value="${b.factoryPrice.toFixed(2)}" data-change="fsetPrice" data-arg="${b.id}" style="width:90px"><button class="btn small" data-act="fprice" data-arg="${b.id}|0.05">+</button><span class="muted">market ${money(ref, { decimals: 2 })}</span></div>
        <div class="row" style="margin-top:10px"><label class="chk"><input type="radio" name="sm" ${b.sellMode === 'market' ? 'checked' : ''} data-change="sellMode" data-arg="${b.id}|market"> Sell on wholesale market</label><label class="chk"><input type="radio" name="sm" ${b.sellMode === 'stores' ? 'checked' : ''} data-change="sellMode" data-arg="${b.id}|stores"> Reserve for my stores</label></div>
        <div class="note" style="margin-top:8px">Market depth ≈ ${L.marketDepth.toLocaleString()} units/day at market price; pricing above market sells less. Quality improves demand.</div></div></div>`;
  }
  return '';
}

function staffTab(b, Ty) {
  const roles = Ty.roles.map((r) => {
    const n = b.staff.filter((e) => e.role === r.id).length;
    return `<span class="pill ${r.required && !n ? 'bad' : n ? 'good' : ''}">${esc(r.name)}: ${n}${r.max ? '/' + r.max : ''}${r.required ? ' *' : ''}</span>`;
  }).join(' ');
  const payroll = b.staff.reduce((a, e) => a + e.wage, 0);
  const hrs = Ty.model === 'retail' || Ty.model === 'membership' ? openHoursPerDay(b) : 8;
  return `<div class="row sb" style="margin-bottom:12px"><div class="row wrap">${roles}</div><button class="btn primary" data-act="hire" data-arg="${b.id}">+ Hire</button></div>
    <div class="note" style="margin-bottom:10px">* required to operate. Payroll ≈ ${money(payroll * hrs * (1 + TAX.payroll))}/day incl. payroll tax (${hrs} paid hours/day).</div>
    ${b.staff.length ? `<table class="t"><thead><tr><th>Name</th><th>Role</th><th class="r">Skill</th><th class="r">Morale</th><th class="r">Wage</th><th class="r">Market</th><th>Traits</th><th class="r">Actions</th></tr></thead><tbody>
    ${b.staff.map((e) => { const r = roleDef(b.type, e.role); const mw = marketWage(b.type, e.role, e.skill); return `<tr><td><b>${esc(e.name)}</b><div class="muted" style="font-size:11px">since day ${e.hired} · ${e.age}y</div></td><td>${esc(r?.name || e.role)}</td><td class="r num">${Math.round(e.skill)}${e.training ? ` <span class="pill info">T${e.training}</span>` : ''}</td><td class="r num ${e.morale < 40 ? 'bad' : e.morale > 70 ? 'good' : ''}">${Math.round(e.morale)}</td><td class="r num">${money(e.wage, { decimals: 2 })}</td><td class="r num ${e.wage < mw * 0.95 ? 'bad' : 'muted'}">${money(mw, { decimals: 2 })}</td><td>${e.traits.map((t) => `<span class="pill">${t}</span>`).join(' ')}</td>
      <td class="r"><button class="btn small" data-act="raise" data-arg="${b.id}|${e.id}|0.05">+5%</button> <button class="btn small" data-act="train" data-arg="${b.id}|${e.id}" title="${money(trainingCost(e))}">Train</button> <button class="btn small bad" data-act="fire" data-arg="${b.id}|${e.id}">Fire</button></td></tr>`; }).join('')}
    </tbody></table>` : '<div class="empty">No staff yet.</div>'}`;
}

function marketingTab(b) {
  const pl = priceLevel();
  return `<div class="grid g2" style="margin-bottom:14px"><div class="card">${meter('Awareness', b.awareness * 100, 100, 'info')}<div class="note">Share of potential customers who know ${esc(b.name)} exists. Decays ~1%/day without word-of-mouth or campaigns.</div></div>
    <div class="card"><h3>Active campaigns</h3>${b.campaigns.length ? b.campaigns.map((c) => `<div class="row sb"><span>${esc(MARKETING.find((m) => m.id === c.id)?.name || c.id)}</span><span class="muted">until day ${c.until}</span></div>`).join('') : '<div class="muted">None running.</div>'}</div></div>
    <div class="opt-grid">${MARKETING.filter((m) => !m.b2b || typeDef(b).model === 'agency').map((m) => `<div class="opt" data-act="campaign" data-arg="${b.id}|${m.id}"><div class="h">${esc(m.name)}</div><div class="d">${esc(m.desc)}</div><div class="d">${m.instant ? 'Instant' : m.days + ' days'} · ${m.scope === 'city' ? 'all your businesses' : 'this location'}</div><div class="p">${money(m.cost * pl)}</div></div>`).join('')}</div>`;
}

function upgradesTab(b, Ty) {
  const u = ctx.units[b.unitId];
  const nextTier = Ty.equipment[b.tier + 1];
  return `<div class="card" style="margin-bottom:14px"><h3>Equipment</h3><div class="row sb"><div><b>${Ty.equipment[b.tier].tier}</b> — quality ${Ty.equipment[b.tier].quality}, capacity ×${Ty.equipment[b.tier].capacity}</div>
    ${nextTier ? `<button class="btn primary" data-act="equip" data-arg="${b.id}">Upgrade to ${nextTier.tier}</button>` : '<span class="pill good">Top tier</span>'}</div></div>
    <div class="opt-grid">${Object.values(UPGRADES).filter((x) => upgradeApplies(b, x.id)).map((x) => {
      const lvl = b.upgrades[x.id] || 0; const max = x.levels || 1; const done = lvl >= max;
      return `<div class="opt ${done ? 'on' : ''}" ${done ? '' : `data-act="upgrade" data-arg="${b.id}|${x.id}"`}><div class="h">${esc(x.name)}${x.levels ? ` (${lvl}/${max})` : ''}</div><div class="d">${esc(x.desc)}</div><div class="p">${done ? '✓ Installed' : money(upgradeCost(b, x.id))}</div></div>`;
    }).join('')}</div>
    <div class="note" style="margin-top:10px">Capital improvements are depreciated over 5–10 years in your accounts. Floor area: ${u.area} m².</div>
    <div class="card" style="margin-top:14px"><h3>Exit options</h3><div class="row"><button class="btn" data-act="sell" data-arg="${b.id}">Sell business (~${money(valuation(b), { compact: true })})</button><button class="btn bad" data-act="close" data-arg="${b.id}">Close & liquidate</button></div><div class="note" style="margin-top:8px">Selling transfers the business (and lease) to a buyer at roughly its valuation. Closing liquidates equipment at ~22% and pays staff severance.</div></div>`;
}

function plTable(pls) {
  const rows = Object.entries(CATS).filter(([k, c]) => c.kind !== 'capital' && pls.some((p) => Math.abs(p[k] || 0) > 0.5));
  const sums = pls.map((p) => plSummary(p));
  return `<table class="t"><thead><tr><th>Line item</th><th class="r">Today</th><th class="r">This month</th><th class="r">Last month</th><th class="r">Lifetime</th></tr></thead><tbody>
    ${rows.map(([k, c]) => `<tr><td>${c.name}</td>${pls.map((p) => `<td class="r num ${(p[k] || 0) < 0 ? 'bad' : ''}">${money(p[k] || 0)}</td>`).join('')}</tr>`).join('')}
    <tr><td><b>Gross profit</b></td>${sums.map((s) => `<td class="r num"><b>${money(s.gross)}</b></td>`).join('')}</tr>
    <tr><td><b>Net profit (pre-tax)</b></td>${sums.map((s) => `<td class="r num ${s.net < 0 ? 'bad' : 'good'}"><b>${money(s.net)}</b></td>`).join('')}</tr></tbody></table>`;
}
function financeTab(b, T) {
  const f = fixedCostsMonthly(b);
  return `<div class="card"><h3>Profit & loss</h3>${plTable([b.today, b.month, b.lastMonth || {}, b.life])}</div>
    <div class="grid g2" style="margin-top:14px"><div class="card"><h3>Monthly fixed costs (est.)</h3><div class="row sb"><span class="muted">Rent</span><b class="num">${money(f.rent)}</b></div><div class="row sb"><span class="muted">Payroll incl. taxes</span><b class="num">${money(f.wages)}</b></div><div class="row sb"><span class="muted">Utilities</span><b class="num">${money(f.util)}</b></div><div class="row sb"><span class="muted">Insurance</span><b class="num">${money(f.ins)}</b></div><div class="row sb" style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><span>Break-even revenue (approx.)</span><b class="num">${money(f.total / 0.65)}/mo</b></div></div>
    <div class="card"><h3>Daily profit (60 days)</h3>${T.chart([{ data: b.hist.slice(-60).map((h) => h.profit), type: 'bar' }], { fmt: (v) => money(v, { compact: true }) })}</div></div>`;
}

function reviewsTab(b) {
  if (!b.reviews.length) return '<div class="empty">No reviews yet.</div>';
  const avg = b.reviews.reduce((a, r) => a + r.stars, 0) / b.reviews.length;
  return `<div class="card"><h3>Customer reviews <span class="stars">${stars(avg)} ${avg.toFixed(1)}</span></h3>${b.reviews.map((r) => `<div class="review"><span class="stars">${stars(r.stars)}</span> <b>${esc(r.who)}</b> <span class="muted">· day ${r.day}</span><div style="margin-top:4px">${esc(r.text)}</div></div>`).join('')}</div>`;
}

const split = (a) => a.split('|');
export const businesses = {
  id: 'businesses', name: 'Businesses', icon: '🏪',
  title: (p) => (p.id && biz(p.id) ? biz(p.id).name : 'Businesses'),
  render(params, T) {
    const b = params.id && biz(params.id);
    return b ? detailView(b, params.tab || 'overview', T) : listView(T);
  },
  actions: {
    open: (id) => ctx.tablet.go('businesses', { id, tab: 'overview' }),
    back: () => ctx.tablet.go('businesses', {}),
    tab: (t) => { ctx.tablet.params.tab = t; ctx.tablet.render(true); },
    props: () => ctx.tablet.go('properties'),
    setup: (u) => showSetupWizard(u),
    openBiz: (id) => { openBusiness(biz(id)); ctx.tablet.render(); },
    pause: (id) => { setPaused(biz(id), true); ctx.tablet.render(); },
    resume: (id) => { setPaused(biz(id), false); ctx.tablet.render(); },
    waypoint: (id) => { const b = biz(id); const bl = ctx.layout.buildingById[b.bId]; ctx.state.waypoint = { x: bl.door.x, z: bl.door.z, label: b.name }; ctx.bus.emit('toast', { title: 'Waypoint set', text: b.name, kind: 'info' }); },
    rename: (id) => {
      const b = biz(id);
      ctx.modal.open({ title: 'Rename business', body: `<input type="text" id="rn" value="${esc(b.name)}" maxlength="40" style="width:100%">`, foot: [{ label: 'Cancel' }, { label: 'Save', cls: 'primary', fn: () => { rename(b, document.getElementById('rn').value.trim()); ctx.tablet.render(); } }] });
    },
    price: (arg) => { const [id, pid, d] = split(arg); const b = biz(id); setPrice(b, pid, b.prices[pid] * (1 + +d)); ctx.tablet.render(); },
    setPrice: (v, el) => { const [id, pid] = split(el.dataset.arg); setPrice(biz(id), pid, parseFloat(v)); ctx.tablet.render(); },
    fprice: (arg) => { const [id, d] = split(arg); const b = biz(id); b.factoryPrice = Math.max(0.1, b.factoryPrice * (1 + +d)); ctx.tablet.render(); },
    fsetPrice: (v, el) => { const b = biz(el.dataset.arg); b.factoryPrice = Math.max(0.1, parseFloat(v) || b.factoryPrice); ctx.tablet.render(); },
    sellMode: (v, el) => { const [id, mode] = split(el.dataset.arg); biz(id).sellMode = mode; ctx.tablet.render(); },
    order: (arg) => { const [id, pid] = split(arg); const q = parseInt(document.getElementById('q_' + pid)?.value || '0', 10); if (orderStock(biz(id), pid, q)) ctx.bus.emit('toast', { title: 'Order placed', text: `${q} units arriving at 6:00 AM`, kind: 'good' }); ctx.tablet.render(); },
    restock: (id) => { restockNow(biz(id)); ctx.bus.emit('toast', { title: 'Stock ordered', text: 'Delivery arrives at 6:00 AM.', kind: 'good' }); ctx.tablet.render(); },
    autoRestock: (v, el) => { biz(el.dataset.arg).autoRestock = v; },
    restockDays: (v, el) => { biz(el.dataset.arg).restockDays = +v; },
    autoAccept: (v, el) => { biz(el.dataset.arg).autoAccept = v; },
    supplier: (arg) => { const [id, sup] = split(arg); const b = biz(id); b.supplier = sup; delete b._share; computeQuality(b); ctx.tablet.render(); },
    hOpen: (v, el) => { const b = biz(el.dataset.arg); setHours(b, +v, b.hours[1]); ctx.tablet.render(); },
    hClose: (v, el) => { const b = biz(el.dataset.arg); setHours(b, b.hours[0], +v); ctx.tablet.render(); },
    hire: (id) => ctx.tablet.go('staff', { biz: id }),
    raise: (arg) => { const [id, e, p] = split(arg); giveRaise(id, e, +p); ctx.tablet.render(); },
    train: (arg) => { const [id, e] = split(arg); train(id, e); ctx.tablet.render(); },
    fire: (arg) => { const [id, e] = split(arg); ctx.modal.confirm('Let this employee go?', 'Severance is paid and the rest of the team\'s morale will dip.', () => { fire(id, e); ctx.tablet.render(); }, { yes: 'Fire', cls: 'bad' }); },
    campaign: (arg) => { const [id, m] = split(arg); runCampaign(biz(id), m); ctx.tablet.render(); },
    upgrade: (arg) => { const [id, u] = split(arg); buyUpgrade(biz(id), u); ctx.tablet.render(); },
    equip: (id) => { upgradeEquipment(biz(id)); ctx.tablet.render(); },
    accept: (arg) => { const [id, l] = split(arg); acceptLead(biz(id), l); ctx.tablet.render(); },
    decline: (arg) => { const [id, l] = split(arg); declineLead(biz(id), l); ctx.tablet.render(); },
    truck: (id) => { buyTruck(biz(id)); ctx.tablet.render(); },
    sell: (id) => { const b = biz(id); ctx.modal.confirm(`Sell ${b.name}?`, `A buyer will pay roughly ${money(valuation(b))} (±10%). The business and its lease transfer to them.`, () => { sellBusiness(b); ctx.tablet.go('businesses', {}); }, { yes: 'Sell business' }); },
    close: (id) => { const b = biz(id); ctx.modal.confirm(`Close ${b.name}?`, 'Equipment is liquidated at a steep discount and staff receive severance. This cannot be undone.', () => { closeBusiness(b); ctx.tablet.go('businesses', {}); }, { yes: 'Close permanently', cls: 'bad' }); },
  },
};
