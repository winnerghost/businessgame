// Story campaign, objectives, waypoints, and City Hall tenders.
import { ctx } from '../core/ctx.js';
import { rng, uid, money, clamp } from '../core/utils.js';
import { txn, now, message, toast } from './state.js';
import { BUSINESS_TYPES } from './data/businessTypes.js';
import { netWorth } from './finance.js';
import { kraneAttack, KRANE } from './competitors.js';
import { ownershipOf } from './stocks.js';

const lm = (id) => {
  const L = ctx.layout;
  const b = L.buildingById[L.landmarks[id].buildingId];
  return { x: b.door.x, z: b.door.z, label: L.landmarks[id].name };
};
const S = () => ctx.state;
const openBiz = () => S().businesses.filter((b) => b.status === 'open');
const commercialSpaces = () => [...S().leases.map((l) => l.unitId), ...S().owned.map((o) => o.unitId)].filter((id) => ['retail', 'office', 'industrial', 'building'].includes(ctx.units[id]?.type));
const totalRevenue = () => S().businesses.reduce((a, b) => a + (b.life.revenue || 0) + (b.life.contract || 0), 0) + (S().stats.soldRevenue || 0);

export const MISSIONS = [
  {
    id: 'm1', title: 'Welcome to Port Meridian', giver: 'Eleanor Vance',
    brief: 'You arrived with a few thousand dollars and a big idea. First, some quick cash: SwiftRoute Courier Depot down at the harbor always needs drivers. Grab your car and complete a delivery.',
    objectives: [
      { text: 'Get in your car (press F near it)', check: () => S().player.inCar || (S().missions.counters.deliveries || 0) > 0, target: () => ({ x: S().car.x, z: S().car.z, label: 'Your car' }) },
      { text: 'Complete a courier gig at SwiftRoute Depot', check: () => (S().missions.counters.deliveries || 0) >= 1, target: () => (S().gig ? null : lm('depot')) },
    ],
    reward: { cash: 1000, text: 'Eleanor sends $1,000 "for gas money".' },
  },
  {
    id: 'm2', title: 'Making It Official', giver: 'Eleanor Vance',
    brief: 'A real business needs a legal entity. Head to City Hall, register your company and pick up a general business license. Think carefully: a Sole Proprietorship is cheap but leaves your personal assets exposed; an LLC protects you; only a C-Corp can one day go public.',
    objectives: [
      { text: 'Register your company at City Hall', check: () => !!S().company, target: () => lm('cityhall') },
      { text: 'Obtain a general business license', check: () => !!S().licenses.business, target: () => lm('cityhall') },
    ],
    reward: { cash: 500, text: 'The city\'s Small Business Office mails you a $500 welcome grant.' },
  },
  {
    id: 'm3', title: 'Funding the Dream', giver: 'Eleanor Vance',
    brief: 'Fit-outs, equipment, deposits and payroll add up fast. Visit Meridian Trust Bank and secure financing — a microloan is the usual first step. (Or bring your cash to $60,000 the hard way.)',
    objectives: [
      { text: 'Secure a loan or investment — or hold $60,000 cash', check: () => S().loans.length > 0 || (S().company?.investors?.length ?? 0) > 0 || S().cash >= 60000, target: () => lm('bank') },
    ],
    reward: { cash: 0, text: 'Eleanor: "Debt is a tool. Respect it and it will build you an empire."' },
  },
  {
    id: 'm4', title: 'Location, Location, Location', giver: 'Eleanor Vance',
    brief: 'Foot traffic is everything. Browse listings at Keystone Realty (or on your tablet), compare districts, then lease or buy a commercial space. Small Northside or Midtown retail units are a sensible first step.',
    objectives: [
      { text: 'Lease or buy a commercial space', check: () => commercialSpaces().length > 0, target: () => lm('realty') },
    ],
    reward: { cash: 0, text: 'The keys are yours.' },
  },
  {
    id: 'm5', title: 'Open for Business', giver: 'Eleanor Vance',
    brief: 'Walk into your new space (or use the tablet) to set up a business. You will need the right permits from City Hall, staff, and opening inventory. Then throw open the doors.',
    objectives: [
      { text: 'Start setting up a business in your space', check: () => S().businesses.length > 0, target: () => { const u = commercialSpaces()[0]; if (!u) return null; const b = ctx.layout.buildingById[ctx.units[u].bId]; return { x: b.door.x, z: b.door.z, label: 'Your property' }; } },
      { text: 'Obtain the required permits (City Hall)', check: () => S().businesses.some((b) => BUSINESS_TYPES[b.type].permits.every((p) => S().permits.some((x) => x.type === p && x.status === 'active' && (!x.unitId || x.unitId === b.unitId)))), target: () => lm('cityhall') },
      { text: 'Hire staff (Staff app or TalentBridge)', check: () => S().businesses.some((b) => b.staff.length >= 1) },
      { text: 'Open your first business', check: () => openBiz().length > 0 },
    ],
    reward: { cash: 2500, text: 'Port Meridian Economic Development awards you a $2,500 new-business grant.' },
  },
  {
    id: 'm6', title: 'Finding Product-Market Fit', giver: 'Eleanor Vance',
    brief: 'Now the real work: tune prices, keep stock on the shelves, staff for the rush and build a reputation. Aim for $15,000 in total sales and a reputation of 60 at one of your businesses.',
    objectives: [
      { text: 'Reach $15,000 in total business revenue', check: () => totalRevenue() >= 15000, progress: () => `${money(totalRevenue())} / $15,000` },
      { text: 'Reach 60 reputation at a business', check: () => S().businesses.some((b) => b.reputation >= 60), progress: () => `best ${Math.round(Math.max(0, ...S().businesses.map((b) => b.reputation)))} / 60` },
    ],
    reward: { cash: 3000, text: 'A local business journal names you a "Founder to Watch". Bonus: $3,000 speaking fee.' },
  },
  {
    id: 'm7', title: 'Supply Chain', giver: 'Eleanor Vance',
    brief: 'Margins live and die on your cost of goods. Visit the Ironworks Wholesale Market and negotiate a supplier contract.',
    objectives: [{ text: 'Negotiate a supplier contract at the Wholesale Market', check: () => S().contracts.length > 0, target: () => lm('wholesale') }],
    reward: { cash: 2000, text: 'Your supplier throws in $2,000 of product credit.' },
  },
  {
    id: 'm8', title: 'Building an Empire', giver: 'Eleanor Vance',
    brief: 'One shop is a job. Several are a company. Operate three businesses, in at least two different districts. Delegate: managers automate restocking and keep morale up.',
    objectives: [
      { text: 'Operate 3 businesses', check: () => openBiz().length >= 3, progress: () => `${openBiz().length} / 3` },
      { text: 'Operate in 2+ districts', check: () => new Set(openBiz().map((b) => b.district)).size >= 2 },
    ],
    reward: { cash: 15000, text: 'Bonus $15,000 from a satisfied angel investor friend of Eleanor\'s.' },
  },
  {
    id: 'm9', title: 'Krane\'s Shadow', giver: KRANE.ceo,
    brief: '"Cute little shops. I\'m opening right next door to your best one — at prices you can\'t match. Sell to me now while it\'s still worth something." — Victor Krane. Survive the price war: keep your targeted business open for 21 days and push its reputation to 70+.',
    onStart: () => {
      const best = [...openBiz()].sort((a, b) => b.reputation * b.awareness - a.reputation * a.awareness)[0];
      if (best) { const c = kraneAttack(best); S().missions.flags.kraneTarget = best.id; S().missions.flags.kraneComp = c?.id; S().missions.flags.kraneStart = now().day; }
    },
    objectives: [
      { text: 'Keep your targeted business open for 21 days', check: () => { const f = S().missions.flags; const b = S().businesses.find((x) => x.id === f.kraneTarget); return !!b && b.status === 'open' && now().day - (f.kraneStart || now().day) >= 21; }, progress: () => `${Math.max(0, now().day - (S().missions.flags.kraneStart || now().day))} / 21 days` },
      { text: 'Reach 70 reputation at that business', check: () => (S().businesses.find((x) => x.id === S().missions.flags.kraneTarget)?.reputation ?? 0) >= 70 },
    ],
    reward: { cash: 25000, text: 'Krane\'s flagship struggles to steal your customers. A Times profile on "the founder who stood up to Krane" brings you $25,000 in new consulting deals.' },
  },
  {
    id: 'm10', title: 'Bricks & Mortar', giver: 'Eleanor Vance',
    brief: 'Rent makes your landlord rich. Own the ground beneath you: buy two properties (a commercial mortgage helps). Rentals produce passive income too.',
    objectives: [{ text: 'Own 2 properties', check: () => S().owned.length >= 2, progress: () => `${S().owned.length} / 2`, target: () => lm('realty') }],
    reward: { cash: 10000, text: 'Equity is the quiet engine of wealth.' },
  },
  {
    id: 'm11', title: 'Seven Figures', giver: 'Eleanor Vance',
    brief: 'Grow your net worth to $1,000,000. Every business valuation, property and share counts — minus your debts.',
    objectives: [{ text: 'Reach $1M net worth', check: () => netWorth() >= 1e6, progress: () => `${money(netWorth(), { compact: true })} / $1M` }],
    reward: { cash: 0, text: 'You\'re a millionaire. Eleanor sends champagne.' },
  },
  {
    id: 'm12', title: 'City Tender', giver: 'Mayor Ana Reyes',
    brief: 'The city is outsourcing big contracts to local firms. Bid on a tender at City Hall that matches one of your businesses, then deliver it.',
    objectives: [{ text: 'Win and complete a city tender', check: () => (S().missions.counters.tenders || 0) >= 1, target: () => lm('cityhall') }],
    reward: { cash: 50000, text: 'The Mayor presents you with the Small Business of the Year award and a $50,000 innovation prize.' },
  },
  {
    id: 'm13', title: 'Going Public', giver: 'Eleanor Vance',
    brief: 'Take your company public on the Port Meridian Exchange. You will need to be a C-Corporation valued at $10M+ with at least 3 operating businesses.',
    objectives: [{ text: 'IPO on the Port Meridian Exchange', check: () => !!S().company?.public, target: () => lm('exchange') }],
    reward: { cash: 0, text: 'The bell rings. You built this.' },
  },
  {
    id: 'm14', title: 'Hostile Takeover', giver: 'Eleanor Vance',
    brief: 'Victor Krane has made your life hard for long enough. Acquire a controlling 51% stake in Krane Holdings (KRN) on the Exchange.',
    objectives: [{ text: 'Own 51% of KRN', check: () => ownershipOf('KRN') >= 0.51, progress: () => `${(ownershipOf('KRN') * 100).toFixed(1)}% / 51%`, target: () => lm('exchange') }],
    reward: { cash: 0, text: 'Krane Holdings is yours. You are the undisputed tycoon of Port Meridian. The city is your sandbox now — keep building.' },
  },
];

