// Real estate: units derived from city buildings, valuations, listings, leasing & buying, tenants.
import { ctx } from '../core/ctx.js';
import { RNG, rng, clamp, money } from '../core/utils.js';
import { DISTRICTS } from './data/districts.js';
import { txn, spend, now, message, toast } from './state.js';
import { FIRST, LAST } from './data/names.js';

export const UNIT_TYPE_NAMES = { retail: 'Retail Unit', office: 'Office Suite', industrial: 'Industrial Unit', residential: 'Residential', building: 'Entire Building' };

// Static unit catalogue (deterministic from layout)
export function generateUnits(layout) {
  const r = new RNG(layout.seed + 99);
  const units = {};
  const add = (b, type, area, label, extra = {}) => {
    const id = `${b.id}_${Object.keys(units).filter((k) => k.startsWith(b.id + '_')).length}`;
    units[id] = { id, bId: b.id, type, area: Math.round(area), label, district: b.district, address: b.address, foot: b.foot, ...extra };
    return units[id];
  };
  for (const b of layout.buildings) {
    if (b.landmark) continue;
    const foot = b.w * b.d;
    if (b.kind === 'tower') {
      add(b, 'retail', b.w * r.float(0.35, 0.5) * r.float(12, 18), 'Ground Floor Shop');
      add(b, 'retail', Math.min(foot * 0.3, r.float(280, 650)), 'Ground Floor Retail Hall');
      if (r.chance(0.4)) add(b, 'retail', r.float(46, 70), 'Lobby Kiosk');
      const floors = b.floors;
      add(b, 'office', foot * 0.82 * r.int(1, 2), `Floor ${r.int(3, Math.max(4, Math.floor(floors * 0.4)))} Suite`);
      add(b, 'office', foot * 0.82 * r.int(2, 4), `Floors ${Math.floor(floors * 0.5)}-${Math.floor(floors * 0.5) + 2}`);
      if (r.chance(0.5)) add(b, 'office', foot * 0.82 * r.int(3, 6), `Penthouse Floors`);
    } else if (b.kind === 'midrise') {
      if (b.storefront) {
        const n = Math.max(1, Math.min(3, Math.round(b.w / r.float(9, 14))));
        for (let i = 0; i < n; i++) add(b, 'retail', (b.w / n) * r.float(9, 15), `Shop ${String.fromCharCode(65 + i)}`);
        if (r.chance(0.35)) add(b, 'retail', Math.min(foot * 0.7, r.float(260, 520)), 'Large Retail Floor');
        if (r.chance(0.3)) add(b, 'retail', r.float(46, 64), 'Corner Kiosk');
      }
      if (b.district === 'northside') {
        add(b, 'building', foot * 0.85 * b.floors, 'Apartment Building', { apartments: Math.max(4, Math.round((foot * 0.8 * (b.floors - (b.storefront ? 1 : 0))) / 75)), residential: true });
      } else {
        if (b.floors > 3) add(b, 'office', foot * 0.8 * r.int(1, 3), 'Upper-floor Office');
        add(b, 'building', foot * 0.85 * b.floors, 'Entire Building', { apartments: Math.max(4, Math.round((foot * 0.8 * (b.floors - 1)) / 75)) });
      }
    } else if (b.kind === 'house') {
      add(b, 'residential', b.w * b.d * 1.8, 'Detached House', { apartments: 1, residential: true });
    } else if (b.kind === 'warehouse' || b.kind === 'factory') {
      add(b, 'industrial', foot * (b.kind === 'factory' ? 1 : 0.95), b.kind === 'factory' ? 'Factory Building' : 'Warehouse');
    }
  }
  return units;
}

