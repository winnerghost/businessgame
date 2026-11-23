// Business lifecycle and simulation: setup, hourly operations, inventory, pricing, staffing, reputation,
// marketing, upgrades, agency contracts, factory production, valuation, selling & closing.
import { ctx } from '../core/ctx.js';
import { rng, uid, clamp, money, RNG } from '../core/utils.js';
import { BUSINESS_TYPES, SUPPLIER_TIERS, FACTORY_LINES, UPGRADES, MARKETING, TAX } from './data/businessTypes.js';
import { DISTRICTS } from './data/districts.js';
import { NAME_PARTS, CLIENTS, TECH_PROJECTS, FREIGHT_JOBS, REVIEW_TEMPLATES } from './data/names.js';
import { txn, spend, now, emptyPL, message, toast, plSummary } from './state.js';
import { demandFactor, weekdayFactor } from './economy.js';
import { productivity, roleDef, dailyStaff } from './staff.js';
import { unitRent } from './properties.js';

const FOOT_BASE = 1500;
const SHARE_NORM = 1.6;
export const BRAND_COLORS = ['#e4572e', '#29335c', '#f3a712', '#a8c686', '#669bbc', '#8d5a97', '#2ec4b6', '#e71d36', '#ff9f1c', '#3a86ff'];

export function typeDef(b) { return BUSINESS_TYPES[b.type]; }
export function priceLevel() { return ctx.state.economy?.priceLevel ?? 1; }
export function refPrice(b, p) {
  const T = typeDef(b);
  if (T.model === 'hotel') {
    const D = DISTRICTS[b.district];
    return Math.round(p.refPrice * (0.7 + D.wealth * 0.35 + D.tourism * 0.25) * priceLevel());
  }
  return p.refPrice * priceLevel();
}
export function unitCostOf(b, p) {
  const T = typeDef(b);
  const com = T.commodity ? ctx.state.economy.commodity[T.commodity] ?? 1 : 1;
  return p.unitCost * priceLevel() * com;
}
export function isOpenHour(b, h) {
  const [o, c] = b.hours;
  if (o === c || (o === 0 && c === 24)) return true;
  return o < c ? h >= o && h < c : h >= o || h < c;
}
export function openHoursPerDay(b) {
  const [o, c] = b.hours;
  if (o === 0 && c === 24) return 24;
  return o < c ? c - o : 24 - o + c;
}
export function randomBizName(type) {
  const p = NAME_PARTS[type];
  return `${rng.pick(p.a)} ${rng.pick(p.b)}`;
}

// ---------------------------------------------------------------------------------------- setup
export function setupCost(typeId, unit, tier) {
  const T = BUSINESS_TYPES[typeId];
  const pl = priceLevel();
  const fit = Math.round(T.fitoutPerM2 * unit.area * pl);
  const equip = Math.round(T.equipment[tier].cost * pl * (T.model === 'hotel' ? Math.max(1, unit.area / 4000) : 1));
  return { fit, equip, total: fit + equip };
}

export function canHost(typeId, unit) {
  const T = BUSINESS_TYPES[typeId];
  if (!T.unitTypes.includes(unit.type)) return { ok: false, why: `Needs a ${T.unitTypes.join(' / ')} space` };
  if (unit.residential && T.model === 'hotel') return { ok: false, why: 'Zoned residential' };
  if (unit.area < T.minArea) return { ok: false, why: `Needs at least ${T.minArea} m²` };
  if (T.model === 'hotel' && !['downtown', 'midtown', 'harbor'].includes(unit.district)) return { ok: false, why: 'Hotels need a central location' };
  return { ok: true };
}

export function createBusiness(unitId, typeId, { name, tier = 0, line = null, color } = {}) {
  const s = ctx.state;
  const unit = ctx.units[unitId];
  const T = BUSINESS_TYPES[typeId];
  const chk = canHost(typeId, unit);
  if (!chk.ok) { toast('Not suitable', chk.why, 'bad'); return null; }
  if (s.businesses.find((b) => b.unitId === unitId)) { toast('Occupied', 'You already run a business here.', 'bad'); return null; }
  const cost = setupCost(typeId, unit, tier);
  if (!spend(cost.total, 'capex', `Fit-out & equipment: ${name}`)) return null;
  const d = now();
  const b = {
    id: uid('biz'), name: name || randomBizName(typeId), type: typeId, unitId, bId: unit.bId, district: unit.district, area: unit.area,
    created: d.day, status: 'fitout', readyAt: s.clock.min + T.fitoutDays * 1440, opened: null, tier,
    color: color || BRAND_COLORS[s.businesses.length % BRAND_COLORS.length],
    hours: [...T.hours], prices: {}, stock: {}, avgCost: {}, sold: {}, forecast: {}, pending: [],
    supplier: 'standard', autoRestock: true, restockDays: 2, staff: [], upgrades: {}, campaigns: [],
    awareness: 0.08, reputation: 50, satisfaction: 60, quality: 50,
    today: emptyPL(), month: emptyPL(), life: emptyPL(), hist: [], reviews: [], hourly: new Array(24).fill(0),
    acc: { customers: 0, served: 0, lost: 0, satSum: 0, cap: 0, stockMiss: 0, items: 0 },
    capex: cost.total, equipValue: cost.equip, fitValue: cost.fit,
    members: 0, contracts: [], leads: [], trucks: 0, autoAccept: false, line, raw: 0, rawCost: 0, finished: 0, finishedCost: 0, sellMode: 'market', factoryPrice: null,
    closedUntil: 0, breakdownUntil: 0, events: [], notes: [],
  };
  for (const p of T.products) b.prices[p.id] = Math.round(refPrice(b, p) * 100) / 100;
  if (T.model === 'factory') {
    const L = FACTORY_LINES[line || 'coffee'];
    b.line = L.id;
    b.factoryPrice = Math.round(L.price * priceLevel() * 100) / 100;
  }
  if (T.model === 'retail') for (const p of T.products) { b.stock[p.id] = 0; b.avgCost[p.id] = unitCostOf(b, p); b.forecast[p.id] = 0; b.sold[p.id] = []; }
  // depreciation schedule (5 years equipment, 10 years fit-out)
  s.assets.depreciating.push({ id: uid('dep'), bizId: b.id, monthly: cost.equip / 60, remaining: 60 }, { id: uid('dep'), bizId: b.id, monthly: cost.fit / 120, remaining: 120 });
  s.businesses.push(b);
  // mark property usage
  const o = s.owned.find((x) => x.unitId === unitId);
  if (o) { o.use = 'business'; o.tenant = null; }
  ctx.bus.emit('business', b.id);
  ctx.bus.emit('bizCreated', b);
  toast('Fit-out started', `${b.name} will be ready in ${T.fitoutDays} days.`, 'good');
  ctx.audio?.play('cash');
  return b;
}