export function currentMission() {
  const m = S().missions;
  return MISSIONS.find((x) => x.id === m.active) || null;
}

export function startMissions() {
  const m = S().missions;
  if (!m.active && !m.done.length) activate(MISSIONS[0]);
}

function activate(mission) {
  const m = S().missions;
  m.active = mission.id;
  mission.onStart?.();
  message(mission.giver, `New objective: ${mission.title}`, mission.brief);
  ctx.bus.emit('mission', mission);
}

export function objectiveStates(mission) {
  return mission.objectives.map((o) => {
    let ok = false;
    try { ok = !!o.check(); } catch (_) { ok = false; }
    return { ...o, ok, progressText: o.progress ? safe(o.progress) : null };
  });
}
function safe(fn) { try { return fn(); } catch (_) { return null; } }

export function tickMissions() {
  const mission = currentMission();
  if (!mission) return;
  const states = objectiveStates(mission);
  if (states.every((o) => o.ok)) {
    const m = S().missions;
    m.done.push(mission.id);
    if (mission.reward.cash) txn(mission.reward.cash, 'grant', `Mission reward: ${mission.title}`);
    toast('Mission complete', `${mission.title}${mission.reward.cash ? ` — ${money(mission.reward.cash)}` : ''}`, 'mission');
    message(mission.giver, `Completed: ${mission.title}`, mission.reward.text);
    ctx.audio?.play('fanfare');
    ctx.bus.emit('missionDone', mission);
    const idx = MISSIONS.indexOf(mission);
    const next = MISSIONS[idx + 1];
    m.active = null;
    if (next) setTimeout(() => activate(next), 2500);
    else message('Eleanor Vance', 'The city is yours', 'You completed the campaign. Keep expanding — there are always more markets to win.');
  }
}

