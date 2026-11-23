// AI competitors that share each district's demand, adapt prices, and (for Krane Holdings) expand aggressively.
import { ctx } from '../core/ctx.js';
import { rng, uid, clamp } from '../core/utils.js';
import { DISTRICTS } from './data/districts.js';
import { BUSINESS_TYPES } from './data/businessTypes.js';
import { NAME_PARTS } from './data/names.js';
import { now, message } from './state.js';
import { news } from './economy.js';
import { isUnitAvailable } from './properties.js';

const RETAIL_TYPES = ['cafe', 'bakery', 'restaurant', 'bar', 'boutique', 'grocery', 'pharmacy', 'gym', 'hotel'];
export const KRANE = { name: 'Krane Holdings', ceo: 'Victor Krane', color: '#b71c1c' };
const KRANE_BRANDS = { cafe: 'Krane Coffee Co.', restaurant: 'Krane Grill', boutique: 'KRN Apparel', grocery: 'KraneMart', gym: 'Krane Fitness', bar: 'The Krane Room', hotel: 'Krane Grand Hotel', bakery: 'Krane Bakehouse', pharmacy: 'KraneCare Pharmacy' };

function pickUnit(district, typeId) {
  const T = BUSINESS_TYPES[typeId];
  const cands = Object.values(ctx.units).filter((u) => u.district === district && T.unitTypes.includes(u.type) && u.area >= T.minArea && !u.residential && isUnitAvailable(u.id) && !ctx.state.listings.find((l) => l.unitId === u.id));
  return cands.length ? rng.pick(cands) : null;
}

export function makeCompetitor(typeId, district, { krane = false } = {}) {
  const u = pickUnit(district, typeId);
  if (!u) return null;
  const p = NAME_PARTS[typeId];
  return {
    id: uid('comp'), name: krane ? KRANE_BRANDS[typeId] : `${rng.pick(p.a)} ${rng.pick(p.b)}`, type: typeId, district, unitId: u.id,
    quality: krane ? rng.float(58, 72) : rng.float(35, 75), reputation: krane ? rng.float(55, 68) : rng.float(35, 72), priceIdx: krane ? rng.float(0.88, 0.97) : rng.float(0.9, 1.15),
    awareness: krane ? rng.float(0.55, 0.75) : rng.float(0.35, 0.7), open: true, krane, opened: now().day, weak: 0,
  };
}

export function seedCompetitors() {
  const s = ctx.state;
  s.competitors = [];
  for (const [did, D] of Object.entries(DISTRICTS)) {
    if (did === 'park') continue;
    for (const t of RETAIL_TYPES) {
      const aff = D.affinity[t] ?? 0;
      let n = Math.round(aff * rng.float(0.6, 1.6));
      if (t === 'hotel') n = Math.min(n, 1);
      for (let i = 0; i < n; i++) {
        const c = makeCompetitor(t, did, { krane: rng.chance(0.12) });
        if (c) s.competitors.push(c);
      }
    }
  }
}

// daily evolution
export function dailyCompetitors() {
  const s = ctx.state;
  const d = now().day;
  for (const c of s.competitors) {
    if (!c.open) continue;
    c.quality = clamp(c.quality + rng.normal(0, 0.4) + (c.krane ? 0.03 : 0), 20, 95);
    c.reputation = clamp(c.reputation + (c.quality - c.reputation) * 0.02 + rng.normal(0, 0.6), 5, 98);
    c.awareness = clamp(c.awareness + rng.normal(0, 0.01) + (c.krane ? 0.002 : 0), 0.1, 0.95);
    // price war: if a player business of same type & district is undercutting, respond
    const rivals = s.businesses.filter((b) => b.type === c.type && b.district === c.district && b.status === 'open');
    if (rivals.length) {
      const strongest = Math.max(...rivals.map((b) => b.reputation * b.awareness));
      if (strongest > c.reputation * c.awareness * 1.2) { c.weak++; c.priceIdx = clamp(c.priceIdx - 0.004, 0.75, 1.3); }
      else c.weak = Math.max(0, c.weak - 1);
    } else c.priceIdx = clamp(c.priceIdx + (1 - c.priceIdx) * 0.01, 0.75, 1.3);
    // closures
    if (c.weak > 60 && rng.chance(0.02) && !c.krane) {
      c.open = false;
      news(`${c.name} in ${DISTRICTS[c.district].name} announces it is closing its doors.`, 'business');
      ctx.bus.emit('competitorClosed', c);
    }
  }
  s.competitors = s.competitors.filter((c) => c.open || d - c.opened < 400);
  // new entrants
  if (rng.chance(0.04 * s.economy.index)) {
    const did = rng.pick(Object.keys(DISTRICTS).filter((x) => x !== 'park'));
    const t = rng.pick(RETAIL_TYPES.filter((x) => (DISTRICTS[did].affinity[x] ?? 0) > 0.6));
    const krane = rng.chance(0.25);
    const c = t ? makeCompetitor(t, did, { krane }) : null;
    if (c) {
      s.competitors.push(c);
      news(`${krane ? 'Krane Holdings opens' : 'New in town:'} ${c.name}, a ${BUSINESS_TYPES[t].name.toLowerCase()} in ${DISTRICTS[did].name}.`, 'business');
      const mine = s.businesses.find((b) => b.type === t && b.district === did);
      if (mine) message('Market Watch', `New competitor near ${mine.name}`, `${c.name} just opened in ${DISTRICTS[did].name}. Expect pressure on your market share — consider marketing, quality or price moves.`, { biz: mine.id });
    }
  }
}

// Krane targets the player's best business (used by the story mission)
export function kraneAttack(b) {
  const c = makeCompetitor(b.type, b.district, { krane: true });
  if (!c) return null;
  c.quality = Math.max(c.quality, b.quality + 5);
  c.priceIdx = 0.85;
  c.awareness = 0.8;
  c.reputation = Math.max(60, b.reputation);
  ctx.state.competitors.push(c);
  news(`Krane Holdings opens flagship ${c.name} in ${DISTRICTS[b.district].name}, promising "unbeatable prices".`, 'business');
  return c;
}

export function districtCompetition(district, type) {
  return ctx.state.competitors.filter((c) => c.open && c.district === district && (!type || c.type === type));
}