// What's still needed before opening
export function openingChecklist(b) {
  const s = ctx.state;
  const T = typeDef(b);
  const items = [];
  items.push({ ok: !!s.company, text: 'Company registered at City Hall' });
  items.push({ ok: hasLicense(), text: 'General business license (City Hall)' });
  for (const pid of T.permits) {
    const st = permitStatus(pid, b.unitId);
    items.push({ ok: st === 'active', pending: st === 'pending', text: `Permit: ${pid.replace('_', ' ')}`, permit: pid });
  }
  items.push({ ok: b.status !== 'fitout', text: b.status === 'fitout' ? `Fit-out in progress (ready ${fmtEta(b.readyAt)})` : 'Fit-out complete' });
  for (const r of T.roles.filter((x) => x.required)) {
    items.push({ ok: b.staff.some((e) => e.role === r.id), text: `Hire at least one ${r.name}` });
  }
  if (T.model === 'retail') items.push({ ok: Object.values(b.stock).some((q) => q > 0) || b.pending.length > 0, text: 'Initial inventory ordered' });
  if (b.type === 'logistics') items.push({ ok: b.trucks > 0, text: 'At least one truck in the fleet' });
  return items;
}
function fmtEta(min) {
  const d = Math.max(0, min - ctx.state.clock.min);
  return d > 1440 ? `in ${Math.ceil(d / 1440)} days` : `in ${Math.ceil(d / 60)} h`;
}
export function hasLicense() {
  const l = ctx.state.licenses.business;
  return !!l && l.expires > now().day;
}
export function permitStatus(pid, unitId) {
  const P = ctx.state.permits.find((p) => p.type === pid && (p.unitId === unitId || !p.unitId));
  if (!P) return 'none';
  return P.status;
}

export function openBusiness(b) {
  const list = openingChecklist(b);
  const missing = list.filter((i) => !i.ok);
  if (missing.length) { toast('Not ready to open', missing[0].text, 'warn'); return false; }
  b.status = 'open';
  b.opened = now().day;
  ctx.bus.emit('business', b.id);
  ctx.bus.emit('bizOpened', b);
  toast('Open for business!', `${b.name} is now trading.`, 'good');
  ctx.audio?.play('fanfare');
  return true;
}

export function setPaused(b, paused) {
  if (b.status !== 'open' && b.status !== 'paused') return;
  b.status = paused ? 'paused' : 'open';
  ctx.bus.emit('business', b.id);
}

// ---------------------------------------------------------------------------------------- quality & appeal
export function supplierOf(b) {
  if (b.supplier === 'own') return { id: 'own', name: 'Own factory', costMul: 0.42, quality: ownFactoryQuality(b), lead: 1, reliability: 0.99 };
  const base = SUPPLIER_TIERS.find((x) => x.id === b.supplier) || SUPPLIER_TIERS[1];
  const contract = ctx.state.contracts.find((c) => c.supplier === base.id && c.until > now().day && (c.bizId === b.id || c.global));
  return contract ? { ...base, costMul: base.costMul * (1 - contract.discount), contract } : base;
}
export function ownFactoryFor(b) {
  return ctx.state.businesses.find((f) => f.type === 'factory' && f.status === 'open' && FACTORY_LINES[f.line]?.feeds.includes(b.type));
}
function ownFactoryQuality(b) { const f = ownFactoryFor(b); return f ? f.quality : 50; }

export function avgSkill(b) {
  if (!b.staff.length) return 30;
  return b.staff.reduce((a, e) => a + e.skill, 0) / b.staff.length;
}
export function avgMorale(b) {
  if (!b.staff.length) return 50;
  return b.staff.reduce((a, e) => a + e.morale, 0) / b.staff.length;
}
export function computeQuality(b) {
  const T = typeDef(b);
  const equip = T.equipment[b.tier].quality;
  const sup = T.model === 'retail' ? supplierOf(b).quality : equip;
  const ren = (b.upgrades.renovation || 0) * 3;
  b.quality = clamp(0.38 * equip + 0.32 * sup + 0.3 * avgSkill(b) + ren, 5, 100);
  return b.quality;
}
export function priceIndex(b) {
  const T = typeDef(b);
  let pi = 0, w = 0;
  for (const p of T.products) {
    const share = T.model === 'membership' ? (p.id === 'membership' ? 1 : 0) : p.share;
    pi += share * (b.prices[p.id] / refPrice(b, p));
    w += share;
  }
  return w ? pi / w : 1;
}
export function attractiveness(b) {
  const pi = priceIndex(b);
  let a = Math.pow(b.quality / 60, 1.0) * Math.pow((b.reputation + 10) / 60, 0.7) * Math.pow(pi, -1.7);
  a *= 1 + 0.08 * (b.upgrades.renovation || 0);
  if (b.upgrades.loyalty) a *= 1.05;
  if (b.upgrades.delivery) a *= 1.14;
  return a;
}
function compAttract(c) {
  return Math.pow(c.quality / 60, 1.0) * Math.pow((c.reputation + 10) / 60, 0.7) * Math.pow(c.priceIdx, -1.7);
}
export function competitorsFor(b) {
  return ctx.state.competitors.filter((c) => c.open && c.type === b.type && c.district === b.district);
}
export function marketShare(b) {
  const mine = b.awareness * attractiveness(b);
  let others = 0;
  for (const c of competitorsFor(b)) others += c.awareness * compAttract(c);
  // your own other locations in the same district split demand too
  for (const o of ctx.state.businesses) if (o !== b && o.type === b.type && o.district === b.district && o.status === 'open') others += o.awareness * attractiveness(o) * 0.8;
  return mine / (mine + others + 0.35);
}

export function hourlyCapacity(b) {
  const T = typeDef(b);
  let cap = 0;
  for (const e of b.staff) {
    const r = roleDef(b.type, e.role);
    if (r && r.serves) cap += r.serves * productivity(e);
  }
  cap *= T.equipment[b.tier].capacity * (b.upgrades.pos ? 1.06 : 1);
  if (ctx.state.clock.min < b.breakdownUntil) cap *= 0.5;
  if (T.seatsPerM2) {
    const turn = { cafe: 2.6, bakery: 3, restaurant: 1.05, bar: 1.4 }[b.type] ?? 2;
    let seats = b.area * T.seatsPerM2 * (b.upgrades.patio && ctx.state.economy.weather.rain < 0.2 ? 1.15 : 1);
    cap = Math.min(cap, seats * turn * 1.0 + (b.upgrades.delivery ? cap * 0.15 : 0));
  } else if (T.model === 'retail') {
    cap = Math.min(cap, b.area * 0.55);
  }
  return cap;
}

