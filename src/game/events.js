// Random operational events: inspections, breakdowns, theft, viral moments, poaching, lawsuits, catering orders.
import { ctx } from '../core/ctx.js';
import { rng, clamp, money } from '../core/utils.js';
import { DISTRICTS } from './data/districts.js';
import { txn, now, message, toast } from './state.js';
import { typeDef, avgMorale, priceLevel } from './business.js';
import { roleDef } from './staff.js';

const FOOD = ['cafe', 'bakery', 'restaurant', 'bar', 'grocery', 'hotel'];

export function choice(opts) { ctx.bus.emit('choice', opts); }

export function dailyEvents(b) {
  if (b.status !== 'open') return;
  const T = typeDef(b);
  const s = ctx.state;
  const pl = priceLevel();
  const hasMgr = b.staff.some((e) => roleDef(b.type, e.role)?.manager);
  const minute = s.clock.min;
  const daysOpen = now().day - (b.opened || now().day);

  // Health inspection
  if (FOOD.includes(b.type) && rng.chance(daysOpen < 3 ? 0 : 1 / 24)) {
    const score = b.quality * 0.45 + avgMorale(b) * 0.2 + (hasMgr ? 18 : 0) + Math.min(15, b.staff.length * 3) + rng.normal(0, 8);
    if (score < 52) {
      const fine = Math.round(rng.float(1500, 6000) * pl);
      txn(-fine, 'fines', `Health code violations: ${b.name}`, b.id);
      b.closedUntil = minute + 24 * 60;
      b.reputation = clamp(b.reputation - 7, 0, 100);
      message('Dept. of Public Health', `${b.name} FAILED inspection`, `Inspectors found violations (score ${Math.round(score)}/100). You were fined ${money(fine)} and must close for 24 hours. Tip: a manager, higher-quality equipment and a well-staffed, happy team all improve inspection results.`, { biz: b.id });
      toast('Failed health inspection', `${b.name} closed for 24h, fined ${money(fine)}.`, 'bad');
    } else {
      b.reputation = clamp(b.reputation + (score > 75 ? 2 : 0.5), 0, 100);
      message('Dept. of Public Health', `${b.name} passed inspection`, `Inspection score ${Math.round(Math.min(100, score))}/100. ${score > 75 ? 'Grade A posted in your window — customers noticed.' : 'Passed with minor notes.'}`, { biz: b.id });
    }
  }
  // Equipment breakdown
  const tierRisk = [1 / 35, 1 / 70, 1 / 140][b.tier] ?? 1 / 70;
  if (rng.chance(tierRisk) && minute > b.breakdownUntil) {
    const cost = Math.round(rng.float(900, 5200) * pl * (T.model === 'hotel' || T.model === 'factory' ? 4 : 1));
    choice({
      title: `Equipment failure at ${b.name}`, biz: b.id, icon: '🔧',
      text: `A critical piece of equipment broke down. Capacity is halved until it's fixed.`,
      options: [
        { label: `Emergency repair (${money(cost)}) — fixed in 2 hours`, fn: () => { txn(-cost, 'maintenance', `Emergency repair: ${b.name}`, b.id); b.breakdownUntil = ctx.state.clock.min + 120; } },
        { label: `Standard service (${money(cost * 0.55)}) — 2 days at half capacity`, fn: () => { txn(-cost * 0.55, 'maintenance', `Repair: ${b.name}`, b.id); b.breakdownUntil = ctx.state.clock.min + 2 * 1440; } },
      ],
    });
  }
  // Viral moment
  if (rng.chance(1 / 160) && b.reputation > 55) {
    b.awareness = clamp(b.awareness + 0.14, 0, 0.98);
    b.reputation = clamp(b.reputation + 3, 0, 100);
    toast('Gone viral!', `A post about ${b.name} blew up on social media.`, 'good');
    message('Social Media Monitor', `${b.name} is trending`, 'A customer\'s video racked up 800k views overnight. Expect a surge of new customers.', { biz: b.id });
  }
  // Burglary
  const crime = DISTRICTS[b.district].crime;
  if (rng.chance((crime / 90) * (b.upgrades.security ? 0.2 : 1))) {
    const loss = Math.round(rng.float(600, 4200) * pl);
    txn(-loss, 'fines', `Burglary losses: ${b.name}`, b.id);
    if (T.model === 'retail') for (const k of Object.keys(b.stock)) b.stock[k] = Math.floor(b.stock[k] * 0.85);
    message('Port Meridian Police', `Break-in at ${b.name}`, `Thieves broke in overnight. Losses and damage: ${money(loss)}. ${b.upgrades.security ? '' : 'A security system would cut this risk by 80%.'}`, { biz: b.id });
    toast('Break-in', `${b.name} lost ${money(loss)}.`, 'bad');
  }
  // Staff poaching
  const star = b.staff.filter((e) => e.skill > 68).sort((x, y) => y.skill - x.skill)[0];
  if (star && rng.chance(1 / 75)) {
    const raise = Math.round(star.wage * 0.18 * 100) / 100;
    choice({
      title: 'Poaching attempt', biz: b.id, icon: '🎯',
      text: `${star.name}, your best ${roleDef(b.type, star.role).name} (skill ${Math.round(star.skill)}), has an offer from a competitor paying ${money(star.wage + raise, { decimals: 2 })}/hr.`,
      options: [
        { label: `Match the offer (+${money(raise, { decimals: 2 })}/hr)`, fn: () => { star.wage += raise; star.morale = clamp(star.morale + 15, 0, 100); star.lastRaise = now().day; } },
        { label: 'Let them go', fn: () => { b.staff = b.staff.filter((e) => e !== star); for (const e of b.staff) e.morale -= 3; toast('Employee left', `${star.name} joined a competitor.`, 'warn'); } },
      ],
    });
  }
  // Celebrity / critic
  if (['cafe', 'restaurant', 'bar', 'boutique', 'hotel', 'bakery'].includes(b.type) && rng.chance(1 / 220)) {
    const good = b.quality > 62 && b.satisfaction > 62;
    b.reputation = clamp(b.reputation + (good ? 6 : -6), 0, 100);
    b.awareness = clamp(b.awareness + 0.06, 0, 0.98);
    message('Port Meridian Times', good ? `Rave review for ${b.name}` : `Harsh review for ${b.name}`, good ? 'Our critic called it "a new benchmark for the city". Reservations are surging.' : 'Our critic was unimpressed: "inconsistent, overpriced and understaffed."', { biz: b.id });
  }
  // Slip and fall
  if (T.model === 'retail' && rng.chance(1 / 420)) {
    const claim = Math.round(rng.float(9000, 48000) * pl);
    const deductible = Math.round(2500 * pl);
    txn(-deductible, 'fines', `Liability claim deductible: ${b.name}`, b.id);
    message('Halcyon Insurance', 'Liability claim settled', `A customer injury claim of ${money(claim)} was settled. Your insurance covered it; you paid the ${money(deductible)} deductible.${ctx.state.company?.entity === 'sole' ? ' As a sole proprietor, anything beyond policy limits could have reached your personal assets.' : ''}`, { biz: b.id });
  }
  // Catering / bulk order opportunity -> optional delivery job
  if (['cafe', 'bakery', 'restaurant'].includes(b.type) && rng.chance(1 / 30)) {
    const value = Math.round(rng.float(900, 3800) * pl);
    const client = rng.pick(['Halcyon Insurance', 'Bayview Medical', 'Cobalt Bank', 'Meridian University', 'Lumen Energy', 'Sable Media']);
    choice({
      title: 'Catering order request', biz: b.id, icon: '📦',
      text: `${client} wants a catering order from ${b.name} worth ${money(value)}. They need it delivered across town.`,
      options: [
        { label: `Deliver it yourself (+25% tip on time)`, fn: () => ctx.bus.emit('startBizDelivery', { b, value, client }) },
        { label: `Use a courier service (−15% fee)`, fn: () => { txn(value * 0.85, 'revenue', `Catering order: ${client}`, b.id); b.reputation = clamp(b.reputation + 1, 0, 100); } },
        { label: 'Decline', fn: () => {} },
      ],
    });
  }
  // Power outage
  if (rng.chance(1 / 260)) {
    b.closedUntil = Math.max(b.closedUntil, minute + 4 * 60);
    toast('Power outage', `${b.name} is closed for ~4 hours.`, 'warn');
  }
}
