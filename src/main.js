// Venture: Port Meridian — bootstrap, title screen, input, world interactions and the main loop.
import * as THREE from 'three';
import './styles.css';
import { ctx } from './core/ctx.js';
import { Input } from './core/input.js';
import { money, clamp, escapeHtml } from './core/utils.js';
import { loadAssets } from './engine/assets.js';
import { Graphics } from './engine/graphics.js';
import { buildLayout, CITY, districtAt } from './world/layout.js';
import { CityBuilder } from './world/cityBuilder.js';
import { Collision } from './world/collision.js';
import { Traffic } from './world/traffic.js';
import { Pedestrians } from './world/pedestrians.js';
import { Markers } from './world/markers.js';
import { Player } from './player/player.js';
import { PlayerVehicle } from './player/vehicle.js';
import { CameraRig } from './player/cameraRig.js';
import { generateUnits } from './game/properties.js';
import { newGame, advance, setSpeed } from './game/sim.js';
import { now, dateOf, txn, toast } from './game/state.js';
import { companyEquity } from './game/finance.js';
import { tickMissions, missionTarget } from './game/missions.js';
import { updateGig, gigImpact, startBizDelivery } from './game/gigs.js';
import { loadSettings, saveSettings, saveGame, readSave, listSaves, hasAnySave, syncPlayerToState } from './game/save.js';
import { HUD } from './ui/hud.js';
import { buildMapImage } from './ui/minimap.js';
import { Tablet } from './ui/tablet.js';
import { Modal, Toasts } from './ui/modal.js';
import { Audio } from './ui/audio.js';
import { showLocation, showListing, showBusinessDoor, showSetupWizard, doSleep } from './ui/locations.js';
import { dashboard } from './ui/apps/dashboard.js';
import { businesses } from './ui/apps/businesses.js';
import { properties } from './ui/apps/properties.js';
import { staff } from './ui/apps/staff.js';
import { finance } from './ui/apps/finance.js';
import { bank } from './ui/apps/bank.js';
import { stocks } from './ui/apps/stocks.js';
import { market, missions, messages, mapApp, settings } from './ui/apps/misc.js';
import { BUSINESS_TYPES } from './game/data/businessTypes.js';

