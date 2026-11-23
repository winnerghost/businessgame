// Banking & accounting: loans, credit score, taxes, depreciation, overdraft, equity, net worth.
import { ctx } from '../core/ctx.js';
import { rng, uid, clamp, money } from '../core/utils.js';
import { txn, now, message, toast, plSummary, emptyPL } from './state.js';
import { ENTITY_TYPES } from './data/businessTypes.js';
import { VEHICLES } from './data/vehicles.js';
import { businessesValue, trailing, valuation } from './business.js';
import { propertyValueTotal, unitValue } from './properties.js';
import { portfolioValue } from './stocks.js';

export const LOAN_PRODUCTS = {
  personal: { id: 'personal', name: 'Personal Loan', min: 2000, max: 25000, terms: [12, 24, 36, 60], spread: 0.085, needsCompany: false, desc: 'Unsecured. Fast approval, high rate. Good for bootstrapping.' },
  micro: { id: 'micro', name: 'Small Business Microloan', min: 5000, max: 90000, terms: [24, 36, 60, 72], spread: 0.04, needsCompany: true, desc: 'Community-bank program for new ventures. Needs a registered company.' },
  sba: { id: 'sba', name: 'SBA-Guaranteed Term Loan', min: 50000, max: 2500000, terms: [60, 84, 120], spread: 0.0275, needsCompany: true, needsHistory: 30, desc: 'Government-backed. Low rate, long term. Needs 30+ days of trading history.' },
  equipment: { id: 'equipment', name: 'Equipment Financing', min: 10000, max: 1500000, terms: [36, 48, 60], spread: 0.035, needsCompany: true, desc: 'Secured by business equipment. Sized to your existing asset base.' },
  mortgage: { id: 'mortgage', name: 'Commercial Mortgage', min: 50000, max: 80000000, terms: [180, 240, 300], spread: 0.019, needsCompany: false, secured: true, desc: 'Up to 75% of a property\'s value. Taken when buying a property.' },
  loc: { id: 'loc', name: 'Business Line of Credit', min: 5000, max: 1000000, terms: [0], spread: 0.045, needsCompany: true, revolving: true, desc: 'Draw and repay any time. Interest only on what you use.' },
};

export function creditSpread(score) { return clamp(((760 - score) / 100) * 0.03, -0.005, 0.09); }
export function aprFor(productId) {
  const P = LOAN_PRODUCTS[productId];
  const e = ctx.state.economy;
  const s = ctx.state;
  const corp = s.company ? ENTITY_TYPES[s.company.entity].credit : 0;
  return Math.max(0.02, e.baseRate + P.spread + creditSpread(s.credit.score + corp * 0.3));
}
export function monthlyPayment(amount, apr, months) {
  if (!months) return 0;
  const r = apr / 12;
  return (amount * r) / (1 - Math.pow(1 + r, -months));
}

export function totalDebt() { return ctx.state.loans.filter((l) => !l.closed).reduce((a, l) => a + l.balance, 0); }
export function monthlyDebtService() { return ctx.state.loans.filter((l) => !l.closed).reduce((a, l) => a + (l.revolving ? l.balance * (l.apr / 12) : l.payment), 0); }

