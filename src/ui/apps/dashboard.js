import { ctx } from '../../core/ctx.js';
import { money } from '../../core/utils.js';
import { plSummary, fmtDate } from '../../game/state.js';
import { netWorth, totalDebt, ownership } from '../../game/finance.js';
import { trailing, valuation, openingChecklist } from '../../game/business.js';
import { BUSINESS_TYPES } from '../../game/data/businessTypes.js';
import { phaseName } from '../../game/economy.js';
import { currentMission } from '../../game/missions.js';
import { esc, statusPill, districtBadge } from './common.js';

export const dashboard = {
  id: 'dashboard', name: 'Dashboard', icon: '📊',
  render(params, T) {
    const s = ctx.state;
    const nw = netWorth();
    const today = plSummary(s.today);
    const month = plSummary(s.month);
    const last = s.monthly[s.monthly.length - 1];
    const alerts = [];
    if (s.cash < 0) alerts.push(['bad', `Your account is overdrawn (${money(s.cash)}). Fees accrue daily.`]);
    for (const b of s.businesses) {
      if (b.status === 'ready' || b.status === 'fitout') {
        const missing = openingChecklist(b).filter((i) => !i.ok);
        if (missing.length) alerts.push(['warn', `<b>${esc(b.name)}</b>: ${esc(missing[0].text)}`]);
        else alerts.push(['good', `<b>${esc(b.name)}</b> is ready — open it from Businesses.`]);
      }
      if (b.status === 'open' && b.lastDay && b.lastDay.items > 0 && b.lastDay.stockMiss / b.lastDay.items > 0.2) alerts.push(['warn', `<b>${esc(b.name)}</b> had stockouts yesterday (${Math.round((b.lastDay.stockMiss / b.lastDay.items) * 100)}% of demand unmet).`]);
      if (b.status === 'open' && b.lastDay && b.lastDay.lost > 20) alerts.push(['warn', `<b>${esc(b.name)}</b> turned away ${b.lastDay.lost} customers yesterday — understaffed?`]);
      if (b.leads?.length) alerts.push(['info', `<b>${esc(b.name)}</b> has ${b.leads.length} contract lead${b.leads.length > 1 ? 's' : ''} waiting.`]);
    }
    const unread = s.messages.filter((m) => !m.read).length;
    if (unread) alerts.push(['info', `${unread} unread message${unread > 1 ? 's' : ''}.`]);
    const m = currentMission();
    const hist = s.netWorthHist.slice(-90);
    const daily = s.daily.slice(-30);
    return `
      <div class="grid g5">
        <div class="card kpi"><div class="l">Cash</div><div class="v num gold">${money(s.cash)}</div><div class="s">${s.company ? esc(s.company.name) : 'Personal account'}</div></div>
        <div class="card kpi"><div class="l">Net worth</div><div class="v num">${money(nw, { compact: true })}</div><div class="s">${s.company ? `You own ${(ownership() * 100).toFixed(1)}%` : 'Peak ' + money(s.stats.peakNetWorth, { compact: true })}</div></div>
        <div class="card kpi"><div class="l">Today's profit</div><div class="v num ${today.net >= 0 ? 'good' : 'bad'}">${money(today.net, { sign: true })}</div><div class="s">Revenue ${money(today.income)}</div></div>
        <div class="card kpi"><div class="l">This month</div><div class="v num ${month.net >= 0 ? 'good' : 'bad'}">${money(month.net, { sign: true, compact: true })}</div><div class="s">${last ? `Last month ${money(last.summary.net, { sign: true, compact: true })}` : 'First month'}</div></div>
        <div class="card kpi"><div class="l">Credit score</div><div class="v num">${s.credit.score}</div><div class="s">Debt ${money(totalDebt(), { compact: true })}</div></div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><h3>Net worth (90 days)</h3>${T.chart([{ data: hist.map((h) => h.nw), color: '#f2c14e', fill: true }], { fmt: (v) => money(v, { compact: true }), zero: false })}</div>
        <div class="card"><h3>Daily profit (30 days)</h3>${T.chart([{ data: daily.map((d) => d.net), type: 'bar' }], { fmt: (v) => money(v, { compact: true }) })}</div>
      </div>
      <div class="grid" style="grid-template-columns: 1.6fr 1fr;margin-top:14px">
        <div class="card"><h3>Your businesses <button class="btn small" data-act="go" data-arg="businesses">Manage →</button></h3>
          ${s.businesses.length ? `<table class="t"><thead><tr><th>Business</th><th>District</th><th>Status</th><th class="r">30d revenue</th><th class="r">30d profit</th><th class="r">Rep</th><th class="r">Value</th></tr></thead><tbody>
          ${s.businesses.map((b) => { const tr = trailing(b, 30); return `<tr data-act="biz" data-arg="${b.id}" style="cursor:pointer"><td>${BUSINESS_TYPES[b.type].icon} <b>${esc(b.name)}</b></td><td>${districtBadge(b.district)}</td><td>${statusPill(b)}</td><td class="r num">${money(tr.rev, { compact: true })}</td><td class="r num ${tr.profit >= 0 ? 'good' : 'bad'}">${money(tr.profit, { compact: true })}</td><td class="r num">${Math.round(b.reputation)}</td><td class="r num">${money(valuation(b), { compact: true })}</td></tr>`; }).join('')}
          </tbody></table>` : `<div class="empty"><div class="big">🏪</div>No businesses yet. Lease a space from <b>Properties</b>, then set up a business there.<div style="margin-top:12px"><button class="btn primary" data-act="go" data-arg="properties">Browse properties</button></div></div>`}
        </div>
        <div class="stack">
          <div class="card"><h3>Alerts</h3>${alerts.length ? alerts.slice(0, 8).map(([c, t]) => `<div class="row" style="margin:7px 0;font-size:13px"><span class="pill ${c}">●</span><span>${t}</span></div>`).join('') : '<div class="muted">All clear.</div>'}</div>
          ${m ? `<div class="card"><h3>Current mission</h3><div style="font-weight:700;font-size:15px">${esc(m.title)}</div><div class="note" style="margin-top:6px">${esc(m.brief).slice(0, 220)}…</div><div style="margin-top:10px"><button class="btn small" data-act="go" data-arg="missions">Details</button></div></div>` : ''}
          <div class="card"><h3>Economy</h3><div class="row sb"><span class="muted">Cycle</span><b>${phaseName()}</b></div><div class="row sb"><span class="muted">Base rate</span><b class="num">${(s.economy.baseRate * 100).toFixed(2)}%</b></div><div class="row sb"><span class="muted">Inflation</span><b class="num">${(s.economy.inflation * 100).toFixed(1)}%</b></div><div class="row sb"><span class="muted">Consumer confidence</span><b class="num">${Math.round(s.economy.confidence * 100)}</b></div></div>
        </div>
      </div>`;
  },
  actions: {
    go: (id) => ctx.tablet.go(id),
    biz: (id) => ctx.tablet.go('businesses', { id }),
  },
};