export function missionTarget() {
  const mission = currentMission();
  if (!mission) return null;
  for (const o of objectiveStates(mission)) {
    if (o.ok) continue;
    if (o.target) { const t = safe(o.target); if (t) return t; }
    break;
  }
  return null;
}

// ------------------------------------------------------------------ City Hall tenders
const TENDERS = {
  cafe: ['Coffee service for City Hall offices', 'Catering for the Harbor Lights festival'],
  bakery: ['School breakfast program pastries', 'Bread supply for municipal canteens'],
  restaurant: ['Catering for the Mayor\'s gala', 'Meals for the senior services program'],
  grocery: ['Food bank restocking contract', 'Shelter provisions contract'],
  tech: ['Permit portal modernization', 'Traffic data analytics platform', '311 service app rebuild'],
  logistics: ['Snow-season salt distribution', 'Parks dept. equipment haulage', 'Library inter-branch courier'],
  factory: ['Uniforms for city workers', 'Packaged meals for emergency reserve'],
  hotel: ['Visiting delegation lodging block'],
  gym: ['Municipal employee wellness program'],
  boutique: ['Uniform supply for transit staff'],
  bar: ['Event bar service for the jazz festival'],
  pharmacy: ['Clinic supply contract'],
};
export function refreshTenders() {
  const s = S();
  s.tenders = (s.tenders || []).filter((t) => t.closes >= now().day);
  while (s.tenders.length < 4) {
    const type = rng.pick(Object.keys(TENDERS));
    const big = ['tech', 'logistics', 'factory', 'hotel'].includes(type);
    s.tenders.push({
      id: uid('tdr'), type, title: rng.pick(TENDERS[type]), value: Math.round(rng.float(big ? 60000 : 15000, big ? 320000 : 70000) * (s.economy.priceLevel || 1) / 1000) * 1000,
      days: rng.int(10, 30), minRep: rng.int(40, 65), closes: now().day + rng.int(4, 12),
    });
  }
}
export function bidTender(tenderId, bizId, bid) {
  const s = S();
  const t = s.tenders.find((x) => x.id === tenderId);
  const b = s.businesses.find((x) => x.id === bizId);
  if (!t || !b) return;
  if (s.tender) { toast('Already contracted', 'Finish your current city tender first.', 'warn'); return; }
  if (b.reputation < t.minRep) { toast('Not eligible', `Requires reputation ${t.minRep}+`, 'bad'); return; }
  const margin = (t.value - bid) / t.value;
  const p = clamp(0.3 + margin * 2.4 + (b.reputation - 55) / 120 + (b.quality - 55) / 200, 0.04, 0.92);
  s.tenders = s.tenders.filter((x) => x !== t);
  if (rng.chance(p)) {
    s.tender = { ...t, bid, bizId, start: now().day, until: now().day + t.days };
    message('City Procurement Office', `Tender awarded: ${t.title}`, `Congratulations — your bid of ${money(bid)} won. Keep ${b.name} operating for ${t.days} days to fulfil the contract. Costs of fulfilment (~55% of the bid) accrue daily; payment on completion.`);
    toast('Tender won!', `${t.title} — ${money(bid)}`, 'good');
    ctx.audio?.play('fanfare');
  } else {
    message('City Procurement Office', `Tender lost: ${t.title}`, `Your bid of ${money(bid)} was not selected. Estimated win probability was ${Math.round(p * 100)}%. Lower bids and stronger reputation improve your odds.`);
    toast('Tender lost', 'Another firm won the contract.', 'warn');
  }
}
export function dailyTender() {
  const s = S();
  const t = s.tender;
  if (!t) return;
  const b = s.businesses.find((x) => x.id === t.bizId);
  if (!b || b.status !== 'open') {
    s.tender = null;
    txn(-t.bid * 0.1, 'fines', `Tender default penalty: ${t.title}`);
    message('City Procurement Office', 'Tender terminated', 'Your business stopped operating, so the city terminated the contract with a 10% penalty.');
    return;
  }
  txn(-(t.bid * 0.55) / t.days, 'cogs', `Tender fulfilment costs: ${t.title}`, b.id, { silent: true });
  if (now().day >= t.until) {
    txn(t.bid, 'contract', `City tender completed: ${t.title}`, b.id);
    b.reputation = clamp(b.reputation + 6, 0, 100);
    s.missions.counters.tenders = (s.missions.counters.tenders || 0) + 1;
    toast('Tender completed', `City paid ${money(t.bid)}.`, 'good');
    s.tender = null;
  }
}