// Maximum the bank will lend under a product right now, with reasons.
export function loanLimit(productId) {
  const s = ctx.state;
  const P = LOAN_PRODUCTS[productId];
  const reasons = [];
  if (P.needsCompany && !s.company) reasons.push('Register a company at City Hall first.');
  const score = s.credit.score;
  if (score < 560) reasons.push('Credit score below 560.');
  let max = P.max;
  const rev = s.businesses.reduce((a, b) => a + trailing(b, 30).rev, 0) * 12;
  const opProfit = s.businesses.reduce((a, b) => a + trailing(b, 30).profit, 0);
  const nw = netWorth();
  if (productId === 'personal') max = clamp(4000 + (score - 580) * 90, 2000, P.max);
  if (productId === 'micro') max = clamp(32000 + (score - 620) * 600, 5000, P.max);
  if (productId === 'sba') {
    const days = s.businesses.filter((b) => b.opened).map((b) => now().day - b.opened);
    if (!days.length || Math.max(...days) < P.needsHistory) reasons.push(`Needs a business trading for ${P.needsHistory}+ days.`);
    max = clamp(rev * 0.45 + Math.max(0, nw) * 0.6 + Math.max(0, opProfit) * 18, 0, P.max);
  }
  if (productId === 'equipment') {
    const eq = s.businesses.reduce((a, b) => a + (b.equipValue || 0), 0);
    max = clamp(eq * 0.8, 0, P.max);
    if (eq <= 0) reasons.push('You need existing business equipment to secure this.');
  }
  if (productId === 'loc') max = clamp(rev * 0.12 + Math.max(0, nw) * 0.05 + (score - 600) * 120, 0, P.max);
  // debt-to-income cap: total monthly debt service must stay under 45% of monthly gross margin + 5% of net worth
  const capacity = Math.max(0, opProfit * 0.9 + rev / 12 * 0.08 + Math.max(0, nw) * 0.004 + 2500) - monthlyDebtService();
  if (!P.revolving && !P.secured) {
    const apr = aprFor(productId);
    const term = P.terms[P.terms.length - 1];
    const byDti = capacity > 0 ? (capacity * (1 - Math.pow(1 + apr / 12, -term))) / (apr / 12) : 0;
    max = Math.min(max, byDti);
    if (byDti < P.min) reasons.push('Your income can\'t support more debt right now.');
  }
  if (s.overdraftDays > 3) reasons.push('Account is overdrawn.');
  if (s.credit.missed > 2) reasons.push('Recent missed payments on file.');
  return { max: Math.floor(max / 1000) * 1000, reasons, apr: aprFor(productId) };
}

export function takeLoan(productId, amount, termMonths, { secured = null, purpose = '' } = {}) {
  const s = ctx.state;
  const P = LOAN_PRODUCTS[productId];
  const lim = loanLimit(productId);
  if (!P.secured && (lim.reasons.length || amount > lim.max)) {
    toast('Application declined', lim.reasons[0] || `Maximum approved: ${money(lim.max)}`, 'bad');
    return null;
  }
  const apr = lim.apr;
  const fee = Math.round(amount * (P.secured ? 0.01 : 0.015));
  const loan = {
    id: uid('loan'), product: productId, name: P.name, principal: amount, balance: amount, apr, term: termMonths,
    payment: P.revolving ? 0 : Math.round(monthlyPayment(amount, apr, termMonths) * 100) / 100,
    start: now().day, nextDue: now().day + 30, missed: 0, closed: false, secured, revolving: !!P.revolving, limit: P.revolving ? amount : 0, purpose,
  };
  if (P.revolving) { loan.balance = 0; }
  s.loans.push(loan);
  if (!P.revolving) {
    if (!P.secured) txn(amount, 'loan', `${P.name} proceeds`);
    else txn(amount, 'loan', `${P.name} proceeds${purpose ? `: ${purpose}` : ''}`);
  }
  txn(-fee, 'fees', `Origination fee: ${P.name}`);
  ctx.bus.emit('loan', loan);
  toast(P.revolving ? 'Credit line opened' : 'Loan approved', `${money(amount)} at ${(apr * 100).toFixed(2)}% APR`, 'good');
  ctx.audio?.play('cash');
  return loan;
}

export function drawLine(loan, amt) {
  amt = Math.min(amt, loan.limit - loan.balance);
  if (amt <= 0) return;
  loan.balance += amt;
  txn(amt, 'loan', `Credit line draw`);
  ctx.bus.emit('loan', loan);
}
export function repay(loan, amt) {
  amt = Math.min(amt, loan.balance, ctx.state.cash);
  if (amt <= 0) return;
  txn(-amt, 'loan', `Repayment: ${loan.name}`);
  loan.balance -= amt;
  if (!loan.revolving && loan.balance < 1) { loan.closed = true; loan.balance = 0; toast('Loan paid off', loan.name, 'good'); ctx.state.credit.score = clamp(ctx.state.credit.score + 8, 300, 850); }
  else if (!loan.revolving) {
    // re-amortise over remaining term
    const monthsLeft = Math.max(1, loan.term - Math.floor((now().day - loan.start) / 30));
    loan.payment = Math.round(monthlyPayment(loan.balance, loan.apr, monthsLeft) * 100) / 100;
  }
  ctx.bus.emit('loan', loan);
}

