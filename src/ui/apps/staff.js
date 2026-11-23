import { ctx } from '../../core/ctx.js';
import { money } from '../../core/utils.js';
import { BUSINESS_TYPES } from '../../game/data/businessTypes.js';
import { TRAITS } from '../../game/data/names.js';
import { roleDef, hire, postJobAd, marketWage, placementFee } from '../../game/staff.js';
import { esc } from './common.js';

const traitPill = (t) => { const T = TRAITS.find((x) => x.id === t); return `<span class="pill ${T?.good ? 'good' : 'bad'}" title="${esc(T?.desc || '')}">${esc(T?.name || t)}</span>`; };

export function candidateTable(list, { bizId = null, premium = false } = {}) {
  const s = ctx.state;
  if (!list.length) return '<div class="empty">No applicants right now. Post a job ad to attract more.</div>';
  return `<table class="t"><thead><tr><th>Candidate</th><th>Role</th><th class="r">Skill</th><th class="r">Exp</th><th class="r">Asking</th><th>Traits</th><th class="r">Hire into</th></tr></thead><tbody>
    ${list.map((c) => {
      const targets = s.businesses.filter((b) => b.type === c.typeId);
      const r = roleDef(c.typeId, c.role);
      const fee = placementFee(c);
      return `<tr><td><b>${esc(c.name)}</b><div class="muted" style="font-size:11px">${c.age}y${c.premium ? ' · <span class="gold">TalentBridge</span>' : ''}</div></td><td>${BUSINESS_TYPES[c.typeId].icon} ${esc(r?.name || c.role)}</td><td class="r num ${c.skill > 70 ? 'good' : c.skill < 35 ? 'bad' : ''}">${c.skill}</td><td class="r num">${c.exp}y</td>
        <td class="r num">${money(c.ask, { decimals: 2 })}/h<div class="muted" style="font-size:11px">mkt ${money(marketWage(c.typeId, c.role, c.skill), { decimals: 2 })}</div></td><td>${c.traits.map(traitPill).join(' ')}</td>
        <td class="r">${targets.length ? `<select id="hb_${c.id}">${targets.map((b) => `<option value="${b.id}" ${b.id === bizId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          <input type="number" id="hw_${c.id}" value="${c.ask.toFixed(2)}" step="0.25" style="width:72px" title="Hourly wage offer">
          <button class="btn small primary" data-act="hire" data-arg="${c.id}">Hire${fee ? ` (+${money(fee, { compact: true })} fee)` : ''}</button>` : '<span class="dim">No matching business</span>'}</td></tr>`;
    }).join('')}</tbody></table>`;
}

export const staff = {
  id: 'staff', name: 'Staff', icon: '👥',
  render(p) {
    const s = ctx.state;
    const b = p.biz ? s.businesses.find((x) => x.id === p.biz) : null;
    const tab = p.tab || 'board';
    const types = [...new Set(s.businesses.map((x) => x.type))];
    let body;
    if (tab === 'board') {
      const type = b?.type || p.type || types[0] || 'cafe';
      const roleF = p.role || 'all';
      const list = s.candidates.filter((c) => c.typeId === type && (roleF === 'all' || c.role === roleF)).sort((x, y) => y.skill - x.skill);
      body = `<div class="row wrap" style="margin-bottom:12px">
          <select data-change="type">${(types.length ? types : Object.keys(BUSINESS_TYPES)).map((t) => `<option value="${t}" ${t === type ? 'selected' : ''}>${BUSINESS_TYPES[t].icon} ${BUSINESS_TYPES[t].name}</option>`).join('')}</select>
          <select data-change="role"><option value="all">All roles</option>${BUSINESS_TYPES[type].roles.map((r) => `<option value="${r.id}" ${r.id === roleF ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
          <span class="sp"></span>${BUSINESS_TYPES[type].roles.map((r) => `<button class="btn small" data-act="ad" data-arg="${type}|${r.id}">Post ad: ${r.name} ($350)</button>`).join('')}</div>
        ${b ? `<div class="callout" style="margin-bottom:12px">Hiring for <b>${esc(b.name)}</b>. Offers below the asking wage may be declined. Want top talent? Visit <b>TalentBridge Staffing</b> in Midtown.</div>` : ''}
        ${candidateTable(list, { bizId: b?.id })}`;
    } else {
      const all = s.businesses.flatMap((x) => x.staff.map((e) => ({ e, b: x })));
      body = all.length ? `<table class="t"><thead><tr><th>Name</th><th>Business</th><th>Role</th><th class="r">Skill</th><th class="r">Morale</th><th class="r">Wage</th></tr></thead><tbody>${all.map(({ e, b: x }) => `<tr data-act="biz" data-arg="${x.id}" style="cursor:pointer"><td><b>${esc(e.name)}</b></td><td>${esc(x.name)}</td><td>${esc(roleDef(x.type, e.role)?.name)}</td><td class="r num">${Math.round(e.skill)}</td><td class="r num ${e.morale < 40 ? 'bad' : ''}">${Math.round(e.morale)}</td><td class="r num">${money(e.wage, { decimals: 2 })}</td></tr>`).join('')}</tbody></table>
        <div class="note" style="margin-top:10px">Total headcount: ${all.length}. Payroll: ${money(all.reduce((a, x) => a + x.e.wage, 0))}/hour.</div>` : '<div class="empty">No employees yet.</div>';
    }
    return `<div class="subtabs"><button class="${tab === 'board' ? 'on' : ''}" data-act="tab" data-arg="board">Job board</button><button class="${tab === 'team' ? 'on' : ''}" data-act="tab" data-arg="team">My team</button></div>${body}`;
  },
  actions: {
    tab: (t) => { ctx.tablet.params.tab = t; ctx.tablet.render(true); },
    type: (v) => { ctx.tablet.params = { type: v, tab: 'board' }; ctx.tablet.render(true); },
    role: (v) => { ctx.tablet.params.role = v; ctx.tablet.render(true); },
    ad: (arg) => { const [t, r] = arg.split('|'); postJobAd(t, r); ctx.tablet.render(); },
    hire: (cid) => {
      const bizId = document.getElementById('hb_' + cid)?.value;
      const w = parseFloat(document.getElementById('hw_' + cid)?.value);
      hire(cid, bizId, Number.isFinite(w) ? w : undefined);
      ctx.tablet.render();
    },
    biz: (id) => ctx.tablet.go('businesses', { id, tab: 'staff' }),
  },
};
