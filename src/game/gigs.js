// Drivable delivery jobs: courier gigs from SwiftRoute, your own catering runs, and supply runs.
import { ctx } from '../core/ctx.js';
import { rng, uid, money, clamp } from '../core/utils.js';
import { txn, toast, message } from './state.js';

function randomDoor(exclude = null, minDist = 250, from = null) {
  const L = ctx.layout;
  for (let i = 0; i < 200; i++) {
    const b = rng.pick(L.buildings);
    if (b.landmark || b === exclude) continue;
    if (from && Math.hypot(b.door.x - from.x, b.door.z - from.z) < minDist) continue;
    return { x: b.door.x, z: b.door.z, name: b.address };
  }
  const b = L.buildings[0];
  return { x: b.door.x, z: b.door.z, name: b.address };
}

const CARGO = [
  { name: 'Legal documents', fragile: false, mult: 1.0 }, { name: 'Restaurant supplies', fragile: false, mult: 1.1 },
  { name: 'Wedding cake', fragile: true, mult: 1.6 }, { name: 'Laptop shipment', fragile: true, mult: 1.45 },
  { name: 'Pharmacy order', fragile: false, mult: 1.2 }, { name: 'Flower arrangements', fragile: true, mult: 1.35 },
  { name: 'Server hardware', fragile: true, mult: 1.7 }, { name: 'Office furniture', fragile: false, mult: 1.3, van: true },
  { name: 'Retail stock pallets', fragile: false, mult: 1.6, van: true }, { name: 'Art gallery piece', fragile: true, mult: 2.2, van: true },
];

export function gigOffers() {
  const depot = ctx.layout.buildingById[ctx.layout.landmarks.depot.buildingId];
  const offers = [];
  for (let i = 0; i < 4; i++) {
    const cargo = rng.pick(CARGO);
    const pickup = i === 0 ? { x: depot.door.x, z: depot.door.z, name: 'SwiftRoute Depot' } : randomDoor(null, 0);
    const drop = randomDoor(null, 280, pickup);
    const dist = Math.hypot(pickup.x - drop.x, pickup.z - drop.z) * 1.3;
    const time = Math.round(dist / 11 + 40);
    const pay = Math.round((90 + dist * 0.42) * cargo.mult * (ctx.state.economy?.priceLevel ?? 1) / 5) * 5;
    offers.push({ id: uid('gig'), kind: 'courier', cargo: cargo.name, fragile: cargo.fragile, van: !!cargo.van, pickup, drop, dist, time, pay });
  }
  return offers;
}

export function startGig(g) {
  const s = ctx.state;
  if (s.gig) { toast('Already on a job', 'Finish or cancel your current delivery first.', 'warn'); return false; }
  if (g.van && !['hauler', 'atlas'].includes(s.car.id)) { toast('Bigger vehicle needed', 'This cargo needs a van or SUV (Meridian Motors).', 'warn'); return false; }
  s.gig = { ...g, stage: 'pickup', timeLeft: null, damage: 0, started: s.clock.min };
  ctx.bus.emit('gig', s.gig);
  toast('Job accepted', `Pick up ${g.cargo} at ${g.pickup.name}.`, 'info');
  return true;
}

export function cancelGig() {
  const s = ctx.state;
  if (!s.gig) return;
  if (s.gig.kind === 'business') {
    const b = s.businesses.find((x) => x.id === s.gig.bizId);
    if (b) b.reputation = clamp(b.reputation - 4, 0, 100);
  }
  toast('Delivery cancelled', s.gig.stage === 'drop' ? 'The client was not pleased.' : '', 'warn');
  s.gig = null;
  ctx.bus.emit('gig', null);
}