function processLoans() {
  const s = ctx.state;
  const d = now().day;
  for (const l of s.loans) {
    if (l.closed || d < l.nextDue) continue;
    l.nextDue += 30;
    const interest = l.balance * (l.apr / 12);
    const due = l.revolving ? interest + l.balance * 0.02 : Math.min(l.payment, l.balance + interest);
    if (due <= 0.01) continue;
    if (s.cash >= due) {
      txn(-interest, 'interest', `Interest: ${l.name}`);
      txn(-(due - interest), 'loan', `Principal: ${l.name}`);
      l.balance = Math.max(0, l.balance - (due - interest));
      s.credit.onTime++;
      s.credit.score = clamp(s.credit.score + (s.credit.onTime % 3 === 0 ? 2 : 1), 300, 850);
      if (!l.revolving && l.balance < 1) { l.closed = true; l.balance = 0; message('Meridian Trust Bank', `${l.name} paid in full`, 'Congratulations — this loan is fully repaid. It will continue to help your credit history.'); }
    } else {
      l.missed++;
      s.credit.missed++;
      const fee = due * 0.05;
      l.balance += interest + fee;
      s.credit.score = clamp(s.credit.score - 45, 300, 850);
      message('Meridian Trust Bank', `MISSED PAYMENT: ${l.name}`, `We could not collect your payment of ${money(due)}. A late fee of ${money(fee)} was added and the missed payment has been reported to credit bureaus. ${l.missed >= 3 ? 'This account is now in DEFAULT.' : 'Please ensure sufficient funds.'}`);
      toast('Missed loan payment', `${l.name}: credit score hit`, 'bad');
      if (l.missed >= 3) defaultLoan(l);
    }
  }
}

function defaultLoan(l) {
  const s = ctx.state;
  if (l.secured) {
    const o = s.owned.find((x) => x.unitId === l.secured);
    if (o) {
      const u = ctx.units[o.unitId];
      const v = unitValue(u) * 0.7;
      s.owned = s.owned.filter((x) => x !== o);
      const biz = s.businesses.find((b) => b.unitId === o.unitId);
      if (biz) { biz.status = 'closed'; s.businesses = s.businesses.filter((b) => b !== biz); }
      const surplus = v - l.balance;
      if (surplus > 0) txn(surplus, 'property', `Foreclosure surplus: ${u.address}`);
      message('Meridian Trust Bank', 'Foreclosure', `The bank has foreclosed on ${u.address} after repeated missed payments.`);
    }
  } else {
    // collections: seize available cash
    const take = Math.max(0, Math.min(s.cash, l.balance));
    if (take) txn(-take, 'loan', `Collections: ${l.name}`);
    l.balance -= take;
  }
  l.closed = l.balance <= 1 || !!l.secured;
  s.credit.score = clamp(s.credit.score - 110, 300, 850);
}

// ------------------------------------------------------------------ taxes & monthly close
export function taxRate() {
  const c = ctx.state.company;
  return c ? ENTITY_TYPES[c.entity].tax : 0.24;
}