function missingRequired(b) {
  const T = typeDef(b);
  return T.roles.filter((r) => r.required && !b.staff.some((e) => e.role === r.id));
}
function poisson(lambda) {
  if (lambda > 30) return Math.max(0, Math.round(rng.normal(lambda, Math.sqrt(lambda))));
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= rng.next(); } while (p > L);
  return k - 1;
}

// ---------------------------------------------------------------------------------------- hourly sim
export function simHour(b, hour) {
  if (b.status === 'fitout') {
    if (ctx.state.clock.min >= b.readyAt) {
      b.status = 'ready';
      message('Site Foreman', `${b.name}: fit-out complete`, `The space is finished and handed over. Once your permits are approved, staff hired${typeDef(b).model === 'retail' ? ' and stock ordered' : ''}, you can open the doors from the business panel.`, { biz: b.id });
      toast('Fit-out complete', `${b.name} is ready to open.`, 'good');
      ctx.bus.emit('business', b.id);
    }
    return;
  }
  if (b.status !== 'open' && b.status !== 'paused') return;
  receiveOrders(b);
  const T = typeDef(b);
  const open = b.status === 'open' && isOpenHour(b, hour) && ctx.state.clock.min >= b.closedUntil;
  // wages accrue for scheduled hours (agency/factory/hotel staff work 8h shifts on working days)
  if (T.model === 'retail' || T.model === 'membership') {
    if (isOpenHour(b, hour)) payWages(b, 1 * (b.status === 'paused' ? 0.5 : 1));
  } else if (hour >= 9 && hour < 17 && (T.model === 'hotel' || weekdayFactor(b.type) > 0)) payWages(b, 1);
  if (!open) { b.hourly[hour] = 0; return; }
  if (T.model === 'retail') retailHour(b, hour);
  else if (T.model === 'membership') gymHour(b, hour);
}

function payWages(b, hours) {
  let w = 0;
  for (const e of b.staff) w += e.wage * hours;
  if (!w) return;
  txn(-w, 'wages', 'Payroll', b.id, { silent: true });
  txn(-w * TAX.payroll, 'payroll_tax', 'Payroll tax', b.id, { silent: true });
}

function footPotential(b, hour) {
  const T = typeDef(b);
  const D = DISTRICTS[b.district];
  const unit = ctx.units[b.unitId];
  const aff = D.affinity[b.type] ?? 0.6;
  return FOOT_BASE * (unit?.foot ?? 0.5) * T.curve[hour] * aff * demandFactor(b.type, b.district) * weekdayFactor(b.type);
}

function retailHour(b, hour) {
  const T = typeDef(b);
  const potential = footPotential(b, hour);
  const share = (b._share ??= marketShare(b));
  let customers = poisson(potential * T.capture * share * SHARE_NORM * (b.upgrades.loyalty ? 1.05 : 1) * (b.upgrades.delivery ? 1.14 : 1));
  const missing = missingRequired(b);
  const cap = missing.length ? 0 : hourlyCapacity(b);
  const served = Math.min(customers, Math.floor(cap));
  const lost = customers - served;
  let revenue = 0, cogs = 0, itemsWanted = 0, itemsSold = 0, deliveryRev = 0;
  for (const p of T.products) {
    const pf = clamp(Math.pow(b.prices[p.id] / refPrice(b, p), -p.elasticity), 0.15, 1.9);
    const want = served * T.itemsPerCustomer * p.share * pf;
    const q = Math.min(b.stock[p.id] || 0, want);
    const qi = Math.floor(q) + (rng.next() < q % 1 ? 1 : 0);
    const sold = Math.min(qi, b.stock[p.id] || 0);
    b.stock[p.id] = (b.stock[p.id] || 0) - sold;
    b.soldToday = b.soldToday || {};
    b.soldToday[p.id] = (b.soldToday[p.id] || 0) + sold;
    b.wantToday = b.wantToday || {};
    b.wantToday[p.id] = (b.wantToday[p.id] || 0) + want;
    itemsWanted += want; itemsSold += sold;
    const rev = sold * b.prices[p.id];
    revenue += rev;
    cogs += sold * (b.avgCost[p.id] || unitCostOf(b, p));
  }
  if (b.upgrades.delivery) deliveryRev = revenue * 0.12;
  if (revenue > 0) {
    txn(revenue, 'revenue', 'Sales', b.id, { silent: true });
    txn(-cogs, 'cogs', 'COGS', b.id, { silent: true, noncash: true });
    const tax = revenue * TAX.sales;
    txn(tax, 'sales_tax', 'Sales tax collected', null, { silent: true });
    ctx.state.taxes.salesPayable += tax;
    if (deliveryRev) txn(-deliveryRev * 0.2, 'commission', 'Delivery app commission', b.id, { silent: true });
    if (b.upgrades.loyalty) txn(-revenue * 0.01, 'marketing', 'Loyalty program', b.id, { silent: true });
  }
  // satisfaction
  const pi = priceIndex(b);
  const priceScore = clamp(100 - (pi - 1) * 140, 0, 100);
  const util = cap > 0 ? customers / cap : 2;
  const waitScore = util < 0.75 ? 100 : clamp(100 - (util - 0.75) * 180, 0, 100);
  const stockFill = itemsWanted > 0 ? itemsSold / itemsWanted : 1;
  const mood = avgMorale(b) + b.staff.filter((e) => e.traits.includes('charming')).length * 4 - b.staff.filter((e) => e.traits.includes('grumpy')).length * 5;
  const sat = 0.33 * b.quality + 0.22 * priceScore + 0.2 * waitScore + 0.15 * stockFill * 100 + 0.1 * clamp(mood, 0, 100) + (b.upgrades.renovation || 0) * 2;
  const a = b.acc;
  a.customers += customers; a.served += served; a.lost += lost; a.satSum += sat * Math.max(1, served); a.satW = (a.satW || 0) + Math.max(1, served); a.cap += cap; a.items += itemsWanted; a.stockMiss += itemsWanted - itemsSold;
  a.waitScore = (a.waitScore || 0) + waitScore; a.priceScore = priceScore; a.hours = (a.hours || 0) + 1;
  b.hourly[hour] = served;
  b.lastHourRevenue = revenue;
}

