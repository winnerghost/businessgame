// Labour market: candidates, hiring, firing, training, raises, morale and turnover.
import { ctx } from '../core/ctx.js';
import { rng, uid, clamp, money } from '../core/utils.js';
import { BUSINESS_TYPES } from './data/businessTypes.js';
import { FIRST, LAST, TRAITS } from './data/names.js';
import { txn, spend, now, message, toast } from './state.js';

export function roleDef(typeId, roleId) {
  return BUSINESS_TYPES[typeId]?.roles.find((r) => r.id === roleId);
}
export function marketWage(typeId, roleId, skill = 50) {
  const r = roleDef(typeId, roleId);
  const wl = ctx.state.economy?.wageLevel ?? 1;
  return Math.round(r.wage * wl * (0.78 + (skill / 100) * 0.5) * 100) / 100;
}

export function makeCandidate(typeId, roleId, { premium = false } = {}) {
  const skill = premium ? rng.int(64, 96) : clamp(Math.round(rng.normal(48, 16)), 12, 92);
  const traits = [];
  const nT = rng.chance(0.55) ? 1 : rng.chance(0.3) ? 2 : 0;
  while (traits.length < nT) {
    const t = rng.pick(TRAITS);
    if (premium && !t.good && rng.chance(0.7)) continue;
    if (!traits.includes(t.id)) traits.push(t.id);
  }
  const base = marketWage(typeId, roleId, skill);
  const ask = Math.round(base * rng.float(0.92, 1.12) * (traits.includes('hustler') ? 1.08 : 1) * 100) / 100;
  return {
    id: uid('c'), name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, typeId, role: roleId, skill, ask, traits,
    exp: Math.max(0, Math.round((skill - 20) / 8 + rng.float(-1, 2))), age: rng.int(19, 58), premium, posted: now().day,
  };
}

// Job board: keep a pool of candidates for every role of every business type the player runs (plus a few generic)
export function refreshCandidates(force = false) {
  const s = ctx.state;
  const d = now().day;
  s.candidates = s.candidates.filter((c) => d - c.posted < (c.premium ? 6 : 9));
  const types = new Set(s.businesses.map((b) => b.type));
  if (!types.size) types.add('cafe');
  for (const t of types) {
    for (const r of BUSINESS_TYPES[t].roles) {
      const have = s.candidates.filter((c) => c.typeId === t && c.role === r.id && !c.premium).length;
      const want = force ? 4 : 3;
      for (let i = have; i < want; i++) if (force || rng.chance(0.5)) s.candidates.push(makeCandidate(t, r.id));
    }
  }
  if (s.candidates.length > 140) s.candidates.splice(0, s.candidates.length - 140);
  ctx.bus.emit('candidates');
}

export function postJobAd(typeId, roleId) {
  const cost = 350;
  if (!spend(cost, 'training', `Job ad: ${roleDef(typeId, roleId).name}`)) return false;
  const n = rng.int(4, 6);
  for (let i = 0; i < n; i++) ctx.state.candidates.push(makeCandidate(typeId, roleId));
  toast('Job ad posted', `${n} new applicants for ${roleDef(typeId, roleId).name}.`, 'good');
  ctx.bus.emit('candidates');
  return true;
}

export function headhunt(typeId, roleId) {
  const n = 3;
  const list = [];
  for (let i = 0; i < n; i++) {
    const c = makeCandidate(typeId, roleId, { premium: true });
    ctx.state.candidates.push(c);
    list.push(c);
  }
  ctx.bus.emit('candidates');
  return list;
}

export function placementFee(c) {
  return c.premium ? Math.round(c.ask * 2080 * 0.15) : 0;
}

export function hire(candidateId, bizId, wage) {
  const s = ctx.state;
  const c = s.candidates.find((x) => x.id === candidateId);
  const b = s.businesses.find((x) => x.id === bizId);
  if (!c || !b) return false;
  const def = roleDef(b.type, c.role);
  if (!def) { toast('Wrong role', 'This candidate does not fit that business.', 'bad'); return false; }
  if (def.max && b.staff.filter((e) => e.role === c.role).length >= def.max) { toast('Position filled', `Only ${def.max} ${def.name} allowed.`, 'bad'); return false; }
  const fee = placementFee(c);
  if (fee && !spend(fee, 'training', `TalentBridge placement fee: ${c.name}`, b.id)) return false;
  const w = wage ?? c.ask;
  // low offers may be refused
  if (w < c.ask * 0.9) {
    const acceptP = clamp((w / c.ask - 0.75) / 0.15, 0, 1) * 0.8;
    if (!rng.chance(acceptP)) {
      toast('Offer declined', `${c.name} turned down ${money(w, { decimals: 2 })}/hr.`, 'warn');
      s.candidates = s.candidates.filter((x) => x !== c);
      ctx.bus.emit('candidates');
      return false;
    }
  }
  b.staff.push({
    id: uid('e'), name: c.name, role: c.role, skill: c.skill, wage: w, morale: clamp(62 + (w / c.ask - 1) * 120, 40, 95),
    traits: c.traits, hired: now().day, training: 0, exp: c.exp, age: c.age, lastRaise: now().day,
  });
  s.candidates = s.candidates.filter((x) => x !== c);
  s.stats.hires++;
  ctx.bus.emit('staff', b.id);
  toast('Hired', `${c.name} joins ${b.name} as ${def.name}.`, 'good');
  ctx.audio?.play('confirm');
  return true;
}