// Market value of a unit (purchase price) and market rent
export function unitValue(u) {
  const s = ctx.state, eco = s.economy;
  const D = DISTRICTS[u.district];
  const st = s.unitState[u.id] || {};
  const mul = (st.valueMul ?? 1) * (eco?.propertyIndex ?? 1) * (eco?.priceLevel ?? 1);
  let perM2;
  if (u.type === 'building') perM2 = (u.residential ? D.price.residential : D.price.office) * 0.72;
  else if (u.type === 'residential') perM2 = D.price.residential;
  else perM2 = D.price[u.type] || D.price.retail;
  const footBonus = u.type === 'retail' ? 0.75 + u.foot * 0.35 : 1;
  return Math.round((u.area * perM2 * footBonus * mul) / 1000) * 1000;
}

export function unitRent(u) {
  const s = ctx.state, eco = s.economy;
  const D = DISTRICTS[u.district];
  const mul = (eco?.rentIndex ?? 1) * (eco?.priceLevel ?? 1);
  let perM2;
  if (u.type === 'building') perM2 = (u.residential ? D.rent.residential : D.rent.office) * 0.8;
  else if (u.type === 'residential') perM2 = D.rent.residential;
  else perM2 = D.rent[u.type] || D.rent.retail;
  const footBonus = u.type === 'retail' ? 0.75 + u.foot * 0.35 : 1;
  return Math.round((u.area * perM2 * footBonus * mul) / 10) * 10;
}

// Rent the player can charge residential tenants (per month, whole property)
export function residentialRentRoll(u) {
  const D = DISTRICTS[u.district];
  const per = (u.type === 'residential' ? 2600 : 1550) * (D.wealth ?? 1) * (ctx.state.economy?.priceLevel ?? 1) * (ctx.state.economy?.rentIndex ?? 1);
  return Math.round(per * (u.apartments || 1));
}

export function unitOccupant(uid) {
  const s = ctx.state;
  if (s.owned.find((o) => o.unitId === uid)) return 'player-owned';
  if (s.leases.find((o) => o.unitId === uid)) return 'player-leased';
  if (s.competitors.find((c) => c.unitId === uid && c.open)) return 'competitor';
  return null;
}

export function isUnitAvailable(uid) {
  return !unitOccupant(uid);
}

export function refreshListings(initial = false) {
  const s = ctx.state;
  const units = ctx.units;
  const day = now().day;
  // expire old listings
  s.listings = s.listings.filter((l) => day - l.posted < 30 + (l.extra || 0) && isUnitAvailable(l.unitId));
  const target = 46;
  const ids = Object.keys(units);
  let guard = 0;
  while (s.listings.length < target && guard++ < 800) {
    const id = ids[rng.int(0, ids.length - 1)];
    const u = units[id];
    if (!isUnitAvailable(id) || s.listings.find((l) => l.unitId === id)) continue;
    if (u.district === 'park') continue;
    // bias: keep plenty of affordable small retail around early on
    if (initial && u.type === 'retail' && u.area > 320 && rng.chance(0.6)) continue;
    const mode = u.type === 'residential' || u.type === 'building' ? (rng.chance(0.8) ? 'sale' : 'both') : rng.chance(0.55) ? 'lease' : rng.chance(0.5) ? 'both' : 'sale';
    s.listings.push({ unitId: id, mode, posted: day - (initial ? rng.int(0, 20) : 0), priceMul: rng.float(0.93, 1.1), rentMul: rng.float(0.92, 1.08) });
  }
  ctx.bus.emit('listings');
}

export function listingPrice(l) { return Math.round((unitValue(ctx.units[l.unitId]) * l.priceMul) / 1000) * 1000; }
export function listingRent(l) { return Math.round((unitRent(ctx.units[l.unitId]) * l.rentMul) / 10) * 10; }

export function leaseUnit(unitId, months = 12) {
  const s = ctx.state;
  const l = s.listings.find((x) => x.unitId === unitId);
  const u = ctx.units[unitId];
  if (!l || !u) return false;
  const rent = listingRent(l);
  const deposit = rent * 2;
  const first = rent;
  if (!spend(deposit + first, 'deposit', `Lease deposit + first month: ${u.address}`)) return false;
  // first month counts as rent expense
  txn(first, 'deposit', 'reclass', null, { silent: true });
  txn(-first, 'rent', `Rent: ${u.address}`);
  const d = now().day;
  s.leases.push({ unitId, rent, start: d, end: d + months * 30, deposit, nextDue: d + 30 });
  s.listings = s.listings.filter((x) => x.unitId !== unitId);
  ctx.bus.emit('property', unitId);
  toast('Lease signed', `${u.label}, ${u.address} — ${money(rent)}/mo`, 'good');
  ctx.audio?.play('cash');
  return true;
}

