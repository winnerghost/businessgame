// Port Meridian Exchange: equities with sector/economy-driven prices, trading, dividends and your IPO.
import { ctx } from '../core/ctx.js';
import { rng, clamp, money } from '../core/utils.js';
import { STOCKS } from './data/names.js';
import { txn, now, toast, message } from './state.js';
import { news } from './economy.js';

export const COMMISSION = { flat: 4.95, pct: 0.001 };

export function newMarket() {
  return {
    list: STOCKS.map((s) => ({ ...s, open: s.price, prev: s.price, hist: Array.from({ length: 60 }, (_, i) => s.price * (1 + Math.sin(i / 7) * 0.03 + (Math.random() - 0.5) * 0.04)), intraday: [] })),
    holdings: {},
    index: 1000,
    indexHist: [1000],
  };
}

const SECTOR_CYCLE = { Conglomerate: 1.1, Finance: 1.3, Retail: 1.2, 'Consumer Staples': 0.4, Energy: 0.9, Telecom: 0.5, Technology: 1.5, Healthcare: 0.5, Industrials: 1.2, Logistics: 1.0, Media: 1.3, Ventures: 1.4 };

export function hourlyMarket() {
  const m = ctx.state.stocks;
  const d = now();
  if (d.weekday >= 5 || d.hour < 9 || d.hour > 16) return; // market hours
  const e = ctx.state.economy;
  const drift = (e.index - 1) * 0.0006 + (e.confidence - 0.6) * 0.0004;
  for (const s of m.list) {
    if (s.player) { updatePlayerStock(s); continue; }
    const beta = SECTOR_CYCLE[s.sector] ?? 1;
    const shock = rng.normal(0, s.vol / Math.sqrt(7));
    s.price = Math.max(1, s.price * (1 + drift * beta + shock));
    s.intraday.push(s.price);
  }
}

export function dailyMarket() {
  const m = ctx.state.stocks;
  const d = now();
  if (d.weekday >= 5) return;
  for (const s of m.list) {
    s.prev = s.open;
    s.hist.push(s.price);
    if (s.hist.length > 180) s.hist.shift();
    s.open = s.price;
    s.intraday = [];
    // rare news events
    if (!s.player && rng.chance(0.012)) {
      const up = rng.chance(0.5);
      const mag = rng.float(0.06, 0.18);
      s.price *= up ? 1 + mag : 1 - mag;
      news(`${s.name} (${s.sym}) ${up ? 'soars' : 'plunges'} ${Math.round(mag * 100)}% on ${up ? rng.pick(['blowout earnings', 'a takeover rumour', 'a major contract win', 'an analyst upgrade']) : rng.pick(['an earnings miss', 'a regulatory probe', 'a CEO departure', 'a product recall'])}.`, 'market');
    }
  }
  // index
  const avg = m.list.reduce((a, s) => a + s.price / (s.hist[0] || s.price), 0) / m.list.length;
  m.index = 1000 * avg;
  m.indexHist.push(m.index);
  if (m.indexHist.length > 180) m.indexHist.shift();
  // quarterly dividends
  if (d.dom === 15 && d.month % 3 === 2) {
    for (const [sym, h] of Object.entries(m.holdings)) {
      const s = m.list.find((x) => x.sym === sym);
      if (s?.div && h.qty > 0) {
        const amt = (h.qty * s.price * s.div) / 4;
        txn(amt, 'dividend', `Dividend: ${sym} × ${h.qty}`);
      }
    }
  }
}

export function commission(value) { return COMMISSION.flat + value * COMMISSION.pct; }

export function buyShares(sym, qty) {
  const m = ctx.state.stocks;
  const s = m.list.find((x) => x.sym === sym);
  qty = Math.floor(qty);
  if (!s || qty <= 0) return false;
  if (s.player) { toast('Restricted', 'Insiders cannot trade their own stock here.', 'warn'); return false; }
  const cost = s.price * qty;
  const fee = commission(cost);
  if (ctx.state.cash < cost + fee) { toast('Insufficient funds', `Need ${money(cost + fee)}`, 'bad'); return false; }
  txn(-(cost + fee), 'stocks', `Buy ${qty} ${sym} @ ${money(s.price, { decimals: 2 })}`);
  const h = (m.holdings[sym] ||= { qty: 0, cost: 0 });
  h.cost += cost + fee;
  h.qty += qty;
  // large buys move the price
  const impact = (qty / s.shares) * 6;
  s.price *= 1 + impact;
  ctx.bus.emit('trade', sym);
  ctx.audio?.play('confirm');
  return true;
}