export function monthlyClose() {
  const s = ctx.state;
  const d = now();
  // depreciation (non-cash)
  for (const a of s.assets.depreciating) {
    if (a.remaining <= 0) continue;
    a.remaining--;
    txn(-a.monthly, 'depreciation', 'Depreciation', a.bizId, { silent: true });
  }
  s.assets.depreciating = s.assets.depreciating.filter((a) => a.remaining > 0);
  // sales tax remittance
  if (s.taxes.salesPayable > 1) {
    const amt = s.taxes.salesPayable;
    txn(-amt, 'sales_tax', 'Sales tax remitted to state');
    s.taxes.salesPayable = 0;
  }
  // close the month's P&L
  const pl = plSummary(s.month);
  s.monthly.push({ month: d.month === 0 ? 11 : d.month - 1, year: d.month === 0 ? d.year - 1 : d.year, day: d.day, pl: { ...s.month }, summary: pl });
  if (s.monthly.length > 36) s.monthly.shift();
  for (const b of s.businesses) { b.lastMonth = { ...b.month }; b.month = emptyPL(); }
  s.month = emptyPL();
  // quarterly income tax
  if (d.month % 3 === 0) {
    const q = plSummary(s.quarter);
    let taxable = q.pretax - s.taxes.carryLoss;
    let tax = 0;
    if (taxable > 0) {
      tax = taxable * taxRate();
      s.taxes.carryLoss = 0;
      txn(-tax, 'income_tax', `Quarterly income tax (${(taxRate() * 100).toFixed(0)}% on ${money(taxable)})`);
      s.taxes.paidYTD += tax;
    } else {
      s.taxes.carryLoss = -taxable;
    }
    s.taxes.lastQuarterTax = tax;
    message('Revenue Service', 'Quarterly tax filed', taxable > 0
      ? `Taxable profit last quarter: ${money(taxable)}. Tax paid: ${money(tax)}.`
      : `You made a loss of ${money(-taxable)} last quarter. It carries forward to offset future profits.`);
    s.quarter = emptyPL();
  }
  // annual items
  if (d.month === 0) {
    if (s.company) {
      const E = ENTITY_TYPES[s.company.entity];
      if (E.annual) txn(-E.annual * (s.economy.priceLevel || 1), 'fees', `Annual ${E.name} filing fees`);
    }
    s.year = emptyPL();
    s.taxes.paidYTD = 0;
  }
  // credit drift: utilisation
  const debt = totalDebt();
  const assets = Math.max(1, s.cash + propertyValueTotal() + businessesValue());
  const util = debt / assets;
  s.credit.score = clamp(s.credit.score + (util < 0.3 ? 2 : util > 0.7 ? -4 : 0) + (s.overdraftDays > 0 ? -3 : 0), 300, 850);
  s.credit.history.push({ day: d.day, score: s.credit.score });
  if (s.credit.history.length > 48) s.credit.history.shift();
  ctx.bus.emit('monthClosed');
}

export function dailyFinance() {
  const s = ctx.state;
  processLoans();
  // business license renewal
  const lic = s.licenses.business;
  if (lic && lic.expires - now().day === 7) message('City Hall', 'Business license expiring', 'Your general business license expires in 7 days. It will auto-renew if you have funds.');
  if (lic && lic.expires <= now().day) {
    const fee = 250 * (s.economy.priceLevel || 1);
    if (s.cash >= fee) { txn(-fee, 'fees', 'Business license renewal'); lic.expires = now().day + 360; }
  }
  // overdraft
  if (s.cash < 0) {
    s.overdraftDays++;
    const fee = 35 + (-s.cash * 0.18) / 360;
    txn(-fee, 'interest', 'Overdraft fee & interest');
    if (s.overdraftDays === 1) message('Meridian Trust Bank', 'Your account is overdrawn', `Your balance is ${money(s.cash)}. Overdraft fees accrue daily. Bring the account positive to protect your credit.`);
    if (s.overdraftDays === 7) s.credit.score = clamp(s.credit.score - 25, 300, 850);
    if (s.overdraftDays === 21) message('Meridian Trust Bank', 'FINAL NOTICE', 'Your account has been overdrawn for 3 weeks. At 30 days we will begin forced liquidation of business assets.');
    if (s.overdraftDays >= 30) bankruptcy();
  } else s.overdraftDays = 0;
}

