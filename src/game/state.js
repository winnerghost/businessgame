// Root game state, calendar, and double-entry-ish accounting helpers.
import { ctx } from '../core/ctx.js';
import { uid } from '../core/utils.js';

export const SAVE_VERSION = 3;
export const START_YEAR = 2027;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Ledger categories: kind = income | cogs | opex | below (tax/interest-like but P&L) | capital (balance sheet only)
export const CATS = {
  revenue: { name: 'Sales revenue', kind: 'income' },
  contract: { name: 'Contract revenue', kind: 'income' },
  rental: { name: 'Rental income', kind: 'income' },
  gig: { name: 'Gig income', kind: 'income' },
  grant: { name: 'Grants & rewards', kind: 'income' },
  dividend: { name: 'Dividends', kind: 'income' },
  cogs: { name: 'Cost of goods sold', kind: 'cogs' },
  spoilage: { name: 'Spoilage & shrinkage', kind: 'cogs' },
  wages: { name: 'Wages', kind: 'opex' },
  payroll_tax: { name: 'Payroll taxes', kind: 'opex' },
  rent: { name: 'Rent', kind: 'opex' },
  utilities: { name: 'Utilities', kind: 'opex' },
  insurance: { name: 'Insurance', kind: 'opex' },
  marketing: { name: 'Marketing', kind: 'opex' },
  maintenance: { name: 'Repairs & maintenance', kind: 'opex' },
  fees: { name: 'Licenses, permits & fees', kind: 'opex' },
  commission: { name: 'Commissions', kind: 'opex' },
  property_tax: { name: 'Property tax', kind: 'opex' },
  fuel: { name: 'Fuel & vehicle costs', kind: 'opex' },
  training: { name: 'Training & recruiting', kind: 'opex' },
  fines: { name: 'Fines & legal', kind: 'opex' },
  depreciation: { name: 'Depreciation', kind: 'opex', noncash: true },
  interest: { name: 'Interest expense', kind: 'below' },
  income_tax: { name: 'Income tax', kind: 'below' },
  capex: { name: 'Equipment & fit-out', kind: 'capital' },
  property: { name: 'Property purchases/sales', kind: 'capital' },
  vehicle: { name: 'Vehicles', kind: 'capital' },
  deposit: { name: 'Security deposits', kind: 'capital' },
  loan: { name: 'Loan principal', kind: 'capital' },
  equity: { name: 'Equity & investors', kind: 'capital' },
  stocks: { name: 'Securities trading', kind: 'capital' },
  sales_tax: { name: 'Sales tax remitted', kind: 'capital' },
  personal: { name: 'Personal spending', kind: 'capital' },
  inventory: { name: 'Inventory purchases', kind: 'capital' },
};

export function emptyPL() {
  const o = {};
  for (const k of Object.keys(CATS)) o[k] = 0;
  return o;
}

export function newState(seed = 20261123) {
  return {
    v: SAVE_VERSION,
    seed,
    created: Date.now(),
    clock: { min: 8 * 60 },
    speed: 1,
    cash: 25000,
    player: { x: 0, z: 0, yaw: 0, inCar: false },
    car: { id: 'civara', color: 0x6f7f8c, x: 0, z: 0, yaw: 0 },
    garage: ['civara'],
    company: null,
    licenses: {},
    permits: [],
    businesses: [],
    owned: [], // {unitId, price, day, mortgageId, use, tenant}
    leases: [], // {unitId, rent, start, end, deposit}
    listings: [],
    unitState: {},
    candidates: [],
    loans: [],
    credit: { score: 672, onTime: 0, missed: 0, history: [] },
    overdraftDays: 0,
    ledger: [],
    today: emptyPL(),
    month: emptyPL(),
    year: emptyPL(),
    quarter: emptyPL(),
    daily: [],
    monthly: [],
    taxes: { salesPayable: 0, payrollPayable: 0, carryLoss: 0, paidYTD: 0, lastQuarterTax: 0 },
    assets: { depreciating: [] }, // {id, bizId, cost, monthly, remaining}
    economy: null,
    stocks: null,
    competitors: [],
    missions: { active: null, done: [], step: {}, flags: {}, counters: {} },
    gig: null,
    tender: null,
    contracts: [], // supplier contracts
    messages: [],
    events: [],
    stats: { revenue: 0, profit: 0, deliveries: 0, hires: 0, peakNetWorth: 0, daysPlayed: 0 },
    netWorthHist: [],
  };
}