function gymHour(b, hour) {
  const T = typeDef(b);
  // visits for crowding measure
  const visits = b.members * 0.33 * (T.curve[hour] / 9.5);
  const capacity = b.area / T.m2PerUser;
  const crowd = visits / Math.max(1, capacity);
  const a = b.acc;
  a.crowd = Math.max(a.crowd || 0, crowd);
  a.hours = (a.hours || 0) + 1;
  b.hourly[hour] = Math.round(visits);
}

// ---------------------------------------------------------------------------------------- inventory
export function orderStock(b, pid, qty, { auto = false } = {}) {
  const T = typeDef(b);
  const p = T.products.find((x) => x.id === pid);
  if (!p || qty <= 0) return false;
  qty = Math.round(qty);
  let sup = supplierOf(b);
  let unitCost = unitCostOf(b, p) * sup.costMul;
  // own factory: consume finished goods
  if (sup.id === 'own') {
    const f = ownFactoryFor(b);
    const L = f && FACTORY_LINES[f.line];
    const need = L ? (qty * unitCostOf(b, p)) / (L.price * priceLevel()) : Infinity;
    if (!f || f.finished < need) { sup = SUPPLIER_TIERS[1]; unitCost = unitCostOf(b, p); if (!auto) toast('Factory short', 'Not enough factory output — ordered from Meridian Food & Supply instead.', 'warn'); }
    else {
      const costBasis = f.finished > 0 ? (f.finishedCost / f.finished) * need : 0;
      f.finished -= need; f.finishedCost -= costBasis;
      unitCost = costBasis / qty;
      const arrive = ctx.state.clock.min + 6 * 60;
      b.pending.push({ pid, qty, cost: unitCost, arrive, supplier: 'own' });
      return true;
    }
  }
  const total = unitCost * qty;
  if (!auto && ctx.state.cash < total) { toast('Insufficient funds', `Order costs ${money(total)}`, 'bad'); return false; }
  txn(-total, 'inventory', `${auto ? 'Auto-order' : 'Order'}: ${qty} × ${p.name}`, b.id, { silent: auto, minLog: 50 });
  const lead = sup.lead + (rng.chance(1 - sup.reliability) ? 1 : 0);
  const d = now();
  // delivered at 06:00 — "lead 1" means overnight (today if ordered before 5am, otherwise tomorrow)
  const firstMorning = (d.day - 1) * 1440 + 6 * 60 + (d.hour >= 5 ? 1440 : 0);
  const arrive = firstMorning + (lead - 1) * 1440;
  b.pending.push({ pid, qty, cost: unitCost, arrive: Math.max(arrive, ctx.state.clock.min + 120), supplier: sup.id });
  return true;
}

function receiveOrders(b) {
  const t = ctx.state.clock.min;
  if (!b.pending.length) return;
  const keep = [];
  for (const o of b.pending) {
    if (o.arrive <= t) {
      const cur = b.stock[o.pid] || 0;
      const avg = b.avgCost[o.pid] || o.cost;
      b.stock[o.pid] = cur + o.qty;
      b.avgCost[o.pid] = (cur * avg + o.qty * o.cost) / Math.max(1, cur + o.qty);
    } else keep.push(o);
  }
  b.pending = keep;
}

export function pendingQty(b, pid) { return b.pending.filter((o) => o.pid === pid).reduce((a, o) => a + o.qty, 0); }

export function restockNow(b) { autoRestock(b); ctx.bus.emit('business', b.id); }
function autoRestock(b) {
  const T = typeDef(b);
  const hasMgr = b.staff.some((e) => roleDef(b.type, e.role)?.manager);
  for (const p of T.products) {
    const hist = b.sold[p.id] || [];
    let f = hist.length ? hist.slice(-5).reduce((a, x) => a + x, 0) / Math.min(5, hist.length) : 0;
    if (!hist.length || f < 1) {
      // estimate opening demand from foot traffic
      let est = 0;
      for (let h = 0; h < 24; h++) if (isOpenHour(b, h)) est += footPotential(b, h) * T.capture * 0.3 * SHARE_NORM;
      f = Math.max(f, est * T.itemsPerCustomer * p.share * 0.6);
    }
    if (!hasMgr) f *= rng.float(0.75, 1.3); // no manager: sloppy forecasting
    const days = p.shelf <= 3 ? 1.15 : p.shelf <= 7 ? Math.min(b.restockDays, 2) : b.restockDays;
    const target = f * days * 1.08;
    const have = (b.stock[p.id] || 0) + pendingQty(b, p.id);
    const qty = Math.ceil(target - have);
    if (qty > 0) orderStock(b, p.id, qty, { auto: true });
  }
}