export function sellShares(sym, qty) {
  const m = ctx.state.stocks;
  const s = m.list.find((x) => x.sym === sym);
  const h = m.holdings[sym];
  qty = Math.floor(Math.min(qty, h?.qty || 0));
  if (!s || qty <= 0) return false;
  const value = s.price * qty;
  const fee = commission(value);
  const basis = (h.cost / h.qty) * qty;
  txn(value - fee, 'stocks', `Sell ${qty} ${sym} @ ${money(s.price, { decimals: 2 })} (P/L ${money(value - fee - basis, { sign: true })})`);
  h.cost -= basis;
  h.qty -= qty;
  if (h.qty <= 0) delete m.holdings[sym];
  s.price *= 1 - (qty / s.shares) * 6;
  ctx.bus.emit('trade', sym);
  return true;
}

export function portfolioValue() {
  const m = ctx.state.stocks;
  if (!m) return 0;
  let v = 0;
  for (const [sym, h] of Object.entries(m.holdings)) {
    const s = m.list.find((x) => x.sym === sym);
    if (s) v += s.price * h.qty;
  }
  return v;
}

export function ownershipOf(sym) {
  const m = ctx.state.stocks;
  const s = m.list.find((x) => x.sym === sym);
  const h = m.holdings[sym];
  return s && h ? h.qty / s.shares : 0;
}

// ------------------------------------------------------------------ IPO
export function ipoRequirements(equity, bizCount) {
  const c = ctx.state.company;
  return [
    { ok: !!c && c.entity === 'corp', text: 'Company is a C-Corporation' },
    { ok: equity >= 10e6, text: `Company valuation ≥ $10M (now ${money(equity, { compact: true })})` },
    { ok: bizCount >= 3, text: `At least 3 operating businesses (now ${bizCount})` },
  ];
}

export function doIPO(equity, ticker) {
  const s = ctx.state;
  const c = s.company;
  const shares = 50e6;
  const price = (equity * 1.12) / shares;
  const floatPct = 0.25;
  const newShares = shares * floatPct / (1 - floatPct);
  const raised = newShares * price;
  const fees = raised * 0.065;
  txn(raised - fees, 'equity', `IPO proceeds: ${newShares.toLocaleString()} shares @ ${money(price, { decimals: 2 })} (less underwriting)`);
  c.public = true;
  c.ticker = ticker;
  c.sharesOut = shares + newShares;
  c.playerShares = shares * (c.ownership ?? 1);
  c.ipoDay = now().day;
  s.stocks.list.push({ sym: ticker, name: c.name, sector: 'Ventures', price, open: price, prev: price, vol: 0.02, beta: 1.2, div: 0, shares: c.sharesOut, hist: [price], intraday: [], player: true });
  news(`${c.name} (${ticker}) rings the opening bell — IPO raises ${money(raised, { compact: true })}.`, 'market');
  message('Port Meridian Exchange', `Welcome to the public markets, ${ticker}`, `Your IPO raised ${money(raised)} (${money(fees)} underwriting fees). You retain ${c.playerShares.toLocaleString()} shares. The share price will now track your company's performance and market sentiment.`);
  ctx.bus.emit('ipo', ticker);
}

function updatePlayerStock(s) {
  // fair value from company equity with sentiment noise
  const c = ctx.state.company;
  if (!c) return;
  const eq = ctx.companyEquity ? ctx.companyEquity() : s.price * s.shares;
  const fair = (eq * 1.15) / c.sharesOut;
  s.sentiment = clamp((s.sentiment ?? 1) + rng.normal(0, 0.01) + (1 - (s.sentiment ?? 1)) * 0.02, 0.7, 1.4);
  s.price = Math.max(0.5, s.price + (fair * s.sentiment - s.price) * 0.05 + s.price * rng.normal(0, 0.004));
  s.intraday.push(s.price);
}