// ------------------------------------------------------------------ calendar
export function dateOf(min) {
  const day = Math.floor(min / 1440) + 1;
  const m = min % 1440;
  const hour = Math.floor(m / 60), minute = Math.floor(m % 60);
  const month = Math.floor((day - 1) / 30) % 12;
  const year = START_YEAR + Math.floor((day - 1) / 360);
  const dom = ((day - 1) % 30) + 1;
  const weekday = (day - 1) % 7;
  const season = [3, 4, 5].includes(month) ? 'spring' : [6, 7, 8].includes(month) ? 'summer' : [9, 10, 11].includes(month) ? 'autumn' : 'winter';
  return { day, hour, minute, month, year, dom, weekday, season, hourF: m / 60, quarter: Math.floor(month / 3) };
}
export const now = () => dateOf(ctx.state.clock.min);
export const today = () => now().day;
export function fmtDate(day) {
  const d = dateOf((day - 1) * 1440);
  return `${MONTHS[d.month]} ${d.dom}, ${d.year}`;
}
export function fmtTime(min) {
  const d = dateOf(min);
  const h12 = ((d.hour + 11) % 12) + 1;
  return `${h12}:${String(d.minute).padStart(2, '0')} ${d.hour < 12 ? 'AM' : 'PM'}`;
}

// ------------------------------------------------------------------ accounting
export function txn(amount, cat, desc, bizId = null, opts = {}) {
  const s = ctx.state;
  if (!Number.isFinite(amount) || amount === 0) return;
  if (!CATS[cat]) cat = 'fees';
  if (!CATS[cat].noncash && !opts.noncash) s.cash += amount;
  for (const pl of [s.today, s.month, s.year, s.quarter]) pl[cat] = (pl[cat] || 0) + amount;
  if (bizId) {
    const b = s.businesses.find((x) => x.id === bizId);
    if (b) {
      for (const pl of [b.today, b.month, b.life]) pl[cat] = (pl[cat] || 0) + amount;
    }
  }
  if (!opts.silent && Math.abs(amount) >= (opts.minLog ?? 1)) {
    s.ledger.unshift({ id: uid('t'), day: now().day, t: s.clock.min, amount: Math.round(amount * 100) / 100, cat, desc, bizId });
    if (s.ledger.length > 600) s.ledger.length = 600;
  }
  ctx.bus.emit('cash', amount, cat);
}

// Can the player afford it (allowing for a small overdraft buffer only for automatic costs)?
export function canAfford(amount) { return ctx.state.cash >= amount; }

export function spend(amount, cat, desc, bizId = null) {
  if (ctx.state.cash < amount) {
    ctx.bus.emit('toast', { title: 'Insufficient funds', text: `You need $${Math.ceil(amount - ctx.state.cash).toLocaleString()} more.`, kind: 'bad' });
    ctx.audio?.play('error');
    return false;
  }
  txn(-amount, cat, desc, bizId);
  return true;
}

export function plSummary(pl) {
  let income = 0, cogs = 0, opex = 0, below = 0;
  for (const [k, v] of Object.entries(pl)) {
    const c = CATS[k];
    if (!c) continue;
    if (c.kind === 'income') income += v;
    else if (c.kind === 'cogs') cogs += v;
    else if (c.kind === 'opex') opex += v;
    else if (c.kind === 'below') below += v;
  }
  const gross = income + cogs;
  const ebitda = gross + opex - (pl.depreciation || 0);
  const operating = gross + opex;
  const pretax = operating + (pl.interest || 0);
  const net = operating + below;
  return { income, cogs, gross, opex, ebitda, operating, pretax, net };
}

export function message(from, subject, body, opts = {}) {
  const s = ctx.state;
  s.messages.unshift({ id: uid('msg'), from, subject, body, day: now().day, t: s.clock.min, read: false, ...opts });
  if (s.messages.length > 120) s.messages.length = 120;
  ctx.bus.emit('message', s.messages[0]);
}

export function toast(title, text = '', kind = 'info', icon = null) {
  ctx.bus.emit('toast', { title, text, kind, icon });
}
