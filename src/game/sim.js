// Game clock and simulation orchestration (hourly / daily / monthly ticks), new game setup.
import { ctx } from '../core/ctx.js';
import { clamp } from '../core/utils.js';
import { newState, dateOf, now, emptyPL, plSummary, message } from './state.js';
import { newEconomy, dailyEconomy, updateWeather, fillerNews } from './economy.js';
import { refreshListings, dailyProperties } from './properties.js';
import { refreshCandidates } from './staff.js';
import { simHour, simDay } from './business.js';
import { dailyFinance, monthlyClose, netWorth } from './finance.js';
import { newMarket, hourlyMarket, dailyMarket } from './stocks.js';
import { seedCompetitors, dailyCompetitors } from './competitors.js';
import { dailyEvents } from './events.js';
import { startMissions, refreshTenders, dailyTender } from './missions.js';
import { processPermits } from './government.js';

export const SPEEDS = [0, 1, 2, 5, 10, 30];
export const MIN_PER_SEC = 2; // game minutes per real second at 1x

export function newGame(seed = 20261123) {
  const s = newState(seed);
  ctx.state = s;
  s.economy = newEconomy();
  s.stocks = newMarket();
  seedCompetitors();
  refreshListings(true);
  refreshCandidates(true);
  refreshTenders();
  const L = ctx.layout;
  const home = L.buildingById[L.landmarks.home.buildingId];
  s.player.x = home.door.x; s.player.z = home.door.z + 0.6; s.player.yaw = Math.PI;
  s.car.x = home.door.x + 5; s.car.z = home.door.z - 8.6; s.car.yaw = Math.PI / 2;
  startMissions();
  message('Eleanor Vance', 'Welcome to Port Meridian', `I'm Eleanor — I built and sold three companies in this city, and your aunt asked me to keep an eye on you.\n\nYou have $25,000 in savings, a beat-up hatchback and an apartment in Northside. That's more than I started with.\n\nPress TAB to open your tablet: it runs your whole operation — businesses, staff, finances, property, the stock market and your missions. Press M for the city map.\n\nYour first job is simple: earn some cash. The courier depot at the harbor always needs drivers.`);
  return s;
}

let carry = 0;
export function advance(dtReal) {
  const s = ctx.state;
  if (!s || ctx.paused) return;
  const speed = SPEEDS[s.speed] ?? 1;
  if (!speed) return;
  let minutes = dtReal * MIN_PER_SEC * speed + carry;
  carry = 0;
  // process in 1-minute-or-less steps so hour/day boundaries are never skipped
  while (minutes > 0) {
    const step = Math.min(minutes, 60 - (s.clock.min % 60) || 60);
    const before = s.clock.min;
    s.clock.min += step;
    minutes -= step;
    if (Math.floor(before / 60) !== Math.floor(s.clock.min / 60)) onHour();
  }
  updateWeather((dtReal * MIN_PER_SEC * speed) / 60);
}

export function skipTo(targetMin) {
  const s = ctx.state;
  while (s.clock.min < targetMin) {
    const step = Math.min(targetMin - s.clock.min, 60 - (s.clock.min % 60) || 60);
    const before = s.clock.min;
    s.clock.min += step;
    if (Math.floor(before / 60) !== Math.floor(s.clock.min / 60)) onHour();
    updateWeather(step / 60);
  }
}

function onHour() {
  const s = ctx.state;
  const d = dateOf(s.clock.min);
  const hour = d.hour; // the hour that just began
  const prevHour = (hour + 23) % 24;
  for (const b of [...s.businesses]) {
    try { simHour(b, prevHour); } catch (e) { console.error('simHour', b.name, e); }
  }
  hourlyMarket();
  processPermits();
  if (hour === 0) onDay(d);
  ctx.bus.emit('hour', hour);
}

function onDay(d) {
  const s = ctx.state;
  // close the previous day
  for (const b of [...s.businesses]) {
    try { simDay(b); dailyEvents(b); } catch (e) { console.error('simDay', b.name, e); }
  }
  dailyTender();
  const pl = plSummary(s.today);
  s.daily.push({ day: d.day - 1, income: pl.income, net: pl.net, cash: s.cash, nw: 0 });
  if (s.daily.length > 365) s.daily.shift();
  s.today = emptyPL();
  dailyEconomy();
  dailyProperties();
  dailyFinance();
  dailyCompetitors();
  dailyMarket();
  refreshCandidates();
  if (d.day % 3 === 0) refreshTenders();
  if (Math.random() < 0.5) fillerNews();
  if (d.dom === 1) monthlyClose();
  const nw = netWorth();
  s.daily[s.daily.length - 1].nw = nw;
  s.netWorthHist.push({ day: d.day, nw });
  if (s.netWorthHist.length > 365) s.netWorthHist.shift();
  s.stats.peakNetWorth = Math.max(s.stats.peakNetWorth, nw);
  s.stats.daysPlayed++;
  ctx.bus.emit('day', d.day);
}

export function setSpeed(i) {
  const s = ctx.state;
  s.speed = clamp(i, 0, SPEEDS.length - 1);
  ctx.bus.emit('speed', s.speed);
}

export function sleepUntilMorning() {
  const s = ctx.state;
  const d = now();
  const target = (d.hour >= 7 ? d.day : d.day - 1) * 1440 + 7 * 60;
  skipTo(target);
  ctx.bus.emit('slept');
}
