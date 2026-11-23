// In-world HUD: clock & speed, money, mission tracker, prompts, minimap, speedometer, gig timer, news ticker.
import { ctx } from '../core/ctx.js';
import { money, escapeHtml } from '../core/utils.js';
import { now, fmtTime, MONTHS, WEEKDAYS, plSummary } from '../game/state.js';
import { SPEEDS, setSpeed } from '../game/sim.js';
import { netWorth } from '../game/finance.js';
import { currentMission, objectiveStates, missionTarget } from '../game/missions.js';
import { districtAt } from '../world/layout.js';
import { DISTRICTS } from '../game/data/districts.js';
import { Minimap } from './minimap.js';
import { bind } from './dom.js';

const WX = { clear: '☀️', cloudy: '⛅', rain: '🌧️', storm: '⛈️', fog: '🌫️' };

export class HUD {
  constructor() {
    const root = (this.root = document.getElementById('hud'));
    root.innerHTML = `
      <div class="hud-time glass">
        <div><div class="clock num" id="h-clock">8:00 AM</div><div class="date" id="h-date"></div></div>
        <div class="wx" id="h-wx"></div>
        <div class="speed" id="h-speed">${SPEEDS.map((s, i) => `<button data-act="speed" data-arg="${i}" title="${i === 0 ? 'Pause' : s + '× speed'}">${i === 0 ? '❚❚' : s + '×'}</button>`).join('')}</div>
      </div>
      <div class="hud-money glass">
        <div class="cash num" id="h-cash">$0</div>
        <div class="delta num" id="h-delta"></div>
        <div class="nw">Net worth <span class="num" id="h-nw"></span></div>
        <div class="hud-company" id="h-company"></div>
      </div>
      <div class="hud-mission glass" id="h-mission"></div>
      <div class="hud-gig glass hidden" id="h-gig"></div>
      <div class="prompt glass hidden" id="h-prompt"></div>
      <div class="mm-label" id="h-district"></div>
      <div class="minimap"><canvas id="h-minimap"></canvas></div>
      <div class="speedo hidden" id="h-speedo"><div class="v num" id="h-kmh">0</div><div class="u">KM/H</div></div>
      <div class="ticker"><div class="tape" id="h-tape"></div></div>
      <div class="hud-help" id="h-help">
        <span class="key">WASD</span>move <span class="key">Shift</span>run <span class="key">Space</span>jump/handbrake <span class="key">F</span>enter/exit car <span class="key">E</span>interact<br>
        <span class="key">Tab</span>tablet <span class="key">M</span>map <span class="key">Click</span>mouse-look <span class="key">H</span>hide help <span class="key">Esc</span>menu
      </div>
      <div class="fps hidden" id="h-fps"></div>
      <div id="fade"></div>`;
    this.el = {};
    for (const id of ['clock', 'date', 'wx', 'speed', 'cash', 'delta', 'nw', 'company', 'mission', 'gig', 'prompt', 'district', 'speedo', 'kmh', 'tape', 'help', 'fps']) this.el[id] = document.getElementById('h-' + id);
    this.minimap = new Minimap(document.getElementById('h-minimap'));
    bind(root, { speed: (i) => setSpeed(+i) });
    this.timer = 0;
    this.lastCash = null;
    this.deltaTimer = 0;
    this.news = [];
    this.missionKey = '';
    ctx.bus.on('news', () => this.renderTicker());
    ctx.bus.on('cash', (amt, cat) => this.onCash(amt, cat));
    this.fpsAcc = 0; this.fpsN = 0;
  }

  onCash(amt) {
    if (Math.abs(amt) < 50) return;
    this.flash = { amt: (this.flash?.amt || 0) + amt, t: 2.5 };
  }

  renderTicker() {
    const e = ctx.state?.economy;
    if (!e) return;
    const items = e.news.slice(0, 10).map((n) => `<span><b>${n.kind === 'market' ? 'MARKETS' : n.kind === 'econ' ? 'ECONOMY' : n.kind === 'business' ? 'BUSINESS' : n.kind === 'commodity' ? 'COMMODITIES' : n.kind === 'event' ? 'EVENTS' : 'CITY'}</b>${escapeHtml(n.text)}</span>`);
    const st = ctx.state.stocks;
    if (st) items.push(`<span><b>PMX</b>${st.list.slice(0, 8).map((s) => `${s.sym} ${s.price.toFixed(2)} <span class="${s.price >= s.open ? 'good' : 'bad'}">${s.price >= s.open ? '▲' : '▼'}${Math.abs(((s.price - s.open) / s.open) * 100).toFixed(1)}%</span>`).join(' · ')}</span>`);
    this.el.tape.innerHTML = items.join('');
  }

  setPrompt(text) {
    if (!text) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.classList.remove('hidden');
    if (this.el.prompt._t !== text) { this.el.prompt.innerHTML = text; this.el.prompt._t = text; }
  }

