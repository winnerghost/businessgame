// Headless economy test: node tools/simtest.mjs
import { ctx } from '../src/core/ctx.js';
import { buildLayout } from '../src/world/layout.js';
import { generateUnits, leaseUnit, refreshListings } from '../src/game/properties.js';
import { newGame, advance, skipTo } from '../src/game/sim.js';
import { createBusiness, openBusiness, valuation, trailing, restockNow } from '../src/game/business.js';
import { hire } from '../src/game/staff.js';
import { netWorth } from '../src/game/finance.js';
import { money } from '../src/core/utils.js';
import { BUSINESS_TYPES } from '../src/game/data/businessTypes.js';

const type = process.argv[2] || 'cafe';
const district = process.argv[3] || 'midtown';
const days = +(process.argv[4] || 45);
ctx.layout = buildLayout();
ctx.units = generateUnits(ctx.layout);
newGame();
const s = ctx.state;
s.cash = 5_000_000;
s.company = { name: 'TestCo', entity: 'llc', ownership: 1 };
s.licenses.business = { expires: 9999 };
const T = BUSINESS_TYPES[type];
const unit = Object.values(ctx.units).find((u) => u.district === district && T.unitTypes.includes(u.type) && u.area >= T.minArea && u.area < T.minArea * 4) || Object.values(ctx.units).find((u) => u.district === district && T.unitTypes.includes(u.type) && u.area >= T.minArea);
s.listings.push({ unitId: unit.id, mode: 'lease', posted: 1, priceMul: 1, rentMul: 1 });
leaseUnit(unit.id);
const line = type === 'factory' ? 'coffee' : null;
const b = createBusiness(unit.id, type, { name: 'Test ' + type, tier: 1, line });
for (const p of T.permits) s.permits.push({ type: p, unitId: unit.id, status: 'active' });
// hire a sensible team
const want = { cafe: { barista: 3, manager: 1 }, restaurant: { chef: 1, cook: 2, server: 3, manager: 1 }, gym: { desk: 2, trainer: 2, manager: 1 }, tech: { engineer: 4, sales: 1, manager: 1 }, hotel: { reception: 2, housekeeper: 10, manager: 1 }, factory: { operator: 6, manager: 1 }, logistics: { driver: 3, dispatcher: 1, manager: 1 }, grocery: { cashier: 3, stocker: 2, manager: 1 }, boutique: { associate: 2, manager: 1 }, bar: { bartender: 3, security: 1, manager: 1 }, bakery: { baker: 2, clerk: 1, manager: 1 }, pharmacy: { pharmacist: 1, tech: 2, manager: 1 } }[type];
for (const [role, n] of Object.entries(want)) for (let i = 0; i < n; i++) {
  s.candidates.push({ id: 'c' + role + i, name: 'Emp ' + role + i, typeId: type, role, skill: 55, ask: T.roles.find((r) => r.id === role).wage, traits: [], exp: 3, age: 30, posted: 1 });
  hire('c' + role + i, b.id);
}
if (type === 'logistics') { b.trucks = 3; }
skipTo(s.clock.min + T.fitoutDays * 1440 + 60);
// initial stock
if (T.model === 'retail') { b.autoRestock = true; restockNow(b); }
openBusiness(b) || console.log('open failed', b.status);
const startCash = s.cash;
for (let d = 0; d < days; d++) {
  skipTo(s.clock.min + 1440);
  const h = b.hist[b.hist.length - 1];
  if (d % 5 === 0 || d === days - 1) console.log(`day ${d} rev ${money(h.revenue)} profit ${money(h.profit)} cust ${h.customers} sat ${h.sat} rep ${b.reputation.toFixed(1)} aware ${b.awareness.toFixed(2)} q ${b.quality.toFixed(0)} util ${(h.util||0).toFixed(2)} ${T.model==='membership'?'members '+b.members:''}${T.model==='hotel'?'occ '+(b.occupancy||0).toFixed(2):''}${T.model==='agency'?'contracts '+b.contracts.length+' leads '+b.leads.length:''}`);
  if (T.model === 'agency') for (const l of [...b.leads].slice(0, Math.max(0, 1 - b.contracts.length))) { const { acceptLead } = await import('../src/game/business.js'); acceptLead(b, l.id); }
}
const tr = trailing(b, 30);
console.log(`\n${type} in ${district} (${unit.area} m2): 30d revenue ${money(tr.rev)} profit ${money(tr.profit)} | valuation ${money(valuation(b))} | cash delta ${money(s.cash - startCash)} | rent ${money(s.leases[0].rent)}/mo | NW ${money(netWorth())}`);
console.log('competitors in district/type:', s.competitors.filter((c) => c.type === type && c.district === district).length);