export function buyUnit(unitId, { mortgageId = null, price = null } = {}) {
  const s = ctx.state;
  const l = s.listings.find((x) => x.unitId === unitId);
  const u = ctx.units[unitId];
  if (!u) return false;
  const p = price ?? (l ? listingPrice(l) : unitValue(u));
  const closing = Math.round(p * 0.025);
  const loan = mortgageId ? s.loans.find((x) => x.id === mortgageId) : null;
  const cashNeeded = p + closing - (loan ? loan.principal : 0);
  if (!loan) {
    if (!spend(p, 'property', `Purchase: ${u.label}, ${u.address}`)) return false;
    txn(-closing, 'fees', `Closing costs: ${u.address}`);
  } else {
    if (s.cash < cashNeeded) { toast('Insufficient funds', `Need ${money(cashNeeded)} for down payment & closing.`, 'bad'); return false; }
    txn(-p, 'property', `Purchase: ${u.label}, ${u.address}`);
    txn(-closing, 'fees', `Closing costs: ${u.address}`);
  }
  s.owned.push({ unitId, price: p, day: now().day, mortgageId, use: 'vacant', tenant: null, nextTax: now().day + 30 });
  s.listings = s.listings.filter((x) => x.unitId !== unitId);
  ctx.bus.emit('property', unitId);
  toast('Property acquired', `${u.label}, ${u.address} for ${money(p)}`, 'good');
  ctx.audio?.play('cash');
  return true;
}

export function sellUnit(unitId) {
  const s = ctx.state;
  const o = s.owned.find((x) => x.unitId === unitId);
  const u = ctx.units[unitId];
  if (!o || !u) return false;
  if (s.businesses.find((b) => b.unitId === unitId)) { toast('Cannot sell', 'Close or relocate the business operating here first.', 'bad'); return false; }
  const v = unitValue(u) * (o.tenant ? 1.04 : 1);
  const fees = v * 0.05;
  txn(v, 'property', `Sale: ${u.label}, ${u.address}`);
  txn(-fees, 'fees', `Broker & closing fees: ${u.address}`);
  if (o.mortgageId) {
    const loan = s.loans.find((x) => x.id === o.mortgageId);
    if (loan) { txn(-loan.balance, 'loan', `Mortgage payoff: ${u.address}`); loan.balance = 0; loan.closed = true; }
  }
  s.owned = s.owned.filter((x) => x !== o);
  ctx.bus.emit('property', unitId);
  toast('Property sold', `${u.address} for ${money(v)}`, 'good');
  return true;
}

export function endLease(unitId) {
  const s = ctx.state;
  const l = s.leases.find((x) => x.unitId === unitId);
  if (!l) return false;
  if (s.businesses.find((b) => b.unitId === unitId)) { toast('Business still operating', 'Close the business at this location first.', 'bad'); return false; }
  const d = now().day;
  const remainingMonths = Math.max(0, Math.ceil((l.end - d) / 30));
  const penalty = remainingMonths > 0 ? Math.round(l.rent * Math.min(3, remainingMonths) * 0.5) : 0;
  if (penalty) txn(-penalty, 'fees', `Early lease termination: ${ctx.units[unitId].address}`);
  txn(l.deposit, 'deposit', `Deposit returned: ${ctx.units[unitId].address}`);
  s.leases = s.leases.filter((x) => x !== l);
  ctx.bus.emit('property', unitId);
  toast('Lease ended', penalty ? `Early termination penalty ${money(penalty)}` : 'Deposit returned.', penalty ? 'warn' : 'good');
  return true;
}