// ---------------------------------------------------------------------------------------- daily sim
export function simDay(b) {
  const T = typeDef(b);
  const s = ctx.state;
  delete b._share;
  if (b.status === 'fitout' || b.status === 'ready') { b.hist.push({ day: now().day, revenue: 0, profit: 0, customers: 0, sat: 0 }); trimHist(b); return; }
  computeQuality(b);
  if (T.model === 'membership') gymDay(b);
  if (T.model === 'hotel') hotelDay(b);
  if (T.model === 'agency') agencyDay(b);
  if (T.model === 'factory') factoryDay(b);

  // utilities & fixed costs (daily accrual)
  const util = (T.utilitiesPerM2 * b.area * priceLevel() * (b.upgrades.solar ? 0.65 : 1)) / 30;
  txn(-util, 'utilities', 'Utilities', b.id, { silent: true });
  txn(-(T.insurance * priceLevel()) / 30, 'insurance', 'Insurance', b.id, { silent: true });
  if (b.trucks) { txn(-(b.trucks * 420 * priceLevel()) / 30, 'fuel', 'Fleet maintenance', b.id, { silent: true }); }

  // perishable spoilage
  if (T.model === 'retail') {
    for (const p of T.products) {
      (b.sold[p.id] ||= []).push(b.wantToday?.[p.id] ?? b.soldToday?.[p.id] ?? 0);
      if (b.sold[p.id].length > 14) b.sold[p.id].shift();
      const st = b.stock[p.id] || 0;
      if (!st) continue;
      const rate = p.shelf <= 7 ? (1 / Math.max(1, p.shelf)) * 0.5 : p.shelf <= 60 ? 0.01 : 0.0015;
      const lost = Math.floor(st * rate);
      if (lost > 0) {
        b.stock[p.id] = st - lost;
        txn(-lost * (b.avgCost[p.id] || 0), 'spoilage', `Spoilage: ${p.name}`, b.id, { silent: true, noncash: true });
      }
    }
    b.soldToday = {};
    b.wantToday = {};
    if (b.autoRestock) autoRestock(b);
  }

  // reputation, satisfaction, reviews
  const a = b.acc;
  let daySat = a.satW ? a.satSum / a.satW : b.satisfaction;
  if (T.model !== 'retail') daySat = b._daySat ?? b.satisfaction;
  b.satisfaction = daySat;
  const volume = T.model === 'retail' ? a.served : T.model === 'membership' ? b.members / 20 : 40;
  const weight = clamp(0.03 + volume / 1500, 0.03, 0.14);
  b.reputation = clamp(b.reputation + (daySat - b.reputation) * weight - (b.upgrades.loyalty ? 0 : 0.05), 0, 100);
  // awareness: walk-by + word of mouth + marketing - decay
  const dayFoot = T.model === 'retail' || T.model === 'membership' ? Array.from({ length: 24 }, (_, h) => (isOpenHour(b, h) ? footPotential(b, h) : 0)).reduce((x, y) => x + y, 0) : 2000;
  let dA = dayFoot * 0.0000055 * (b.upgrades.signage ? 1.25 : 1) + (a.served || volume) * 0.00022 * (b.reputation / 50);
  for (const c of b.campaigns) if (c.until >= now().day) dA += c.power;
  b.campaigns = b.campaigns.filter((c) => c.until >= now().day);
  b.awareness = clamp(b.awareness + dA * (1 - b.awareness) - b.awareness * (b.upgrades.loyalty ? 0.008 : 0.012), 0.02, 0.98);
  if (T.model === 'retail' && a.served > 0) makeReviews(b, daySat, a);
  dailyStaff(b, a.cap > 0 ? a.customers / a.cap : 0);

  const missing = missingRequired(b);
  if (missing.length && b.status === 'open') {
    message('Operations', `${b.name} can't operate`, `Nobody is covering ${missing.map((r) => r.name).join(', ')}. Customers are being turned away. Hire staff from the Staff app or TalentBridge.`, { biz: b.id });
  }
  if (T.model === 'retail' && a.items > 0 && a.stockMiss / a.items > 0.25 && b.status === 'open') {
    toast('Stockouts', `${b.name} ran out of stock for ${Math.round((a.stockMiss / a.items) * 100)}% of orders.`, 'warn');
  }
  const pl = plSummary(b.today);
  b.hist.push({ day: now().day, revenue: pl.income, profit: pl.net, customers: a.served || b.members || 0, sat: Math.round(daySat), util: a.cap ? a.customers / a.cap : 0 });
  trimHist(b);
  b.lastDay = { ...a, revenue: pl.income, profit: pl.net };
  b.acc = { customers: 0, served: 0, lost: 0, satSum: 0, satW: 0, cap: 0, stockMiss: 0, items: 0 };
  b.today = emptyPL();
  b.hourly = new Array(24).fill(0);
}
function trimHist(b) { if (b.hist.length > 90) b.hist.shift(); }

function makeReviews(b, sat, a) {
  const n = Math.min(3, poisson(a.served / 180));
  for (let i = 0; i < n; i++) {
    const s = clamp(Math.round((sat + rng.normal(0, 14)) / 20), 1, 5);
    let text = rng.pick(REVIEW_TEMPLATES[s]);
    if (s <= 2 && a.stockMiss / Math.max(1, a.items) > 0.2) text = 'They were out of half the menu. Again.';
    if (s <= 3 && (a.waitScore / Math.max(1, a.hours)) < 60) text = 'Line out the door and only a couple of staff. Way too slow.';
    if (s <= 2 && a.priceScore < 50) text = 'Ridiculously overpriced for what you get.';
    b.reviews.unshift({ day: now().day, stars: s, text, who: `${'ABCDEFGHJKLMNPRSTW'[rng.int(0, 17)]}. ${['Smith', 'Lee', 'Garcia', 'Nguyen', 'Brown', 'Khan', 'Rossi', 'Kim'][rng.int(0, 7)]}` });
  }
  if (b.reviews.length > 40) b.reviews.length = 40;
}

function gymDay(b) {
  const T = typeDef(b);
  const D = DISTRICTS[b.district];
  let prospects = 0;
  for (let h = 0; h < 24; h++) if (isOpenHour(b, h)) prospects += footPotential(b, h);
  const share = marketShare(b);
  const fee = b.prices.membership, ref = refPrice(b, T.products[0]);
  const pf = clamp(Math.pow(fee / ref, -1.4), 0.1, 2);
  const pool = (D.population + D.workers * 0.5) * 0.14 * share + 200;
  const missing = missingRequired(b);
  const open = b.status === 'open' && !missing.length && ctx.state.clock.min >= b.closedUntil;
  const capacity = b.area / T.m2PerUser;
  const crowd = b.acc.crowd || 0;
  const crowdDeterrent = clamp(1.6 - crowd, 0.05, 1);
  const signups = open ? poisson(prospects * T.capture * share * SHARE_NORM * pf * Math.max(0, 1 - b.members / pool) * crowdDeterrent) : 0;
  const crowdScore = crowd < 0.7 ? 100 : clamp(100 - (crowd - 0.7) * 160, 0, 100);
  const trainers = b.staff.filter((e) => e.role === 'trainer');
  const sat = 0.35 * b.quality + 0.25 * crowdScore + 0.2 * clamp(100 - (fee / ref - 1) * 140, 0, 100) + 0.1 * avgMorale(b) + 0.1 * Math.min(100, 50 + trainers.length * 12);
  b._daySat = sat;
  const churn = b.members * (0.001 + Math.max(0, (60 - sat)) * 0.00025 + (open ? 0 : 0.004));
  b.members = Math.max(0, Math.round(b.members + signups - churn));
  if (!open) return;
  const memberRev = (b.members * fee) / 30;
  const passes = poisson(prospects * 0.00012 * share * clamp(Math.pow(b.prices.daypass / refPrice(b, T.products[1]), -1.3), 0.1, 2));
  const ptDemand = b.members * 0.012 * clamp(Math.pow(b.prices.pt / refPrice(b, T.products[2]), -1.1), 0.1, 2);
  const ptCap = trainers.reduce((acc, e) => acc + 5 * productivity(e), 0);
  const pt = Math.min(ptDemand, ptCap);
  const rev = memberRev + passes * b.prices.daypass + pt * b.prices.pt;
  txn(rev, 'revenue', 'Memberships & services', b.id, { silent: true });
  b.acc.served = Math.round(b.members * 0.33);
  b.acc.customers = b.acc.served;
  b.acc.cap = capacity * 6;
  b.acc.signups = signups;
}