function bankruptcy() {
  const s = ctx.state;
  // liquidate stocks, then businesses (lowest value first), then properties
  let raised = 0;
  if (s.stocks) for (const [sym, h] of Object.entries(s.stocks.holdings)) {
    const st = s.stocks.list.find((x) => x.sym === sym);
    if (st) { const v = h.qty * st.price * 0.98; txn(v, 'stocks', `Forced sale: ${sym}`); raised += v; }
    delete s.stocks.holdings[sym];
  }
  const sorted = [...s.businesses].sort((a, b) => valuation(a) - valuation(b));
  for (const b of sorted) {
    if (s.cash >= 0) break;
    const v = valuation(b) * 0.6;
    txn(v, 'equity', `Forced sale: ${b.name}`);
    s.businesses = s.businesses.filter((x) => x !== b);
    raised += v;
  }
  for (const o of [...s.owned]) {
    if (s.cash >= 0) break;
    const v = unitValue(ctx.units[o.unitId]) * 0.75;
    txn(v, 'property', `Forced sale: ${ctx.units[o.unitId].address}`);
    s.owned = s.owned.filter((x) => x !== o);
  }
  if (s.cash < 0) txn(-s.cash, 'grant', 'Debt discharged in bankruptcy');
  s.credit.score = 480;
  s.overdraftDays = 0;
  message('U.S. Bankruptcy Court', 'Chapter 7 liquidation completed', `Your assets were liquidated to pay creditors (${money(raised)} raised). Your credit score has been reset to 480. Every great entrepreneur has a comeback story — this is yours.`);
  ctx.bus.emit('bankrupt');
}

// ------------------------------------------------------------------ equity & net worth
export function vehicleValue() {
  const s = ctx.state;
  return s.garage.reduce((a, id) => a + (VEHICLES[id]?.price || 0) * 0.6, 0);
}
export function depositsValue() { return ctx.state.leases.reduce((a, l) => a + l.deposit, 0); }

export function companyEquity() {
  const s = ctx.state;
  return s.cash + propertyValueTotal() + businessesValue() + depositsValue() - totalDebt() - s.taxes.salesPayable;
}
export function ownership() { return ctx.state.company?.ownership ?? 1; }
export function netWorth() {
  const s = ctx.state;
  const eq = companyEquity();
  const own = ownership();
  let ipoStake = 0;
  if (s.company?.public) {
    const st = s.stocks.list.find((x) => x.sym === s.company.ticker);
    if (st) return st.price * s.company.playerShares + portfolioValue() + vehicleValue();
  }
  return eq * own + portfolioValue() + vehicleValue() + ipoStake;
}

export function investorOffer() {
  const s = ctx.state;
  const eq = Math.max(150000, companyEquity());
  const growth = s.businesses.reduce((a, b) => a + Math.max(0, trailing(b, 30).profit), 0) * 12;
  const valuationPre = Math.round((eq + growth * 2.5) * rng.float(0.85, 1.2) / 10000) * 10000;
  const amount = Math.round(Math.min(valuationPre * 0.4, Math.max(100000, valuationPre * rng.float(0.15, 0.3))) / 10000) * 10000;
  const pct = amount / (valuationPre + amount);
  const names = ['Harborview Capital', 'Northstar Angels', 'Lumen Ventures', 'Meridian Growth Partners', 'Granite Peak Equity'];
  return { investor: rng.pick(names), amount, pct, valuationPre };
}
export function acceptInvestment(offer) {
  const s = ctx.state;
  if (!s.company) return;
  s.company.ownership = (s.company.ownership ?? 1) * (1 - offer.pct);
  (s.company.investors ||= []).push({ name: offer.investor, pct: offer.pct, amount: offer.amount, day: now().day });
  txn(offer.amount, 'equity', `Equity investment: ${offer.investor} (${(offer.pct * 100).toFixed(1)}%)`);
  toast('Investment closed', `${offer.investor} invested ${money(offer.amount)} for ${(offer.pct * 100).toFixed(1)}%.`, 'good');
  ctx.audio?.play('fanfare');
  ctx.bus.emit('investment', offer);
}