  update(dt) {
    const s = ctx.state;
    if (!s) return;
    this.fpsAcc += dt; this.fpsN++;
    // minimap every frame-ish
    const p = ctx.player.inCar ? ctx.vehicle.pos : ctx.player.pos;
    const targets = this.mapTargets();
    targets.heading = ctx.player.inCar ? ctx.vehicle.yaw : ctx.player.yaw;
    this.minimap.update(dt, p, ctx.camRig.yaw, targets);
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const d = now();
    this.el.clock.textContent = fmtTime(s.clock.min);
    this.el.date.textContent = `${WEEKDAYS[d.weekday]} ${MONTHS[d.month]} ${d.dom}, ${d.year} · Day ${d.day}`;
    const w = s.economy.weather;
    this.el.wx.innerHTML = `${WX[w.kind] || ''} ${Math.round(w.temp)}°C`;
    [...this.el.speed.children].forEach((b, i) => b.classList.toggle('on', i === s.speed));
    this.el.cash.textContent = money(s.cash);
    this.el.cash.style.color = s.cash < 0 ? 'var(--bad)' : '';
    const today = plSummary(s.today).net;
    this.el.delta.innerHTML = this.flash ? `<span class="${this.flash.amt >= 0 ? 'good' : 'bad'}">${money(this.flash.amt, { sign: true })}</span>` : `<span class="${today >= 0 ? 'good' : 'bad'}" title="Today's profit">${money(today, { sign: true })} today</span>`;
    this.el.nw.textContent = money(netWorth(), { compact: true });
    this.el.company.textContent = s.company ? `${s.company.name} · ${s.businesses.length} business${s.businesses.length === 1 ? '' : 'es'}` : 'No company registered';
    const dist = districtAt(p.x, p.z);
    this.el.district.textContent = DISTRICTS[dist]?.name || '';
    // speedo
    this.el.speedo.classList.toggle('hidden', !ctx.player.inCar);
    if (ctx.player.inCar) this.el.kmh.textContent = Math.round(ctx.vehicle.kmh);
    this.renderMission();
    this.renderGig();
    if (!this.el.tape.innerHTML) this.renderTicker();
    if (ctx.settings?.showFps) { this.el.fps.classList.remove('hidden'); this.el.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps`; this.fpsAcc = 0; this.fpsN = 0; } else this.el.fps.classList.add('hidden');
  }

  renderMission() {
    const m = currentMission();
    if (!m) { this.el.mission.classList.add('hidden'); return; }
    this.el.mission.classList.remove('hidden');
    const os = objectiveStates(m);
    const key = m.id + os.map((o) => (o.ok ? 1 : 0) + (o.progressText || '')).join('|');
    if (key === this.missionKey) return;
    this.missionKey = key;
    this.el.mission.innerHTML = `<h4>Mission</h4><div class="mt">${escapeHtml(m.title)}</div>${os.map((o) => `<div class="obj ${o.ok ? 'done' : ''}"><span class="tick"></span><span>${escapeHtml(o.text)}${o.progressText && !o.ok ? `<span class="prog">${escapeHtml(o.progressText)}</span>` : ''}</span></div>`).join('')}`;
  }

  renderGig() {
    const g = ctx.state.gig;
    if (!g) { this.el.gig.classList.add('hidden'); return; }
    this.el.gig.classList.remove('hidden');
    const t = g.timeLeft;
    const tt = t === null ? '' : `<div class="t num ${t < 0 ? 'bad' : t < 20 ? 'warn' : ''}">${t < 0 ? '-' : ''}${Math.floor(Math.abs(t) / 60)}:${String(Math.floor(Math.abs(t) % 60)).padStart(2, '0')}</div>`;
    this.el.gig.innerHTML = `${tt}<div class="c">${g.stage === 'pickup' ? 'Pick up' : 'Deliver'}: <b>${escapeHtml(g.cargo)}</b> → ${escapeHtml(g.stage === 'pickup' ? g.pickup.name : g.drop.name)} · ${money(g.pay)}${g.fragile ? ` · <span class="warn">FRAGILE ${g.damage ? Math.round(g.damage * 100) + '% dmg' : ''}</span>` : ''}</div>`;
  }

  mapTargets() {
    const s = ctx.state, L = ctx.layout;
    const t = [];
    for (const [id, lm] of Object.entries(L.landmarks)) {
      const b = L.buildingById[lm.buildingId];
      t.push({ x: b.door.x, z: b.door.z, color: lm.color, size: 7 });
    }
    for (const b of s.businesses) {
      const bl = L.buildingById[b.bId];
      t.push({ x: bl.door.x, z: bl.door.z, color: '#f2c14e', size: 8, label: '★' });
    }
    if (!ctx.player.inCar) t.push({ x: ctx.vehicle.pos.x, z: ctx.vehicle.pos.z, color: '#9ad0ff', size: 6, edge: true });
    const g = s.gig;
    if (g) {
      const tg = g.stage === 'pickup' ? g.pickup : g.drop;
      t.push({ x: tg.x, z: tg.z, color: '#ff6b6b', size: 9, edge: true, route: true });
    } else if (s.waypoint) {
      t.push({ x: s.waypoint.x, z: s.waypoint.z, color: '#b794f4', size: 9, edge: true, route: true });
    } else {
      const mt = missionTarget();
      if (mt) t.push({ x: mt.x, z: mt.z, color: '#ffd54a', size: 9, edge: true, route: true });
    }
    return t;
  }
}