export function hotelRooms(b) { return Math.max(8, Math.floor(b.area / typeDef(b).m2PerRoom)); }
function hotelDay(b) {
  const T = typeDef(b);
  const D = DISTRICTS[b.district];
  const rooms = hotelRooms(b);
  const missing = missingRequired(b);
  const open = b.status === 'open' && !missing.length && ctx.state.clock.min >= b.closedUntil;
  const rate = b.prices.room, ref = refPrice(b, T.products[0]);
  const pf = clamp(Math.pow(rate / ref, -1.25), 0.1, 1.8);
  const comp = competitorsFor(b).length;
  const baseOcc = (0.42 + D.tourism * 0.33) * demandFactor('hotel', b.district) * weekdayFactor('hotel');
  const repF = clamp((b.reputation + 25) / 75, 0.3, 1.5) * (0.45 + 0.55 * b.awareness) * (1 / (1 + comp * 0.12));
  let demand = rooms * clamp(baseOcc * pf * repF, 0, 1.05);
  const hk = b.staff.filter((e) => e.role === 'housekeeper').reduce((a, e) => a + 14 * productivity(e), 0);
  const occupied = open ? Math.floor(Math.min(demand, rooms, hk * 1.15)) : 0;
  const cleanliness = occupied > 0 ? clamp(hk / occupied, 0, 1.2) : 1;
  const sat = 0.4 * b.quality + 0.2 * clamp(100 - (rate / ref - 1) * 120, 0, 100) + 0.25 * clamp(cleanliness * 85, 0, 100) + 0.15 * avgMorale(b) + (b.staff.some((e) => e.role === 'concierge') ? 5 : 0);
  b._daySat = sat;
  if (!open) return;
  const rev = occupied * rate * 1.14; // rooms + F&B / extras
  txn(rev, 'revenue', 'Room & F&B revenue', b.id, { silent: true });
  txn(-occupied * rate * 0.55 * 0.17, 'commission', 'Online travel agency commissions', b.id, { silent: true });
  txn(-occupied * unitCostOf(b, T.products[0]), 'cogs', 'Room supplies & laundry', b.id, { silent: true });
  const tax = rev * TAX.sales;
  txn(tax, 'sales_tax', 'Occupancy tax collected', null, { silent: true });
  ctx.state.taxes.salesPayable += tax;
  b.acc.served = occupied; b.acc.customers = Math.round(demand); b.acc.cap = rooms;
  b.occupancy = occupied / rooms;
}

// ---------------------------------------------------------------------------------------- agency (B2B contracts)
function newLead(b) {
  const T = typeDef(b);
  const tech = b.type === 'tech';
  const big = rng.chance(clamp((b.reputation - 40) / 120, 0.02, 0.4));
  const hours = Math.round((tech ? rng.float(80, 600) : rng.float(30, 220)) * (big ? rng.float(2.5, 5) : 1) / 10) * 10;
  const budgetRate = refPrice(b, T.products[0]) * rng.float(0.8, 1.3) * (0.85 + b.reputation / 300);
  const capPerDay = Math.max(8, agencyCapacity(b));
  const backlog = b.contracts.reduce((a, c) => a + (c.hours - c.progress), 0);
  const days = Math.ceil(((hours + backlog * 0.6) / capPerDay) * rng.float(1.35, 2.1) * 1.4) + 3;
  return {
    id: uid('lead'), client: rng.pick(CLIENTS), title: tech ? rng.pick(TECH_PROJECTS) : rng.pick(FREIGHT_JOBS), hours, budgetRate,
    deadlineDays: days, minQuality: rng.int(35, 75), expires: now().day + rng.int(3, 7), big,
  };
}
export function agencyCapacity(b) {
  let h = 0;
  for (const e of b.staff) {
    const r = roleDef(b.type, e.role);
    if (r?.productive) h += 8 * productivity(e);
  }
  h *= typeDef(b).equipment[b.tier].capacity * (b.upgrades.automation ? 1.15 : 1);
  if (b.type === 'logistics') h = Math.min(h, b.trucks * 10);
  return h;
}
export function acceptLead(b, leadId) {
  const L = b.leads.find((x) => x.id === leadId);
  if (!L) return false;
  const rate = b.prices.rate;
  if (rate > L.budgetRate) {
    b.leads = b.leads.filter((x) => x !== L);
    toast('Client declined', `${L.client} found ${money(rate)}/h too expensive (budget ≈ ${money(L.budgetRate)}).`, 'warn');
    ctx.bus.emit('business', b.id);
    return false;
  }
  const value = Math.round(L.hours * rate);
  const c = { ...L, id: uid('job'), value, rate, progress: 0, start: now().day, due: now().day + L.deadlineDays, paid: 0 };
  b.contracts.push(c);
  b.leads = b.leads.filter((x) => x !== L);
  const dep = Math.round(value * 0.3);
  c.paid = dep;
  txn(dep, 'contract', `Deposit: ${c.client} — ${c.title}`, b.id);
  toast('Contract signed', `${c.client}: ${c.title} (${money(value)})`, 'good');
  ctx.audio?.play('cash');
  ctx.bus.emit('business', b.id);
  ctx.bus.emit('contractSigned', b, c);
  return true;
}
export function declineLead(b, leadId) { b.leads = b.leads.filter((x) => x.id !== leadId); ctx.bus.emit('business', b.id); }

