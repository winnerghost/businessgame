import { ctx } from '../../core/ctx.js';
import { money } from '../../core/utils.js';
import { LOAN_PRODUCTS, loanLimit, takeLoan, repay, drawLine, monthlyPayment, aprFor, investorOffer, acceptInvestment, totalDebt } from '../../game/finance.js';
import { esc } from './common.js';

function scoreBand(s) { return s >= 780 ? ['Excellent', 'good'] : s >= 720 ? ['Very good', 'good'] : s >= 660 ? ['Good', 'info'] : s >= 600 ? ['Fair', 'warn'] : ['Poor', 'bad']; }

export const bank = {
  id: 'bank', name: 'Bank', icon: '🏦',
  title: () => 'Meridian Trust Bank — Online Banking',
  render(p, T) {
    const s = ctx.state;
    const [band, cls] = scoreBand(s.credit.score);
    const active = s.loans.filter((l) => !l.closed);
    const offer = p.offer;
    return `<div class="grid" style="grid-template-columns:1fr 2fr">
      <div class="card"><h3>Credit score</h3><div style="font-size:44px;font-weight:900" class="num">${s.credit.score}</div><span class="pill ${cls}">${band}</span>
        <div class="bar ${cls}" style="margin-top:12px"><div style="width:${((s.credit.score - 300) / 550) * 100}%"></div></div>
        <div class="note" style="margin-top:10px">On-time payments: ${s.credit.onTime} · Missed: ${s.credit.missed}<br>Pay on time, keep debt below 30% of assets, and avoid overdrafts.</div>
        ${s.credit.history.length > 1 ? T.chart([{ data: s.credit.history.map((h) => h.score), color: '#3ecf8e' }], { zero: false }, 'short') : ''}</div>
      <div class="card"><h3>Your accounts <span class="muted" style="text-transform:none;letter-spacing:0">Total debt ${money(totalDebt())}</span></h3>
        ${active.length ? `<table class="t"><thead><tr><th>Facility</th><th class="r">APR</th><th class="r">Balance</th><th class="r">Payment</th><th class="r">Next due</th><th class="r"></th></tr></thead><tbody>${active.map((l) => `<tr><td><b>${esc(l.name)}</b>${l.purpose ? `<div class="muted" style="font-size:11px">${esc(l.purpose)}</div>` : ''}${l.missed ? ` <span class="pill bad">${l.missed} missed</span>` : ''}</td><td class="r num">${(l.apr * 100).toFixed(2)}%</td><td class="r num">${money(l.balance)}${l.revolving ? `<div class="muted" style="font-size:11px">of ${money(l.limit)}</div>` : ''}</td><td class="r num">${l.revolving ? 'interest + 2%' : money(l.payment) + '/mo'}</td><td class="r">day ${l.nextDue}</td>
          <td class="r">${l.revolving ? `<input type="number" id="dl_${l.id}" value="10000" step="1000" style="width:90px"> <button class="btn small" data-act="draw" data-arg="${l.id}">Draw</button> ` : ''}<button class="btn small" data-act="repay" data-arg="${l.id}">Repay…</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted">No active loans.</div>'}</div></div>
      <h3 style="margin:22px 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)">Financing products</h3>
      <div class="grid g3">${Object.values(LOAN_PRODUCTS).filter((P) => P.id !== 'mortgage').map((P) => {
        const lim = loanLimit(P.id);
        const ok = !lim.reasons.length && lim.max >= P.min;
        return `<div class="card"><h3>${esc(P.name)} <span class="pill ${ok ? 'good' : ''}">${(lim.apr * 100).toFixed(2)}% APR</span></h3><div class="note" style="min-height:36px">${esc(P.desc)}</div>
          <div class="row sb" style="margin-top:8px"><span class="muted">Pre-approved up to</span><b class="num">${money(Math.max(0, lim.max))}</b></div>
          ${ok ? `<div class="row" style="margin-top:10px"><input type="number" id="la_${P.id}" value="${Math.min(lim.max, Math.max(P.min, Math.round(lim.max / 2 / 1000) * 1000))}" step="1000" style="flex:1;min-width:0;width:100%">${P.revolving ? '' : `<select id="lt_${P.id}">${P.terms.map((t) => `<option value="${t}">${t / 12} yr</option>`).join('')}</select>`}<button class="btn primary small" data-act="apply" data-arg="${P.id}">Apply</button></div>` : `<div class="callout warn" style="margin-top:10px;font-size:12px">${esc(lim.reasons[0] || `Minimum ${money(P.min)}`)}</div>`}</div>`;
      }).join('')}
      <div class="card"><h3>Commercial mortgages</h3><div class="note">Finance up to 75% of a property purchase over 15–25 years. Choose "Buy with mortgage" when viewing a property listing.</div><div class="row sb" style="margin-top:8px"><span class="muted">Current rate</span><b class="num">${(aprFor('mortgage') * 100).toFixed(2)}%</b></div></div></div>
      ${s.company ? `<h3 style="margin:22px 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)">Equity investors</h3>
        <div class="card">${offer ? `<div class="row sb"><div><b>${esc(offer.investor)}</b> offers <b class="gold">${money(offer.amount)}</b> for <b>${(offer.pct * 100).toFixed(1)}%</b> of ${esc(s.company.name)}<div class="note">Implied pre-money valuation ${money(offer.valuationPre)}. Investors share in your company's value forever — no repayments, but you own less.</div></div><div class="row"><button class="btn" data-act="noOffer">Decline</button><button class="btn primary" data-act="takeOffer">Accept</button></div></div>`
        : `<div class="row sb"><div class="note">Pitch angel investors and VCs for growth capital. Current ownership: ${((s.company.ownership ?? 1) * 100).toFixed(1)}%.${(s.company.investors || []).map((i) => `<br>${esc(i.name)}: ${(i.pct * 100).toFixed(1)}% for ${money(i.amount)}`).join('')}</div><button class="btn" data-act="pitch" ${s.stats.lastPitch && ctx.state.clock.min - s.stats.lastPitch < 7 * 1440 ? 'disabled' : ''}>Pitch investors</button></div>`}</div>` : ''}`;
  },
  actions: {
    apply: (id) => {
      const amt = parseFloat(document.getElementById('la_' + id)?.value || '0');
      const term = parseInt(document.getElementById('lt_' + id)?.value || '0', 10);
      const P = LOAN_PRODUCTS[id];
      const apr = aprFor(id);
      ctx.modal.confirm(`Apply for ${P.name}`, `${money(amt)} at ${(apr * 100).toFixed(2)}% APR${P.revolving ? ' (revolving — draw funds as needed)' : ` over ${term / 12} years: <b>${money(monthlyPayment(amt, apr, term))}/month</b>`}. Origination fee ${money(amt * 0.015)}.`, () => { takeLoan(id, amt, term); ctx.tablet.render(); }, { yes: 'Sign agreement' });
    },
    repay: (id) => {
      const l = ctx.state.loans.find((x) => x.id === id);
      ctx.modal.open({ title: `Repay ${l.name}`, body: `<p class="note">Balance ${money(l.balance)}. Extra principal payments shorten your loan and save interest — no prepayment penalty.</p><input type="number" id="rp" value="${Math.min(Math.round(l.balance), Math.max(0, Math.floor(ctx.state.cash)))}" step="1000" style="width:100%">`, foot: [{ label: 'Cancel' }, { label: 'Repay', cls: 'primary', fn: () => { repay(l, parseFloat(document.getElementById('rp').value) || 0); ctx.tablet.render(); } }] });
    },
    draw: (id) => { const l = ctx.state.loans.find((x) => x.id === id); drawLine(l, parseFloat(document.getElementById('dl_' + id)?.value || '0')); ctx.tablet.render(); },
    pitch: () => { ctx.state.stats.lastPitch = ctx.state.clock.min; ctx.tablet.params.offer = investorOffer(); ctx.tablet.render(); },
    noOffer: () => { ctx.tablet.params.offer = null; ctx.tablet.render(); },
    takeOffer: () => { acceptInvestment(ctx.tablet.params.offer); ctx.tablet.params.offer = null; ctx.tablet.render(); },
  },
};