// called every frame with the player's (vehicle) position
export function updateGig(dt, pos, inCar) {
  const g = ctx.state.gig;
  if (!g) return;
  const target = g.stage === 'pickup' ? g.pickup : g.drop;
  const d = Math.hypot(pos.x - target.x, pos.z - target.z);
  if (g.stage === 'drop' && g.timeLeft !== null) {
    g.timeLeft -= dt;
    if (g.timeLeft <= 0 && !g.lateWarned) { g.lateWarned = true; toast('Running late', 'Pay will be reduced for late delivery.', 'warn'); }
  }
  if (d < 6.5) {
    if (!inCar) { if (!g._footWarn) { g._footWarn = true; toast('Bring your vehicle', 'Deliveries must be made by vehicle.', 'info'); } return; }
    if (g.stage === 'pickup') {
      g.stage = 'drop';
      g.timeLeft = g.time;
      toast('Cargo loaded', `Deliver ${g.cargo} to ${g.drop.name} within ${Math.round(g.time)}s.${g.fragile ? ' FRAGILE — drive carefully!' : ''}`, 'info');
      ctx.audio?.play('confirm');
      ctx.bus.emit('gig', g);
    } else {
      completeGig(g);
    }
  }
}

function completeGig(g) {
  const s = ctx.state;
  const late = g.timeLeft < 0;
  let pay = g.pay;
  if (late) pay *= clamp(1 + g.timeLeft / g.time, 0.35, 1);
  if (g.fragile) pay *= clamp(1 - g.damage, 0.2, 1);
  const bonus = !late && g.timeLeft > g.time * 0.35 ? Math.round(pay * 0.15) : 0;
  pay = Math.round(pay + bonus);
  if (g.kind === 'business') {
    const b = s.businesses.find((x) => x.id === g.bizId);
    txn(pay, 'revenue', `Catering delivery: ${g.client}`, b?.id);
    if (b) b.reputation = clamp(b.reputation + (late ? -1 : 3), 0, 100);
  } else if (g.kind === 'mission') {
    s.missions.flags[g.flag] = true;
    if (pay) txn(pay, 'grant', g.cargo);
  } else {
    txn(pay, 'gig', `SwiftRoute delivery: ${g.cargo}`);
    s.stats.deliveries++;
    s.missions.counters.deliveries = (s.missions.counters.deliveries || 0) + 1;
  }
  toast(late ? 'Delivered (late)' : 'Delivered!', `${money(pay)}${bonus ? ` incl. ${money(bonus)} speed bonus` : ''}${g.fragile && g.damage > 0.05 ? ` — cargo ${Math.round(g.damage * 100)}% damaged` : ''}`, late ? 'warn' : 'good');
  ctx.audio?.play('cash');
  s.gig = null;
  ctx.bus.emit('gig', null);
  ctx.bus.emit('gigDone', g);
}

export function gigImpact(force) {
  const g = ctx.state.gig;
  if (!g || g.stage !== 'drop' || !g.fragile) return;
  g.damage = clamp(g.damage + force / 60, 0, 1);
  toast('Cargo damaged!', `${Math.round(g.damage * 100)}% damage`, 'bad');
}

export function startBizDelivery({ b, value, client }) {
  const s = ctx.state;
  if (s.gig) { txn(value * 0.85, 'revenue', `Catering order via courier: ${client}`, b.id); toast('Busy', 'You were already on a job — sent it with a courier instead.', 'info'); return; }
  const bld = ctx.layout.buildingById[b.bId];
  const pickup = { x: bld.door.x, z: bld.door.z, name: b.name };
  const drop = randomDoor(null, 250, pickup);
  const dist = Math.hypot(pickup.x - drop.x, pickup.z - drop.z) * 1.3;
  s.gig = { id: uid('gig'), kind: 'business', bizId: b.id, client, cargo: `Catering for ${client}`, fragile: true, pickup, drop, dist, time: Math.round(dist / 10 + 50), pay: Math.round(value * 1.25), stage: 'pickup', timeLeft: null, damage: 0 };
  ctx.bus.emit('gig', s.gig);
  message(b.name, 'Catering order ready for pickup', `Swing by ${b.name} to collect the order for ${client}, then deliver it to ${drop.name}.`, { biz: b.id });
}

export function startMissionDrive(flag, from, to, cargo, time, pay = 0) {
  const s = ctx.state;
  s.gig = { id: uid('gig'), kind: 'mission', flag, cargo, fragile: false, pickup: from, drop: to, dist: Math.hypot(from.x - to.x, from.z - to.z), time, pay, stage: 'pickup', timeLeft: null, damage: 0 };
  ctx.bus.emit('gig', s.gig);
}