function agencyDay(b) {
  const T = typeDef(b);
  const d = now();
  const workday = weekdayFactor(b.type) > 0;
  const missing = missingRequired(b);
  const open = b.status === 'open' && !missing.length && ctx.state.clock.min >= b.closedUntil;
  // lead generation
  const sales = b.staff.filter((e) => roleDef(b.type, e.role)?.sales).reduce((a, e) => a + productivity(e), 0);
  let mkt = 0;
  for (const c of b.campaigns) if (c.until >= d.day && c.b2b) mkt += 0.5;
  const leadRate = (0.3 + sales * 0.45 + b.reputation / 180 + mkt) * (b.upgrades.crm ? 1.3 : 1) * ctx.state.economy.index * b.awareness * 2.2;
  b.leads = b.leads.filter((l) => l.expires >= d.day);
  if (open) for (let i = 0; i < poisson(leadRate); i++) if (b.leads.length < 8) b.leads.push(newLead(b));
  if (b.autoAccept && b.staff.some((e) => roleDef(b.type, e.role)?.manager)) {
    for (const l of [...b.leads]) if (l.budgetRate >= b.prices.rate && b.quality >= l.minQuality - 10 && b.contracts.length < 6) acceptLead(b, l.id);
  }
  if (!open || !workday) { b._daySat = b.satisfaction; return; }
  // work
  let hours = agencyCapacity(b);
  const used = hours;
  const active = [...b.contracts].sort((x, y) => x.due - y.due);
  for (const c of active) {
    if (hours <= 0) break;
    const take = Math.min(hours, c.hours - c.progress);
    c.progress += take;
    hours -= take;
  }
  const worked = used - hours;
  if (b.type === 'logistics' && worked > 0) {
    const fuel = worked * 19 * priceLevel() * (ctx.state.economy.commodity.fuel ?? 1);
    txn(-fuel, 'fuel', 'Diesel', b.id, { silent: true });
  }
  let sat = b.satisfaction;
  for (const c of [...b.contracts]) {
    if (c.progress >= c.hours) {
      const late = Math.max(0, d.day - c.due);
      const penalty = Math.min(0.4, late * 0.05);
      const qualityOk = b.quality >= c.minQuality;
      const due = Math.round(c.value * (1 - penalty)) - c.paid;
      txn(due, 'contract', `Completed: ${c.client} — ${c.title}${late ? ` (${late}d late)` : ''}`, b.id);
      const s = clamp(70 + (qualityOk ? 15 : -20) - late * 8 + (b.quality - 60) * 0.3, 0, 100);
      sat = sat * 0.6 + s * 0.4;
      b.reputation = clamp(b.reputation + (late ? -4 : 2.5) + (qualityOk ? 1 : -3), 0, 100);
      b.contracts = b.contracts.filter((x) => x !== c);
      b.completed = (b.completed || 0) + 1;
      toast('Contract delivered', `${c.client} paid ${money(due)}.`, late ? 'warn' : 'good');
      ctx.bus.emit('contractDone', b, c, late);
    } else if (d.day > c.due + 10) {
      b.reputation = clamp(b.reputation - 10, 0, 100);
      if (c.paid > 0) txn(-c.paid, 'contract', `Deposit clawback: ${c.client} — ${c.title}`, b.id);
      message(c.client, `Contract terminated: ${c.title}`, `You are more than 10 days past the deadline. We are terminating the contract, will not pay the balance, and have reclaimed our ${money(c.paid)} deposit.`, { biz: b.id });
      b.contracts = b.contracts.filter((x) => x !== c);
      sat = sat * 0.5;
    }
  }
  b._daySat = sat;
  b.acc.served = Math.round(worked);
  b.acc.cap = Math.round(used);
  b.acc.customers = b.contracts.length;
}

export function buyTruck(b) {
  const cost = Math.round(68000 * priceLevel());
  if (!spend(cost, 'vehicle', `Truck purchase: ${b.name}`, b.id)) return;
  b.trucks++;
  ctx.state.assets.depreciating.push({ id: uid('dep'), bizId: b.id, monthly: cost / 84, remaining: 84 });
  toast('Truck added', `${b.name} fleet: ${b.trucks}`, 'good');
  ctx.bus.emit('business', b.id);
}

// ---------------------------------------------------------------------------------------- factory
export function factoryCapacity(b) {
  const L = FACTORY_LINES[b.line];
  let u = 0;
  for (const e of b.staff) if (roleDef(b.type, e.role)?.productive) u += 8 * L.perWorkerHour * productivity(e);
  const qa = b.staff.some((e) => e.role === 'qa') ? 1.05 : 1;
  return u * typeDef(b).equipment[b.tier].capacity * (b.upgrades.automation ? 1.15 : 1) * qa;
}
export function factoryRefPrice(b) {
  const L = FACTORY_LINES[b.line];
  return L.price * priceLevel() * (ctx.state.economy.commodity[L.commodity] ?? 1);
}
function factoryDay(b) {
  const L = FACTORY_LINES[b.line];
  const missing = missingRequired(b);
  const open = b.status === 'open' && !missing.length && ctx.state.clock.min >= b.closedUntil && weekdayFactor('factory') > 0;
  const rawUnit = L.rawCost * priceLevel() * (ctx.state.economy.commodity[L.commodity] ?? 1) * supplierOf(b).costMul;
  b.rawUnitCost = rawUnit;
  let produced = 0;
  if (open) {
    const cap = factoryCapacity(b);
    produced = Math.floor(cap);
    const rawCost = produced * rawUnit;
    txn(-rawCost, 'inventory', 'Raw materials', b.id, { silent: true });
    const power = produced * 0.35 * priceLevel();
    txn(-power, 'utilities', 'Industrial power', b.id, { silent: true });
    b.finished += produced;
    b.finishedCost += rawCost;
  }
  // wholesale sales
  let sold = 0, rev = 0;
  if (b.sellMode === 'market' && b.finished > 0) {
    const ref = factoryRefPrice(b);
    const depth = L.marketDepth * ctx.state.economy.index * Math.pow(b.quality / 60, 0.5);
    const demand = depth * clamp(Math.pow(b.factoryPrice / ref, -2.2), 0, 3);
    sold = Math.floor(Math.min(b.finished, demand));
    rev = sold * b.factoryPrice;
    const cost = b.finished > 0 ? (b.finishedCost / b.finished) * sold : 0;
    b.finished -= sold; b.finishedCost -= cost;
    if (rev > 0) {
      txn(rev, 'revenue', 'Wholesale sales', b.id, { silent: true });
      txn(-cost, 'cogs', 'COGS', b.id, { silent: true, noncash: true });
    }
  }
  b._daySat = clamp(b.quality * 0.7 + avgMorale(b) * 0.3, 0, 100);
  b.acc.served = sold; b.acc.cap = Math.round(factoryCapacity(b)); b.acc.customers = produced;
}

// ---------------------------------------------------------------------------------------- marketing & upgrades
export function runCampaign(b, mid) {
  const M = MARKETING.find((m) => m.id === mid);
  if (!M) return;
  const cost = Math.round(M.cost * priceLevel());
  if (!spend(cost, 'marketing', `${M.name}: ${M.scope === 'city' ? 'all locations' : b.name}`, b.id)) return;
  const targets = M.scope === 'city' ? ctx.state.businesses.filter((x) => x.status !== 'fitout') : [b];
  let power = M.power;
  if (M.random) power = rng.chance(0.15) ? M.power * 3.5 : rng.float(0.2, 1.3) * M.power;
  for (const t of targets) {
    if (M.instant) t.awareness = clamp(t.awareness + power * (1 - t.awareness), 0, 0.98);
    else t.campaigns.push({ id: M.id, until: now().day + M.days, power: power / (M.scope === 'city' ? 1 : 1), b2b: !!M.b2b });
  }
  toast('Campaign launched', `${M.name} is live${M.random && power > M.power * 2 ? ' — and it\'s going viral!' : ''}.`, 'good');
  ctx.bus.emit('business', b.id);
  ctx.bus.emit('campaign', b, M);
}

