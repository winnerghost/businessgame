import { ctx } from '../../core/ctx.js';
import { money } from '../../core/utils.js';
import { CATS, plSummary, MONTHS, fmtDate } from '../../game/state.js';
import { ENTITY_TYPES, TAX } from '../../game/data/businessTypes.js';
import { totalDebt, netWorth, companyEquity, ownership, depositsValue, vehicleValue, taxRate } from '../../game/finance.js';
import { propertyValueTotal } from '../../game/properties.js';
import { businessesValue, inventoryValue } from '../../game/business.js';
import { portfolioValue } from '../../game/stocks.js';
import { esc } from './common.js';

function pl(T) {
  const s = ctx.state;
  const months = s.monthly.slice(-5);
  const cols = [{ name: 'Today', pl: s.today }, { name: 'This month', pl: s.month }, ...months.slice().reverse().map((m) => ({ name: `${MONTHS[m.month]} ${m.year}`, pl: m.pl }))].slice(0, 6);
  const rows = Object.entries(CATS).filter(([k, c]) => c.kind !== 'capital' && cols.some((x) => Math.abs(x.pl[k] || 0) > 0.5));
  const sums = cols.map((c) => plSummary(c.pl));
  const line = (label, key, bold) => `<tr><td>${bold ? `<b>${label}</b>` : label}</td>${sums.map((s2) => `<td class="r num ${s2[key] < 0 ? 'bad' : ''}">${bold ? '<b>' : ''}${money(s2[key])}${bold ? '</b>' : ''}</td>`).join('')}</tr>`;
  return `<div class="card"><h3>Income statement</h3><table class="t"><thead><tr><th></th>${cols.map((c) => `<th class="r">${c.name}</th>`).join('')}</tr></thead><tbody>
    ${rows.filter(([, c]) => c.kind === 'income').map(([k, c]) => `<tr><td>${c.name}</td>${cols.map((x) => `<td class="r num">${money(x.pl[k] || 0)}</td>`).join('')}</tr>`).join('')}
    ${line('Total revenue', 'income', true)}
    ${rows.filter(([, c]) => c.kind === 'cogs').map(([k, c]) => `<tr><td>${c.name}</td>${cols.map((x) => `<td class="r num bad">${money(x.pl[k] || 0)}</td>`).join('')}</tr>`).join('')}
    ${line('Gross profit', 'gross', true)}
    ${rows.filter(([, c]) => c.kind === 'opex').map(([k, c]) => `<tr><td>${c.name}</td>${cols.map((x) => `<td class="r num ${(x.pl[k] || 0) < 0 ? 'bad' : ''}">${money(x.pl[k] || 0)}</td>`).join('')}</tr>`).join('')}
    ${line('Operating profit (EBIT)', 'operating', true)}
    ${rows.filter(([, c]) => c.kind === 'below').map(([k, c]) => `<tr><td>${c.name}</td>${cols.map((x) => `<td class="r num bad">${money(x.pl[k] || 0)}</td>`).join('')}</tr>`).join('')}
    ${line('Net income', 'net', true)}
  </tbody></table></div>
  <div class="card" style="margin-top:14px"><h3>Monthly net income</h3>${T.chart([{ data: s.monthly.slice(-12).map((m) => m.summary.net), type: 'bar' }], { fmt: (v) => money(v, { compact: true }), labels: s.monthly.slice(-12).map((m) => MONTHS[m.month]) })}</div>`;
}

function balance() {
  const s = ctx.state;
  const inv = s.businesses.reduce((a, b) => a + inventoryValue(b), 0);
  const assets = [['Cash', s.cash], ['Business valuations', businessesValue()], ['  of which inventory', inv], ['Real estate', propertyValueTotal()], ['Lease deposits', depositsValue()], ['Securities', portfolioValue()], ['Vehicles (personal)', vehicleValue()]];
  const liab = [...s.loans.filter((l) => !l.closed && l.balance > 0).map((l) => [l.name, l.balance]), ['Sales tax payable', s.taxes.salesPayable]];
  const totA = assets.filter((a) => !a[0].startsWith('  ')).reduce((x, a) => x + a[1], 0);
  const totL = liab.reduce((x, a) => x + a[1], 0);
  return `<div class="grid g2"><div class="card"><h3>Assets</h3>${assets.map(([k, v]) => `<div class="row sb" style="margin:6px 0"><span class="${k.startsWith('  ') ? 'muted' : ''}">${k}</span><b class="num">${money(v)}</b></div>`).join('')}<div class="row sb" style="border-top:1px solid var(--line);padding-top:8px;margin-top:8px"><b>Total assets</b><b class="num">${money(totA)}</b></div></div>
    <div class="card"><h3>Liabilities</h3>${liab.length ? liab.map(([k, v]) => `<div class="row sb" style="margin:6px 0"><span>${esc(k)}</span><b class="num bad">${money(v)}</b></div>`).join('') : '<div class="muted">No liabilities.</div>'}<div class="row sb" style="border-top:1px solid var(--line);padding-top:8px;margin-top:8px"><b>Total liabilities</b><b class="num bad">${money(totL)}</b></div>
      <div class="row sb" style="margin-top:14px"><b>Company equity</b><b class="num gold">${money(companyEquity())}</b></div>
      <div class="row sb"><span class="muted">Your ownership</span><b class="num">${(ownership() * 100).toFixed(1)}%</b></div>
      <div class="row sb"><b>Your net worth</b><b class="num gold">${money(netWorth())}</b></div></div></div>`;
}