export function fire(bizId, empId) {
  const b = ctx.state.businesses.find((x) => x.id === bizId);
  if (!b) return;
  const e = b.staff.find((x) => x.id === empId);
  if (!e) return;
  const severance = Math.round(e.wage * 40 * Math.min(4, Math.max(1, (now().day - e.hired) / 90)));
  txn(-severance, 'wages', `Severance: ${e.name}`, b.id);
  b.staff = b.staff.filter((x) => x !== e);
  for (const o of b.staff) o.morale = clamp(o.morale - 4, 0, 100);
  toast('Employee let go', `${e.name} received ${money(severance)} severance. Team morale dipped.`, 'warn');
  ctx.bus.emit('staff', b.id);
}

export function giveRaise(bizId, empId, pctRaise) {
  const b = ctx.state.businesses.find((x) => x.id === bizId);
  const e = b?.staff.find((x) => x.id === empId);
  if (!e) return;
  e.wage = Math.round(e.wage * (1 + pctRaise) * 100) / 100;
  e.morale = clamp(e.morale + pctRaise * 160, 0, 100);
  e.lastRaise = now().day;
  toast('Raise given', `${e.name} now earns ${money(e.wage, { decimals: 2 })}/hr.`, 'good');
  ctx.bus.emit('staff', b.id);
}

export function trainingCost(e) { return Math.round(600 + e.wage * 30); }
export function train(bizId, empId) {
  const b = ctx.state.businesses.find((x) => x.id === bizId);
  const e = b?.staff.find((x) => x.id === empId);
  if (!e) return;
  if (e.training >= 3) { toast('Fully trained', `${e.name} has completed all training levels.`, 'info'); return; }
  if (!spend(trainingCost(e), 'training', `Training course: ${e.name}`, b.id)) return;
  e.training++;
  e.skill = clamp(e.skill + 9 - e.training, 0, 100);
  e.morale = clamp(e.morale + 6, 0, 100);
  toast('Training complete', `${e.name}'s skill rose to ${Math.round(e.skill)}.`, 'good');
  ctx.bus.emit('staff', b.id);
}

export function productivity(e) {
  let p = (0.55 + (e.skill / 100) * 0.75) * (0.62 + (e.morale / 100) * 0.45);
  if (e.traits.includes('hustler')) p *= 1.1;
  if (e.traits.includes('lazy')) p *= 0.88;
  return p;
}

// Daily morale/skill dynamics. util = how stretched the team was (served/capacity)
export function dailyStaff(b, util) {
  const hasManager = b.staff.some((e) => roleDef(b.type, e.role)?.manager);
  const leaders = b.staff.filter((e) => e.traits.includes('leader')).length;
  const quits = [];
  for (const e of b.staff) {
    const fair = marketWage(b.type, e.role, e.skill);
    let target = 62 + (e.wage / fair - 1) * 110 + (hasManager ? 8 : -4) + leaders * 4 - Math.max(0, util - 0.95) * 70 + (b.upgrades?.renovation || 0) * 2;
    if (e.traits.includes('reliable')) target += 5;
    if (now().day - e.lastRaise > 240) target -= 8;
    const rate = e.traits.includes('flaky') ? 0.2 : 0.08;
    e.morale = clamp(e.morale + (target - e.morale) * rate + rng.normal(0, e.traits.includes('flaky') ? 4 : 1.2), 0, 100);
    const learn = (e.traits.includes('fast') ? 0.09 : 0.055) * (1 - e.skill / 110);
    e.skill = clamp(e.skill + learn, 0, 100);
    const quitP = e.morale < 30 ? 0.06 : e.morale < 45 ? 0.012 : 0.0015;
    if (rng.chance(quitP * (e.traits.includes('reliable') ? 0.5 : 1))) quits.push(e);
  }
  for (const e of quits) {
    b.staff = b.staff.filter((x) => x !== e);
    message(e.name, `Resignation — ${b.name}`, `I've decided to move on from my role as ${roleDef(b.type, e.role).name}. ${e.morale < 35 ? 'Honestly, I have felt undervalued here for a while.' : 'I got an offer I could not refuse.'}`, { biz: b.id });
    toast('Employee quit', `${e.name} resigned from ${b.name}.`, 'bad');
  }
}