window.__ctx = ctx;
const $ = (id) => document.getElementById(id);
const setLoad = (p, text) => { $('load-bar').style.width = `${Math.round(p * 100)}%`; if (text) $('load-text').textContent = text; };
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot() {
  ctx.settings = loadSettings();
  const qp = new URLSearchParams(location.search).get('quality');
  if (qp) ctx.settings.quality = qp;
  await loadAssets((p, key) => setLoad(p * 0.55, `Loading ${key.replace(/_/g, ' ')}…`));
  setLoad(0.58, 'Starting renderer…'); await frame();
  const gfx = (ctx.gfx = new Graphics($('app'), ctx.settings.quality));
  ctx.scene = gfx.scene; ctx.camera = gfx.camera; ctx.renderer = gfx.renderer;
  setLoad(0.62, 'Surveying Port Meridian…'); await frame();
  ctx.layout = buildLayout();
  ctx.units = generateUnits(ctx.layout);
  ctx.collision = new Collision();
  setLoad(0.68, 'Raising skyscrapers…'); await frame();
  const city = (ctx.world = new CityBuilder(ctx.layout, gfx, ctx.collision));
  gfx.scene.add(city.build());
  setLoad(0.82, 'Paving streets & planting trees…'); await frame();
  ctx.input = new Input(gfx.renderer.domElement);
  ctx.camRig = new CameraRig(gfx.camera, ctx);
  ctx.camRig.sensitivity = ctx.settings.sensitivity;
  ctx.player = new Player(ctx);
  gfx.scene.add(ctx.player.root);
  ctx.vehicle = new PlayerVehicle(ctx);
  gfx.scene.add(ctx.vehicle.root);
  ctx.traffic = new Traffic(ctx, ctx.layout, city, gfx.q.cars);
  ctx.peds = new Pedestrians(ctx, ctx.layout, city.group, gfx.q.peds);
  ctx.markers = new Markers(ctx, gfx.scene);
  setLoad(0.9, 'Drawing maps…'); await frame();
  buildMapImage(ctx.layout);
  ctx.audio = new Audio();
  ctx.audio.setVolume(ctx.settings.volume);
  ctx.audio.setAmbient(ctx.settings.music);
  ctx.modal = new Modal();
  new Toasts();
  ctx.tablet = new Tablet([dashboard, businesses, properties, staff, finance, bank, stocks, market, missions, messages, mapApp, settings]);
  ctx.companyEquity = companyEquity;
  wireEvents();
  setLoad(1, 'Ready.');
  await frame();
  $('loading').classList.add('hidden');
  showTitle();
  // photo/debug mode: ?autostart=1&time=18.5&rain=0.8&cloud=0.9&cam=x,y,z&look=x,y,z
  const P = new URLSearchParams(location.search);
  if (P.get('autostart')) {
    ctx.audio.init();
    startNew(false);
    if (P.get('time')) ctx.state.clock.min = Math.round(parseFloat(P.get('time')) * 60);
    const w = ctx.state.economy.weather;
    if (P.get('rain')) { w.rain = parseFloat(P.get('rain')); w.target = { rain: w.rain, cloud: Math.max(w.rain, 0.8), fog: 0.1 }; w.next = 1e9; }
    if (P.get('cloud')) { w.cloud = parseFloat(P.get('cloud')); w.target = { ...(w.target || { rain: 0, fog: 0 }), cloud: w.cloud }; w.next = 1e9; }
    if (P.get('cam')) ctx.photoCam = { pos: P.get('cam').split(',').map(Number), look: (P.get('look') || '0,20,0').split(',').map(Number) };
    if (P.get('speed')) setSpeed(+P.get('speed'));
  }
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ title screen
function showTitle() {
  const t = $('title');
  const saves = listSaves().filter((s) => !s.empty);
  t.classList.remove('hidden');
  t.innerHTML = `<div class="title-card"><h1 class="brand">VENTURE</h1><div class="brand-sub">Port Meridian · Business Empire</div>
    <div class="title-menu">
      ${saves.length ? `<button class="btn primary big" data-a="continue">Continue</button>` : ''}
      <button class="btn ${saves.length ? '' : 'primary'} big" data-a="new">New Game</button>
      ${saves.length ? `<div class="saves">${saves.map((s) => `<button class="btn" data-a="load" data-s="${s.slot}">${s.slot === 'auto' ? 'Autosave' : 'Slot ' + s.slot}: ${escapeHtml(s.label)}</button>`).join('')}</div>` : ''}
      <div class="note" style="margin-top:18px;max-width:520px;line-height:1.6">Start with $25,000, a rusty hatchback and a dream. Register a company, lease a storefront, hire staff, set prices, manage inventory and cash flow — then expand across seven districts, buy real estate, trade stocks and take your empire public.</div>
    </div></div><div class="title-foot">WASD + mouse · Tab: tablet · E: interact · F: car · Best with a mouse & keyboard · Textures & skies: Poly Haven (CC0)</div>`;
  t.onclick = (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    ctx.audio.init();
    if (b.dataset.a === 'new') startNew();
    else if (b.dataset.a === 'continue') loadSlot(saves[0].slot);
    else if (b.dataset.a === 'load') loadSlot(b.dataset.s);
  };
  ctx.titleOrbit = 0;
}

function hideTitle() {
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  ctx.started = true;
}

function startNew(openInbox = true) {
  newGame();
  placeFromState();
  hideTitle();
  syncWorld();
  ctx.hud.renderTicker();
  if (openInbox) setTimeout(() => ctx.tablet.open('messages'), 600);
}

function loadSlot(slot) {
  const st = readSave(slot);
  if (!st) { toastLater('Could not load save', 'The save is missing or from an older version.'); return; }
  ctx.state = st;
  placeFromState();
  if (!ctx.started) hideTitle();
  ctx.modal.close(true);
  ctx.tablet.close();
  syncWorld();
  toastLater('Game loaded', `${st.company?.name || 'Unregistered'} — Day ${now().day}`);
}
function toastLater(title, text) { setTimeout(() => ctx.bus.emit('toast', { title, text, kind: 'info' }), 100); }

function placeFromState() {
  const s = ctx.state;
  ctx.vehicle.setModel(s.car.id, s.car.color);
  ctx.vehicle.place(s.car.x, s.car.z, s.car.yaw);
  ctx.player.place(s.player.x, s.player.z, s.player.yaw);
  ctx.player.inCar = false;
  ctx.player.root.visible = true;
  ctx.camRig.yaw = s.player.yaw + Math.PI;
  if (!ctx.hud) ctx.hud = new HUD();
}

// ------------------------------------------------------------------ world sync: markers & signs
function syncWorld() {
  const s = ctx.state, L = ctx.layout, M = ctx.markers, city = ctx.world;
  M.clearKind('landmark'); M.clearKind('biz'); M.clearKind('listing'); M.clearKind('prop');
  for (const [id, lm] of Object.entries(L.landmarks)) {
    const b = L.buildingById[lm.buildingId];
    M.add({ id: 'lm_' + id, kind: 'landmark', x: b.door.x, z: b.door.z, label: lm.badge, color: lm.color, range: 320, beamH: 18, prompt: `Enter <b>${escapeHtml(lm.name)}</b>`, onInteract: () => showLocation(id) });
  }
  const bizUnits = new Set(s.businesses.map((b) => b.unitId));
  for (const b of s.businesses) {
    const bl = L.buildingById[b.bId];
    M.add({ id: 'biz_' + b.id, kind: 'biz', x: bl.door.x + 1.5, z: bl.door.z, label: '★', color: '#f2c14e', range: 260, beamH: 12, prompt: `Manage <b>${escapeHtml(b.name)}</b>`, onInteract: () => showBusinessDoor(b) });
  }
  for (const id of [...s.leases.map((l) => l.unitId), ...s.owned.map((o) => o.unitId)]) {
    if (bizUnits.has(id)) continue;
    const u = ctx.units[id], bl = L.buildingById[u.bId];
    M.add({ id: 'prop_' + id, kind: 'prop', x: bl.door.x - 1.5, z: bl.door.z, label: 'KEY', color: '#9ae6b4', range: 220, beamH: 10, prompt: `Your property: <b>${escapeHtml(u.label)}</b>`, onInteract: () => (['retail', 'office', 'industrial', 'building'].includes(u.type) ? showSetupWizard(id) : ctx.tablet.open('properties', { tab: 'mine' })) });
  }
  const seen = new Set();
  for (const l of s.listings) {
    const u = ctx.units[l.unitId], bl = L.buildingById[u.bId];
    if (seen.has(bl.id)) continue;
    seen.add(bl.id);
    M.add({ id: 'lst_' + bl.id, kind: 'listing', x: bl.door.x, z: bl.door.z + (bl.face === 'N' ? 0.6 : -0.6), label: l.mode === 'sale' ? '$' : 'L', color: '#3ecf8e', range: 110, beamH: 6, beamR: 0.5, scale: 1.1, radius: 2.6, prompt: `View listing: <b>${escapeHtml(u.label)}</b> — ${escapeHtml(u.address)}`, onInteract: () => showListing(l.unitId) });
  }
  // storefront signs for player businesses
  for (const key of [...city.signs.keys()]) if (key.startsWith('biz_') && !s.businesses.find((b) => 'biz_' + b.id === key)) city.removeSign(key);
  for (const b of s.businesses) {
    const bl = L.buildingById[b.bId];
    if (!city.signs.has('biz_' + b.id) || city.signs.get('biz_' + b.id).userData.name !== b.name) {
      const sign = city.addSign(bl, b.name.toUpperCase(), { bg: '#101418', fg: b.color, key: 'biz_' + b.id, height: bl.kind === 'house' ? 3 : 5.3 });
      sign.userData.name = b.name;
    }
  }
}

let objectiveKey = '';
function syncObjectives() {
  const s = ctx.state, M = ctx.markers;
  const g = s.gig;
  let t = null, kind = '';
  if (g) { t = g.stage === 'pickup' ? g.pickup : g.drop; kind = 'gig'; }
  else if (s.waypoint) { t = s.waypoint; kind = 'wp'; }
  else { t = missionTarget(); kind = 'mission'; }
  const key = t ? `${kind}_${Math.round(t.x)}_${Math.round(t.z)}` : '';
  if (key === objectiveKey) return;
  objectiveKey = key;
  M.remove('objective');
  if (!t) return;
  const color = kind === 'gig' ? '#ff6b6b' : kind === 'wp' ? '#b794f4' : '#ffd54a';
  M.add({ id: 'objective', kind: 'objective', x: t.x, z: t.z, label: kind === 'gig' ? (g.stage === 'pickup' ? 'P' : 'D') : kind === 'wp' ? '◆' : '!', color, range: 5000, beamH: 120, beamR: 0.7, scale: 1.3, radius: kind === 'wp' ? 8 : 6 });
}

function wireEvents() {
  const bus = ctx.bus;
  for (const ev of ['business', 'property', 'listings', 'bizCreated', 'bizRemoved', 'company']) bus.on(ev, () => { if (ctx.started) syncWorld(); });
  bus.on('choice', (c) => {
    ctx.modal.open({
      queue: true, title: c.title, icon: c.icon || '⚡', dismissable: false,
      body: `<p style="font-size:14px;line-height:1.6;color:#c8d2dc">${escapeHtml(c.text)}</p>`,
      foot: c.options.map((o) => ({ label: o.label, cls: 'primary', fn: () => o.fn() })),
    });
  });
  bus.on('startBizDelivery', (o) => startBizDelivery(o));
  bus.on('carImpact', (f) => { gigImpact(f); ctx.audio?.play('crash'); });
  bus.on('carChanged', () => {
    const d = ctx.layout.buildingById[ctx.layout.landmarks.dealer.buildingId];
    ctx.vehicle.setModel(ctx.state.car.id, ctx.state.car.color);
    if (!ctx.player.inCar) ctx.vehicle.place(d.door.x + 6, d.door.z - 8, Math.PI / 2);
  });
  bus.on('taxi', (dest) => {
    const p = ctx.player.inCar ? ctx.vehicle.pos : ctx.player.pos;
    const dist = Math.hypot(dest.x - p.x, dest.z - p.z);
    const fare = Math.round(8 + (dist / 1000) * 3.2);
    ctx.modal.confirm('Call a taxi?', `Ride to <b>${escapeHtml(dest.name)}</b> — fare ${money(fare)}. Your car stays where it is.`, () => {
      if (ctx.state.cash < fare) { toast('Insufficient funds', '', 'bad'); return; }
      txn(-fare, 'personal', `Taxi to ${dest.name}`);
      ctx.tablet.close();
      fadeThen(() => {
        if (ctx.player.inCar) exitCar(true);
        ctx.player.place(dest.x, dest.z + (dest.z > 0 ? -1.5 : 1.5), 0);
        ctx.state.clock.min += Math.round(dist / 1000 * 3) + 4;
      });
    });
  });
  bus.on('sleep', () => fadeThen(() => doSleep(), 1400));
  bus.on('slept', () => toast('Good morning', `Day ${now().day}. Your businesses kept running overnight.`, 'info'));
  bus.on('loadGame', (slot) => loadSlot(slot));
  bus.on('newGame', () => { ctx.tablet.close(); ctx.modal.close(true); startNew(); });
  bus.on('day', () => { saveGame('auto'); });
  bus.on('bankrupt', () => syncWorld());
}

function fadeThen(fn, hold = 700) {
  const f = $('fade');
  if (!f) { fn(); return; }
  f.style.opacity = 1;
  setTimeout(() => { fn(); setTimeout(() => { f.style.opacity = 0; }, hold); }, 600);
}

// ------------------------------------------------------------------ car enter / exit
function enterCar() {
  ctx.player.inCar = true;
  ctx.vehicle.occupied = true;
  ctx.player.root.visible = false;
  ctx.state.player.inCar = true;
  ctx.audio?.play('door');
}
function exitCar(force = false) {
  const v = ctx.vehicle;
  if (!force && Math.abs(v.speed) > 3) { toast('Slow down', 'Stop the car before getting out.', 'info'); return; }
  const left = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
  const p = v.pos.clone().addScaledVector(left, v.width / 2 + 0.9);
  ctx.player.place(p.x, p.z, v.yaw);
  ctx.collision.resolve(ctx.player.pos, 0.4, 0.5);
  ctx.player.inCar = false;
  v.occupied = false;
  v.speed = 0;
  ctx.player.root.visible = true;
  ctx.state.player.inCar = false;
  ctx.audio?.play('door');
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let missionTimer = 0, objTimer = 0;
let helpVisible = true;
const camF = new THREE.Vector3();

function handleKeys() {
  const I = ctx.input;
  const ui = ctx.tablet.isOpen || ctx.modal.isOpen;
  if (I.hit('Tab') || (I.hit('KeyT') && !ui)) { if (ctx.modal.isOpen) ctx.modal.close(); else ctx.tablet.toggle(); }
  if (I.hit('KeyM')) { if (!ctx.modal.isOpen) ctx.tablet.toggle('map'); }
  if (I.hit('Escape')) { if (ctx.modal.isOpen) ctx.modal.close(); else if (ctx.tablet.isOpen) ctx.tablet.close(); else if (!I.locked) ctx.tablet.open('settings'); }
  if (I.hit('KeyH')) { helpVisible = !helpVisible; document.getElementById('h-help')?.classList.toggle('hidden', !helpVisible); }
  if (I.hit('KeyP')) setSpeed(ctx.state.speed === 0 ? 1 : 0);
  for (let i = 1; i <= 5; i++) if (I.hit('Digit' + i) && !ui) setSpeed(i);
  if (ui) return;
  if (I.hit('KeyF')) {
    if (ctx.player.inCar) exitCar();
    else if (ctx.player.pos.distanceTo(ctx.vehicle.pos) < 4.2) enterCar();
  }
  if (I.hit('KeyE') && ctx.nearMarker?.onInteract) ctx.nearMarker.onInteract();
  if (I.hit('KeyQ') && ctx.player.inCar) ctx.audio?.play('horn');
}

function loop() {
  requestAnimationFrame(loop);
  const t = performance.now();
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const gfx = ctx.gfx;
  if (!ctx.started || !ctx.state) {
    // cinematic orbit behind the title screen
    ctx.titleOrbit = (ctx.titleOrbit || 0) + dt * 0.03;
    const a = ctx.titleOrbit;
    gfx.camera.position.set(Math.cos(a) * 420, 120 + Math.sin(a * 0.7) * 30, Math.sin(a) * 420 + 60);
    gfx.camera.lookAt(0, 45, 0);
    gfx.update(dt, 17.6, { rain: 0, cloud: 0.25, fog: 0 }, new THREE.Vector3(0, 0, 0));
    ctx.world.update(dt, t / 1000);
    if (ctx.traffic) ctx.traffic.update(dt, new THREE.Vector3(0, 0, 0), null);
    gfx.render();
    ctx.input.endFrame();
    return;
  }
  const s = ctx.state;
  handleKeys();
  const uiOpen = ctx.tablet.isOpen || ctx.modal.isOpen;
  ctx.paused = (uiOpen && ctx.settings.pauseInMenus) || s.speed === 0;
  const active = !uiOpen;
  ctx.input.enabled = true;
  const inCar = ctx.player.inCar;
  ctx.player.update(dt, ctx.input, ctx.camRig, active && !inCar);
  ctx.vehicle.update(dt, ctx.input, active && inCar);
  if (inCar) { ctx.player.pos.copy(ctx.vehicle.pos); }
  const focus = inCar ? ctx.vehicle.pos : ctx.player.pos;
  if (!uiOpen) ctx.camRig.update(dt, ctx.input, focus, { driving: inCar, heading: ctx.vehicle.yaw, speed: ctx.vehicle.speed });
  else ctx.input.consumeLook();
  gfx.camera.getWorldDirection(camF);
  ctx.traffic.update(dt, focus, camF);
  ctx.peds.update(dt, focus, gfx.night);
  const near = ctx.markers.update(dt, focus);
  ctx.nearMarker = near;
  // prompts
  let prompt = null;
  if (!uiOpen) {
    if (near && near.prompt) prompt = `<span class="key">E</span>${near.prompt}`;
    else if (!inCar && ctx.player.pos.distanceTo(ctx.vehicle.pos) < 4.2) prompt = `<span class="key">F</span>Get in your ${escapeHtml(ctx.vehicle.spec.name)}`;
    else if (!ctx.input.locked && !ctx.input.dragging && ctx.hintTimer === undefined) prompt = null;
  }
  ctx.hud.setPrompt(prompt);
  updateGig(dt, focus, inCar);
  // simulation clock
  advance(dt);
  missionTimer -= dt;
  if (missionTimer <= 0) { missionTimer = 1; tickMissions(); }
  objTimer -= dt;
  if (objTimer <= 0) { objTimer = 0.5; syncObjectives(); }
  if (s.waypoint && Math.hypot(focus.x - s.waypoint.x, focus.z - s.waypoint.z) < 10) { s.waypoint = null; toast('Destination reached', '', 'info'); }
  // world visuals
  const d = dateOf(s.clock.min);
  const w = s.economy.weather;
  gfx.update(dt, d.hour + d.minute / 60, w, focus);
  ctx.world.update(dt, t / 1000);
  ctx.hud.update(dt);
  ctx.tablet.update(dt);
  const dist = districtAt(focus.x, focus.z);
  ctx.audio.update(dt, { driving: inCar, rpm: clamp(Math.abs(ctx.vehicle.speed) / (ctx.vehicle.spec?.top || 40), 0, 1), throttle: inCar && ctx.input.down('KeyW') ? 1 : 0, rain: w.rain, urban: ['downtown', 'midtown'].includes(dist) ? 1 : 0.5 });
  syncPlayerToState();
  if (ctx.photoCam) { gfx.camera.position.set(...ctx.photoCam.pos); gfx.camera.lookAt(...ctx.photoCam.look); }
  gfx.render();
  ctx.input.endFrame();
}

// pointer lock on click when nothing is open
document.addEventListener('mousedown', (e) => {
  if (!ctx.started) return;
  if (e.target.id === 'game-canvas' && !ctx.tablet.isOpen && !ctx.modal.isOpen) { ctx.audio.init(); ctx.input.requestLock(); }
});

boot().catch((e) => {
  console.error(e);
  setLoad(1, 'Failed to start: ' + e.message + ' — WebGL 2 is required.');
});
export { BUSINESS_TYPES };
