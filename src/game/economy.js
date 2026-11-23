// Macro economy: business cycle, interest rates, inflation, commodities, weather and news.
import { ctx } from '../core/ctx.js';
import { rng, clamp, lerp } from '../core/utils.js';
import { now, message } from './state.js';

const PHASES = {
  expansion: { name: 'Expansion', target: 1.07, rate: 0.045, next: ['peak'], min: 90, max: 220, infl: 0.03 },
  peak: { name: 'Peak', target: 1.12, rate: 0.055, next: ['recession', 'expansion'], min: 30, max: 90, infl: 0.042 },
  recession: { name: 'Recession', target: 0.84, rate: 0.025, next: ['recovery'], min: 60, max: 160, infl: 0.012 },
  recovery: { name: 'Recovery', target: 0.97, rate: 0.03, next: ['expansion'], min: 60, max: 140, infl: 0.022 },
};

export function newEconomy() {
  return {
    phase: 'expansion', phaseDays: 0, phaseLen: 160,
    index: 1.0, confidence: 0.62, baseRate: 0.0425, inflation: 0.028, priceLevel: 1.0, wageLevel: 1.0,
    propertyIndex: 1.0, rentIndex: 1.0, unemployment: 0.046,
    commodity: { coffee: 1, food: 1, fabric: 1, fuel: 1, electronics: 1, pharma: 1 },
    weather: { kind: 'clear', rain: 0, cloud: 0.2, fog: 0, temp: 18, next: 6 * 60 },
    news: [],
    festival: null,
    history: [],
  };
}

export function phaseName() { return PHASES[ctx.state.economy.phase].name; }

export function news(text, kind = 'econ') {
  const e = ctx.state.economy;
  e.news.unshift({ text, kind, day: now().day });
  if (e.news.length > 60) e.news.length = 60;
  ctx.bus.emit('news', text);
}

const SEASON_TEMP = { winter: 4, spring: 15, summer: 27, autumn: 14 };

export function updateWeather(hours) {
  const e = ctx.state.economy;
  const w = e.weather;
  const d = now();
  const t = ctx.state.clock.min;
  if (t >= w.next) {
    const season = d.season;
    const pRain = { winter: 0.3, spring: 0.32, summer: 0.18, autumn: 0.35 }[season];
    const r = rng.next();
    let kind = 'clear';
    if (r < pRain * 0.25) kind = 'storm';
    else if (r < pRain) kind = 'rain';
    else if (r < pRain + 0.22) kind = 'cloudy';
    else if (r < pRain + 0.28 && (d.hour < 10)) kind = 'fog';
    w.kind = kind;
    w.target = { clear: { rain: 0, cloud: 0.15, fog: 0 }, cloudy: { rain: 0, cloud: 0.7, fog: 0 }, rain: { rain: 0.6, cloud: 0.85, fog: 0.1 }, storm: { rain: 1, cloud: 1, fog: 0.2 }, fog: { rain: 0, cloud: 0.4, fog: 0.7 } }[kind];
    w.next = t + rng.int(3, 9) * 60;
    w.temp = SEASON_TEMP[season] + rng.float(-5, 5) + (kind === 'clear' ? 3 : -2);
  }
  if (w.target) {
    const k = 1 - Math.exp(-hours * 0.9);
    w.rain = lerp(w.rain, w.target.rain, k);
    w.cloud = lerp(w.cloud, w.target.cloud, k);
    w.fog = lerp(w.fog, w.target.fog, k);
  }
}

// Demand multiplier from weather for a business type
export function weatherFactor(typeId) {
  const w = ctx.state.economy.weather;
  const indoor = ['gym', 'hotel', 'tech', 'logistics', 'factory', 'pharmacy', 'grocery'].includes(typeId);
  const rainHit = indoor ? 0.08 : 0.32;
  let f = 1 - w.rain * rainHit;
  if (typeId === 'cafe' && w.temp < 10) f *= 1.08;
  if (typeId === 'bar' && w.temp > 22) f *= 1.1;
  return f;
}

export function seasonFactor(typeId) {
  const d = now();
  const m = d.month;
  const table = {
    gym: [1.35, 1.2, 1.05, 1, 1.05, 1.05, 0.9, 0.9, 1, 1, 0.95, 0.85],
    hotel: [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.35, 1.3, 1.1, 1, 0.9, 1.05],
    boutique: [0.85, 0.8, 1, 1, 1.05, 1, 0.95, 1.05, 1.1, 1, 1.25, 1.45],
    bar: [0.85, 0.9, 0.95, 1, 1.05, 1.15, 1.2, 1.2, 1.05, 1, 0.95, 1.15],
    restaurant: [0.9, 0.95, 1, 1, 1.05, 1.05, 1.05, 1.05, 1, 1, 1, 1.15],
    cafe: [1.05, 1.05, 1, 1, 1, 0.95, 0.9, 0.9, 1, 1.05, 1.05, 1.1],
  };
  return table[typeId]?.[m] ?? 1;
}

export function weekdayFactor(typeId) {
  const wd = now().weekday; // 0 Mon .. 6 Sun
  const weekend = wd >= 5;
  if (['tech', 'logistics', 'factory'].includes(typeId)) return weekend ? 0 : 1;
  if (['bar', 'restaurant'].includes(typeId)) return wd === 4 || wd === 5 ? 1.35 : wd === 6 ? 1.05 : 0.9;
  if (typeId === 'cafe') return weekend ? 0.82 : 1.05;
  if (typeId === 'boutique') return weekend ? 1.35 : 0.9;
  if (typeId === 'hotel') return wd >= 4 ? 1.15 : 0.95;
  return weekend ? 1.1 : 1;
}