export function findTenant(unitId) {
  const s = ctx.state;
  const o = s.owned.find((x) => x.unitId === unitId);
  const u = ctx.units[unitId];
  if (!o || o.use === 'business') return;
  const rentRoll = u.residential || u.type === 'residential' ? residentialRentRoll(u) : unitRent(u);
  o.use = 'listing';
  o.tenant = null;
  o.listedDay = now().day;
  o.askRent = rentRoll;
  toast('Listed for tenants', `Asking ${money(rentRoll)}/mo. Tenants usually sign within a week.`, 'info');
}

export function dailyProperties() {
  const s = ctx.state;
  const d = now().day;
  // rent due on leases
  for (const l of s.leases) {
    if (d >= l.nextDue) {
      l.nextDue += 30;
      txn(-l.rent, 'rent', `Rent: ${ctx.units[l.unitId].address}`, s.businesses.find((b) => b.unitId === l.unitId)?.id);
    }
    if (d >= l.end) {
      // auto-renew with a market adjustment
      const u = ctx.units[l.unitId];
      const market = unitRent(u);
      const newRent = Math.round(Math.max(l.rent * 1.0, (l.rent + market) / 2) / 10) * 10;
      l.end = d + 360;
      if (newRent !== l.rent) message('Landlord', `Lease renewed: ${u.address}`, `Your lease auto-renewed for 12 months. New rent: ${money(newRent)}/mo (was ${money(l.rent)}).`);
      l.rent = newRent;
    }
  }
  for (const o of s.owned) {
    const u = ctx.units[o.unitId];
    if (d >= (o.nextTax ?? d + 1)) {
      o.nextTax = d + 30;
      txn(-(unitValue(u) * 0.012) / 12, 'property_tax', `Property tax: ${u.address}`);
      // maintenance on rentals
      if (o.tenant) txn(-o.tenant.rent * 0.08, 'maintenance', `Upkeep: ${u.address}`);
      if (o.tenant) txn(o.tenant.rent * (1 - (o.tenant.vacancy || 0)), 'rental', `Rent received: ${u.address}`);
    }
    if (o.use === 'listing' && !o.tenant) {
      const days = d - (o.listedDay || d);
      if (rng.chance(clamp(0.12 + days * 0.02, 0, 0.6))) {
        const name = `${FIRST[rng.int(0, FIRST.length - 1)]} ${LAST[rng.int(0, LAST.length - 1)]}`;
        o.tenant = { name: u.residential || u.type === 'residential' ? (u.apartments > 1 ? `${u.apartments} households` : `${name} family`) : `${name}'s company`, rent: o.askRent, since: d, end: d + 360, vacancy: u.apartments > 1 ? rng.float(0.03, 0.09) : 0 };
        o.use = 'rental';
        message('Keystone Realty', `Tenant secured: ${u.address}`, `${o.tenant.name} signed a 12-month lease at ${money(o.askRent)}/mo. Rent is collected monthly; we deduct ~8% for upkeep.`);
      }
    }
    if (o.tenant && d >= o.tenant.end) {
      if (rng.chance(0.7)) { o.tenant.end = d + 360; o.tenant.rent = Math.round(o.tenant.rent * 1.03); }
      else { message('Keystone Realty', `Tenant moving out: ${u.address}`, `${o.tenant.name} did not renew. The property is back on the rental market.`); o.tenant = null; o.use = 'listing'; o.listedDay = d; }
    }
  }
  if (d % 3 === 0) refreshListings();
  // property value drift per unit
  if (d % 7 === 0) for (const id of Object.keys(ctx.units)) {
    if (rng.chance(0.05)) {
      const st = (s.unitState[id] ||= {});
      st.valueMul = clamp((st.valueMul ?? 1) * rng.float(0.97, 1.04), 0.75, 1.4);
    }
  }
}

export function propertyValueTotal() {
  return ctx.state.owned.reduce((a, o) => a + unitValue(ctx.units[o.unitId]), 0);
}