function ledger(p) {
  const s = ctx.state;
  const f = p.cat || 'all';
  const L = s.ledger.filter((t) => f === 'all' || t.cat === f).slice(0, 200);
  return `<div class="row" style="margin-bottom:10px"><select data-change="cat"><option value="all">All categories</option>${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === f ? 'selected' : ''}>${c.name}</option>`).join('')}</select><span class="muted note">Hourly sales, wages and COGS are posted continuously and summarised in the income statement.</span></div>
    <table class="t"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>${L.map((t) => `<tr><td class="muted">${fmtDate(t.day)}</td><td>${esc(t.desc)}</td><td><span class="pill">${CATS[t.cat]?.name || t.cat}</span></td><td class="r num ${t.amount < 0 ? 'bad' : 'good'}">${money(t.amount, { sign: true })}</td></tr>`).join('')}</tbody></table>`;
}

function taxes() {
  const s = ctx.state;
  const q = plSummary(s.quarter);
  const est = Math.max(0, q.pretax - s.taxes.carryLoss) * taxRate();
  const E = s.company ? ENTITY_TYPES[s.company.entity] : null;
  return `<div class="grid g3"><div class="card kpi"><div class="l">Sales tax payable</div><div class="v num">${money(s.taxes.salesPayable)}</div><div class="s">${(TAX.sales * 100).toFixed(2)}% · remitted on the 1st</div></div>
    <div class="card kpi"><div class="l">Quarter-to-date pre-tax profit</div><div class="v num ${q.pretax < 0 ? 'bad' : ''}">${money(q.pretax)}</div><div class="s">Estimated tax ${money(est)}</div></div>
    <div class="card kpi"><div class="l">Loss carry-forward</div><div class="v num">${money(s.taxes.carryLoss)}</div><div class="s">Paid this year ${money(s.taxes.paidYTD)}</div></div></div>
    <div class="card" style="margin-top:14px"><h3>Your tax position</h3><div class="row sb"><span class="muted">Entity</span><b>${E ? E.name : 'None (personal income)'}</b></div><div class="row sb"><span class="muted">Income tax rate</span><b>${(taxRate() * 100).toFixed(0)}%</b></div><div class="row sb"><span class="muted">Employer payroll tax</span><b>${(TAX.payroll * 100).toFixed(2)}%</b></div><div class="row sb"><span class="muted">Property tax</span><b>${(TAX.property * 100).toFixed(1)}% of value / yr</b></div>
      <div class="note" style="margin-top:10px">Income tax is assessed quarterly on pre-tax profit (after depreciation and interest). Losses carry forward. ${E?.liability ? 'Liability: ' + E.liability + '.' : ''}</div></div>`;
}

export const finance = {
  id: 'finance', name: 'Finance', icon: '📒',
  render(p, T) {
    const tab = p.tab || 'pl';
    const tabs = [['pl', 'Income statement'], ['bs', 'Balance sheet'], ['ledger', 'Ledger'], ['tax', 'Taxes']];
    return `<div class="subtabs">${tabs.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-arg="${k}">${n}</button>`).join('')}</div>
      ${tab === 'pl' ? pl(T) : tab === 'bs' ? balance() : tab === 'ledger' ? ledger(p) : taxes()}`;
  },
  actions: {
    tab: (t) => { ctx.tablet.params = { tab: t }; ctx.tablet.render(true); },
    cat: (v) => { ctx.tablet.params.cat = v; ctx.tablet.render(true); },
  },
};
export { totalDebt };