export function demandFactor(typeId, district) {
  const e = ctx.state.economy;
  const necessity = ['grocery', 'pharmacy'].includes(typeId);
  const cyc = necessity ? lerp(1, e.index, 0.25) : ['hotel', 'bar', 'boutique', 'restaurant'].includes(typeId) ? lerp(1, e.index, 1.4) : e.index;
  let f = cyc * (0.85 + e.confidence * 0.25) * weatherFactor(typeId) * seasonFactor(typeId);
  if (e.festival && e.festival.district === district && now().day <= e.festival.until) f *= 1.45;
  return f;
}

export function dailyEconomy() {
  const s = ctx.state, e = s.economy;
  const P = PHASES[e.phase];
  e.phaseDays++;
  if (e.phaseDays >= e.phaseLen) {
    const nextPhase = rng.pick(P.next);
    e.phase = nextPhase;
    e.phaseDays = 0;
    e.phaseLen = rng.int(PHASES[nextPhase].min, PHASES[nextPhase].max);
    const msgs = {
      expansion: 'Economists declare the economy is firmly in expansion. Consumer spending rising.',
      peak: 'Markets hit record highs as the economy overheats. Central bank signals rate hikes.',
      recession: 'RECESSION: GDP contracts for a second quarter. Layoffs mount, spending falls.',
      recovery: 'Signs of recovery: hiring picks up and consumer confidence improves.',
    };
    news(msgs[nextPhase], 'econ');
    message('Eleanor Vance', `The economy just entered ${PHASES[nextPhase].name}`, nextPhase === 'recession'
      ? 'Brace yourself. Discretionary spending (bars, boutiques, hotels) will drop hardest. Necessity businesses hold up. Keep cash on hand and watch your loan payments. Property prices fall in recessions — a patient buyer can do well.'
      : nextPhase === 'peak' ? 'Things look great, which is exactly when to be careful. Rates are going up. Lock in fixed-rate debt and do not over-expand.'
        : 'Good times for growth. Demand is rising — consider expanding while financing is cheap.');
  }
  const PP = PHASES[e.phase];
  e.index = clamp(e.index + (PP.target - e.index) * 0.02 + rng.normal(0, 0.006), 0.7, 1.3);
  e.confidence = clamp(e.confidence + (e.index - 1) * 0.02 + rng.normal(0, 0.01) + (0.6 - e.confidence) * 0.01, 0.1, 1);
  e.baseRate = clamp(e.baseRate + (PP.rate - e.baseRate) * 0.015, 0.005, 0.09);
  e.inflation = clamp(e.inflation + (PP.infl - e.inflation) * 0.02 + rng.normal(0, 0.0008), -0.01, 0.09);
  e.priceLevel *= 1 + e.inflation / 360;
  e.wageLevel *= 1 + (e.inflation + 0.006) / 360;
  e.propertyIndex = clamp(e.propertyIndex * (1 + ((e.index - 1) * 0.12 + 0.01) / 360 + rng.normal(0, 0.0012)), 0.6, 2);
  e.rentIndex = clamp(e.rentIndex * (1 + ((e.index - 1) * 0.06 + 0.004) / 360), 0.7, 1.8);
  e.unemployment = clamp(e.unemployment + (1 - e.index) * 0.0008 + rng.normal(0, 0.0004), 0.025, 0.12);
  for (const k of Object.keys(e.commodity)) {
    const shock = rng.chance(0.004) ? rng.float(-0.25, 0.35) : 0;
    e.commodity[k] = clamp(e.commodity[k] * (1 + rng.normal(0, 0.012) + shock) + (1 - e.commodity[k]) * 0.01, 0.55, 2.2);
    if (shock > 0.15) news(`${k[0].toUpperCase() + k.slice(1)} prices spike ${Math.round(shock * 100)}% on supply disruption.`, 'commodity');
    if (shock < -0.15) news(`${k[0].toUpperCase() + k.slice(1)} prices tumble ${Math.round(-shock * 100)}% as supply floods the market.`, 'commodity');
  }
  if (!e.festival && rng.chance(0.03)) {
    const ds = ['downtown', 'midtown', 'harbor', 'northside'];
    const district = rng.pick(ds);
    const names = { downtown: 'Meridian Jazz Festival', midtown: 'Midtown Street Fair', harbor: 'Harbor Lights Festival', northside: 'Northside Food Week' };
    e.festival = { district, until: now().day + rng.int(2, 4), name: names[district] };
    news(`${names[district]} kicks off this week — huge crowds expected in ${district}.`, 'event');
  } else if (e.festival && now().day > e.festival.until) e.festival = null;
  e.history.push({ day: now().day, index: e.index, rate: e.baseRate, infl: e.inflation });
  if (e.history.length > 360) e.history.shift();
}

export function fillerNews() {
  const lines = [
    'City council debates new bike lanes on Liberty Ave.',
    'Port Meridian Ports reports record container volume.',
    'Local startup scene booming as Quanta Systems expands.',
    'Harborfront condo prices up for the fifth straight month.',
    'Transit strike averted after late-night negotiations.',
    'Food truck permits to double next year, says City Hall.',
    'Krane Holdings eyes more retail acquisitions.',
    'Meridian Trust Bank reports strong small-business lending.',
    'Tourism up 8% year over year, hotels report.',
    'New minimum wage proposal circulates at City Hall.',
  ];
  news(rng.pick(lines), 'city');
}
