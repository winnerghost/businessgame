// City Hall services (company registration, licenses, permits), supplier contract negotiation, vehicle purchases.
import { ctx } from '../core/ctx.js';
import { rng, uid, clamp, money } from '../core/utils.js';
import { ENTITY_TYPES, PERMITS, SUPPLIER_TIERS } from './data/businessTypes.js';
import { VEHICLES } from './data/vehicles.js';
import { txn, spend, now, message, toast } from './state.js';

const pl = () => ctx.state.economy?.priceLevel ?? 1;

export function registerCompany(name, entity) {
  const s = ctx.state;
  const E = ENTITY_TYPES[entity];
  if (!E || !name.trim()) return false;
  if (s.company) {
    // conversion between entity types
    const fee = Math.round(E.fee * 1.5 * pl());
    if (!spend(fee, 'fees', `Entity conversion to ${E.name}`)) return false;
    s.company.entity = entity;
    toast('Entity converted', `${s.company.name} is now a ${E.name}.`, 'good');
    return true;
  }
  if (!spend(Math.round(E.fee * pl()), 'fees', `Company registration: ${name} (${E.name})`)) return false;
  s.company = { name: name.trim().slice(0, 40), entity, registered: now().day, ownership: 1, investors: [], public: false };
  s.credit.score = clamp(s.credit.score + E.credit * 0.4, 300, 850);
  toast('Company registered', `${s.company.name} — ${E.name}`, 'good');
  ctx.audio?.play('fanfare');
  ctx.bus.emit('company');
  return true;
}

export function buyBusinessLicense() {
  const s = ctx.state;
  const fee = Math.round(PERMITS.business_license.fee * pl());
  if (!s.company) { toast('Register first', 'You need a registered company.', 'warn'); return false; }
  if (!spend(fee, 'fees', 'General business license (1 year)')) return false;
  s.licenses.business = { expires: now().day + 360 };
  toast('License issued', 'Valid for one year.', 'good');
  return true;
}

export function applyPermit(type, unitId = null) {
  const s = ctx.state;
  const P = PERMITS[type];
  if (!P) return false;
  if (!s.company) { toast('Register first', 'Permits are issued to registered companies.', 'warn'); return false; }
  const scope = P.perLocation ? unitId : null;
  if (s.permits.some((x) => x.type === type && (x.unitId ?? null) === scope && x.status !== 'denied')) { toast('Already applied', P.name, 'info'); return false; }
  if (!spend(Math.round(P.fee * pl()), 'fees', `Permit application: ${P.name}${scope ? ' — ' + ctx.units[scope].address : ''}`)) return false;
  const p = { id: uid('pmt'), type, unitId: scope, status: P.days ? 'pending' : 'active', readyAt: s.clock.min + P.days * 1440, applied: now().day };
  s.permits.push(p);
  toast(P.days ? 'Application submitted' : 'Permit issued', P.days ? `${P.name}: processing takes ~${P.days} day${P.days > 1 ? 's' : ''}.` : P.name, 'good');
  ctx.bus.emit('business');
  return true;
}

export function processPermits() {
  const s = ctx.state;
  for (const p of s.permits) {
    if (p.status === 'pending' && s.clock.min >= p.readyAt) {
      // health certificate needs a passable site: rare failure if no business set up there yet
      p.status = 'active';
      message('City Hall — Permits Office', `${PERMITS[p.type].name} approved`, `Your ${PERMITS[p.type].name}${p.unitId ? ` for ${ctx.units[p.unitId].address}` : ''} has been approved and is now active.`);
      toast('Permit approved', PERMITS[p.type].name, 'good');
      ctx.bus.emit('business');
    }
  }
}

// Supplier negotiation: tactic choices affect success odds and discount.
export const TACTICS = [
  { id: 'volume', name: 'Commit to volume', desc: 'Promise steady orders for 6 months.', base: 0.7, disc: [0.05, 0.09], months: 6 },
  { id: 'long', name: 'Sign a 12-month exclusive', desc: 'Longer lock-in for a deeper discount.', base: 0.6, disc: [0.08, 0.14], months: 12 },
  { id: 'hardball', name: 'Play hardball', desc: 'Threaten to walk to a competitor. Risky.', base: 0.38, disc: [0.12, 0.2], months: 6 },
  { id: 'prepay', name: 'Prepay a quarter ($)', desc: 'Pay 3 months of estimated purchases upfront.', base: 0.9, disc: [0.07, 0.11], months: 6, prepay: true },
];
export function negotiate(supplierId, tacticId) {
  const s = ctx.state;
  const sup = SUPPLIER_TIERS.find((x) => x.id === supplierId);
  const T = TACTICS.find((x) => x.id === tacticId);
  if (!sup || !T) return null;
  if (!s.company) { toast('Register first', 'Suppliers only contract with registered companies.', 'warn'); return null; }
  const volume = s.businesses.filter((b) => b.status === 'open').length;
  const rep = s.businesses.length ? s.businesses.reduce((a, b) => a + b.reputation, 0) / s.businesses.length : 40;
  let p = clamp(T.base + volume * 0.05 + (rep - 50) / 200 + (s.credit.score - 680) / 1000, 0.05, 0.97);
  if (s.contracts.some((c) => c.supplier === supplierId && c.until > now().day)) { toast('Already contracted', `You have an active contract with ${sup.name}.`, 'info'); return null; }
  if (T.prepay) {
    const est = Math.round(Math.max(3000, volume * 6000) * pl());
    if (!spend(est, 'inventory', `Prepaid supply credit: ${sup.name}`)) return null;
    s.stats.prepaidSupply = (s.stats.prepaidSupply || 0) + est;
  }
  const success = rng.chance(p);
  if (!success) {
    if (tacticId === 'hardball') s.stats.burnedSuppliers = (s.stats.burnedSuppliers || 0) + 1;
    return { ok: false, p };
  }
  const discount = rng.float(T.disc[0], T.disc[1]) + Math.min(0.04, volume * 0.008);
  const c = { id: uid('sc'), supplier: supplierId, discount: Math.round(discount * 1000) / 1000, until: now().day + T.months * 30, global: true, signed: now().day };
  s.contracts.push(c);
  message(sup.name, 'Supply agreement signed', `We've agreed a ${(c.discount * 100).toFixed(1)}% discount on all orders for ${T.months} months. Select ${sup.name} as the supplier in each business's Operations tab to benefit.`);
  return { ok: true, p, contract: c };
}

export function buyVehicle(id, color) {
  const s = ctx.state;
  const V = VEHICLES[id];
  const cur = VEHICLES[s.car.id];
  const tradeIn = Math.round((cur?.price || 0) * 0.45);
  const price = Math.round(V.price * pl());
  if (s.car.id === id) { toast('Already yours', V.name, 'info'); return false; }
  if (s.cash + tradeIn < price) { toast('Insufficient funds', `Need ${money(price - tradeIn - s.cash)} more after trade-in.`, 'bad'); return false; }
  txn(-price, 'vehicle', `Purchase: ${V.name}`);
  if (tradeIn) txn(tradeIn, 'vehicle', `Trade-in: ${cur.name}`);
  s.garage = [id];
  s.car.id = id;
  s.car.color = color ?? V.color;
  ctx.bus.emit('carChanged');
  toast('New ride!', `${V.name} — trade-in ${money(tradeIn)}`, 'good');
  ctx.audio?.play('fanfare');
  return true;
}