export function upgradeCost(b, uidk) {
  const U = UPGRADES[uidk];
  const lvl = b.upgrades[uidk] || 0;
  if (U.perM2) return Math.round(U.perM2 * b.area * priceLevel() * (1 + lvl * 0.35));
  return Math.round(U.cost * priceLevel());
}
export function upgradeApplies(b, uidk) {
  const U = UPGRADES[uidk];
  const T = typeDef(b);
  if (U.applies === 'all') return true;
  return U.applies.includes(b.type) || U.applies.includes(T.model);
}
export function buyUpgrade(b, uidk) {
  const U = UPGRADES[uidk];
  const lvl = b.upgrades[uidk] || 0;
  if (U.levels ? lvl >= U.levels : lvl >= 1) return;
  if (uidk === 'patio' && permitStatus('sidewalk', b.unitId) !== 'active') { toast('Permit required', 'Apply for a Sidewalk Café Permit at City Hall first.', 'warn'); return; }
  const cost = upgradeCost(b, uidk);
  if (!spend(cost, 'capex', `${U.name}: ${b.name}`, b.id)) return;
  b.upgrades[uidk] = lvl + 1;
  b.capex += cost;
  ctx.state.assets.depreciating.push({ id: uid('dep'), bizId: b.id, monthly: cost / 84, remaining: 84 });
  computeQuality(b);
  toast('Upgrade installed', `${U.name}${U.levels ? ` (level ${lvl + 1})` : ''} at ${b.name}.`, 'good');
  ctx.bus.emit('business', b.id);
}
export function upgradeEquipment(b) {
  const T = typeDef(b);
  if (b.tier >= T.equipment.length - 1) return;
  const unit = ctx.units[b.unitId];
  const cur = setupCost(b.type, unit, b.tier).equip;
  const next = setupCost(b.type, unit, b.tier + 1).equip;
  const cost = Math.round((next - cur * 0.35));
  if (!spend(cost, 'capex', `Equipment upgrade: ${b.name}`, b.id)) return;
  b.tier++;
  b.equipValue = next;
  ctx.state.assets.depreciating.push({ id: uid('dep'), bizId: b.id, monthly: cost / 60, remaining: 60 });
  computeQuality(b);
  toast('Equipment upgraded', `${b.name} now runs ${T.equipment[b.tier].tier} equipment.`, 'good');
  ctx.bus.emit('business', b.id);
}

// ---------------------------------------------------------------------------------------- valuation & exits
export function trailing(b, days = 30) {
  const h = b.hist.slice(-days);
  const rev = h.reduce((a, x) => a + x.revenue, 0), profit = h.reduce((a, x) => a + x.profit, 0);
  return { rev, profit, days: h.length, avgRev: h.length ? rev / h.length : 0, avgProfit: h.length ? profit / h.length : 0 };
}
export function inventoryValue(b) {
  let v = 0;
  for (const [pid, q] of Object.entries(b.stock || {})) v += q * (b.avgCost[pid] || 0);
  if (b.finishedCost) v += b.finishedCost;
  return v;
}
export function valuation(b) {
  const T = typeDef(b);
  const tr = trailing(b, 30);
  const assets = (b.equipValue || 0) * 0.55 + (b.fitValue || 0) * 0.3 + inventoryValue(b) + b.trucks * 40000;
  if (b.status === 'fitout' || b.status === 'ready' || tr.days < 7) return Math.round(assets);
  const annual = tr.avgProfit * 360;
  const repF = 0.75 + b.reputation / 200;
  const earnings = annual > 0 ? annual * T.valuation * repF : 0;
  return Math.round(Math.max(assets, earnings + assets * 0.3));
}

export function sellBusiness(b) {
  const offer = Math.round(valuation(b) * rng.float(0.88, 1.08));
  txn(offer, 'equity', `Sale of ${b.name}`);
  removeBusiness(b, { sold: true });
  toast('Business sold', `${b.name} sold for ${money(offer)}.`, 'good');
  return offer;
}

export function closeBusiness(b) {
  const salvage = Math.round((b.equipValue || 0) * 0.22 + inventoryValue(b) * 0.3);
  let severance = 0;
  for (const e of b.staff) severance += e.wage * 40;
  txn(salvage, 'capex', `Liquidation: ${b.name}`);
  if (severance) txn(-severance, 'wages', `Severance: ${b.name} staff`);
  removeBusiness(b, { sold: false });
  toast('Business closed', `Recovered ${money(salvage)} from liquidation.`, 'warn');
}

function removeBusiness(b, { sold }) {
  const s = ctx.state;
  s.businesses = s.businesses.filter((x) => x !== b);
  s.assets.depreciating = s.assets.depreciating.filter((d) => d.bizId !== b.id);
  const o = s.owned.find((x) => x.unitId === b.unitId);
  if (o) o.use = 'vacant';
  const l = s.leases.find((x) => x.unitId === b.unitId);
  if (l && sold) {
    // buyer assumes the lease; deposit returned to you
    txn(l.deposit, 'deposit', `Deposit returned: ${ctx.units[b.unitId].address}`);
    s.leases = s.leases.filter((x) => x !== l);
  }
  ctx.bus.emit('business', b.id);
  ctx.bus.emit('bizRemoved', b);
}

export function rename(b, name) {
  b.name = name.slice(0, 40) || b.name;
  ctx.bus.emit('business', b.id);
}

export function businessesValue() {
  return ctx.state.businesses.reduce((a, b) => a + valuation(b), 0);
}

// Snapshot for UI: estimated monthly fixed costs
export function fixedCostsMonthly(b) {
  const T = typeDef(b);
  const lease = ctx.state.leases.find((l) => l.unitId === b.unitId);
  const rent = lease ? lease.rent : 0;
  const util = T.utilitiesPerM2 * b.area * priceLevel() * (b.upgrades.solar ? 0.65 : 1);
  const ins = T.insurance * priceLevel();
  const wagesH = b.staff.reduce((a, e) => a + e.wage, 0);
  const hours = T.model === 'retail' || T.model === 'membership' ? openHoursPerDay(b) * 30 : 8 * 22;
  return { rent, util, ins, wages: wagesH * hours * (1 + TAX.payroll), total: rent + util + ins + wagesH * hours * (1 + TAX.payroll) };
}

export { unitRent };

export function setPrice(b, pid, price) {
  if (!Number.isFinite(price)) return;
  b.prices[pid] = Math.max(0.01, Math.round(price * 100) / 100);
  delete b._share;
  ctx.bus.emit('business', b.id);
}
export function setHours(b, open, close) {
  b.hours = [((open % 24) + 24) % 24, close === 24 ? 24 : ((close % 24) + 24) % 24];
  ctx.bus.emit('business', b.id);
}
