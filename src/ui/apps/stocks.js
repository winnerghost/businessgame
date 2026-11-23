import { ctx } from '../../core/ctx.js';
import { money } from '../../core/utils.js';
import { buyShares, sellShares, portfolioValue, commission, ownershipOf } from '../../game/stocks.js';
import { esc } from './common.js';

export const stocks = {
  id: 'stocks', name: 'Stocks', icon: '📈',
  title: () => 'Port Meridian Exchange',
  render(p, T) {
    const m = ctx.state.stocks;
    const sel = m.list.find((x) => x.sym === (p.sym || m.list[0].sym)) || m.list[0];
    const h = m.holdings[sel.sym];
    const ch = (s) => (s.price - s.open) / s.open;
    const pv = portfolioValue();
    const cost = Object.values(m.holdings).reduce((a, x) => a + x.cost, 0);
    return `<div class="grid" style="grid-template-columns:1.1fr 1.4fr">
      <div class="card"><h3>Market <span class="muted" style="text-transform:none;letter-spacing:0">PMX index ${m.index.toFixed(1)}</span></h3><table class="t"><thead><tr><th>Symbol</th><th>Company</th><th class="r">Price</th><th class="r">Day</th></tr></thead><tbody>
        ${m.list.map((s) => `<tr data-act="sel" data-arg="${s.sym}" style="cursor:pointer;${s.sym === sel.sym ? 'background:rgba(242,193,78,0.08)' : ''}"><td><b>${s.sym}</b>${s.player ? ' <span class="pill gold">YOU</span>' : ''}</td><td class="muted">${esc(s.name)}</td><td class="r num">${s.price.toFixed(2)}</td><td class="r num ${ch(s) >= 0 ? 'good' : 'bad'}">${ch(s) >= 0 ? '+' : ''}${(ch(s) * 100).toFixed(2)}%</td></tr>`).join('')}</tbody></table>
        <div class="note" style="margin-top:8px">Prices move during market hours (weekdays 9:00–17:00) with the economy, sector cycles and company news.</div></div>
      <div class="stack"><div class="card"><h3>${esc(sel.name)} (${sel.sym}) <span class="pill">${esc(sel.sector)}</span></h3>
        <div class="row sb"><div style="font-size:30px;font-weight:900" class="num">${money(sel.price, { decimals: 2 })}</div><div class="num ${ch(sel) >= 0 ? 'good' : 'bad'}">${ch(sel) >= 0 ? '▲' : '▼'} ${(ch(sel) * 100).toFixed(2)}% today</div></div>
        ${T.chart([{ data: [...sel.hist.slice(-120), sel.price], color: '#5aa9ff', fill: true }], { zero: false, fmt: (v) => '$' + v.toFixed(0) }, 'tall')}
        <div class="grid g4" style="margin-top:10px"><div class="kpi"><div class="l">Market cap</div><div class="v num" style="font-size:15px">${money(sel.price * sel.shares, { compact: true })}</div></div><div class="kpi"><div class="l">Dividend</div><div class="v num" style="font-size:15px">${(sel.div * 100).toFixed(1)}%</div></div><div class="kpi"><div class="l">Volatility</div><div class="v num" style="font-size:15px">${(sel.vol * 100).toFixed(1)}%</div></div><div class="kpi"><div class="l">Your stake</div><div class="v num" style="font-size:15px">${(ownershipOf(sel.sym) * 100).toFixed(3)}%</div></div></div>
        ${sel.player ? '<div class="callout gold" style="margin-top:10px">This is your company. Its share price tracks your company\'s equity value and market sentiment.</div>' : `<div class="row" style="margin-top:12px"><input type="number" id="qty" value="${p.qty || 100}" min="1" step="10" style="width:120px"><span class="muted">shares ≈ ${money((p.qty || 100) * sel.price)} + ${money(commission((p.qty || 100) * sel.price), { decimals: 2 })} fee</span><span class="sp"></span><button class="btn good" data-act="buy" data-arg="${sel.sym}">Buy</button><button class="btn bad" data-act="sell" data-arg="${sel.sym}" ${h ? '' : 'disabled'}>Sell</button></div>
        ${h ? `<div class="note" style="margin-top:8px">You hold ${h.qty.toLocaleString()} shares, avg cost ${money(h.cost / h.qty, { decimals: 2 })}, P/L <span class="${h.qty * sel.price - h.cost >= 0 ? 'good' : 'bad'}">${money(h.qty * sel.price - h.cost, { sign: true })}</span></div>` : ''}`}</div>
      <div class="card"><h3>Portfolio <span class="num">${money(pv)} <span class="${pv - cost >= 0 ? 'good' : 'bad'}">(${money(pv - cost, { sign: true })})</span></span></h3>
        ${Object.keys(m.holdings).length ? Object.entries(m.holdings).map(([sym, x]) => { const s = m.list.find((y) => y.sym === sym); return `<div class="row sb" style="margin:6px 0"><span><b>${sym}</b> × ${x.qty.toLocaleString()}</span><span class="num">${money(x.qty * s.price)} <span class="${x.qty * s.price - x.cost >= 0 ? 'good' : 'bad'}">${money(x.qty * s.price - x.cost, { sign: true })}</span></span></div>`; }).join('') : '<div class="muted">No holdings.</div>'}</div></div></div>`;
  },
  actions: {
    sel: (sym) => { ctx.tablet.params.sym = sym; ctx.tablet.render(); },
    buy: (sym) => { const q = parseInt(document.getElementById('qty').value, 10); ctx.tablet.params.qty = q; buyShares(sym, q); ctx.tablet.render(); },
    sell: (sym) => { const q = parseInt(document.getElementById('qty').value, 10); ctx.tablet.params.qty = q; sellShares(sym, q); ctx.tablet.render(); },
  },
};
