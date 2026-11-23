// Market intel, Missions, Messages, Map and Settings apps.
import { ctx } from '../../core/ctx.js';
import { money, clamp } from '../../core/utils.js';
import { DISTRICTS } from '../../game/data/districts.js';
import { BUSINESS_TYPES } from '../../game/data/businessTypes.js';
import { phaseName } from '../../game/economy.js';
import { MISSIONS, currentMission, objectiveStates, missionTarget } from '../../game/missions.js';
import { districtCompetition } from '../../game/competitors.js';
import { fmtDate } from '../../game/state.js';
import { cancelGig } from '../../game/gigs.js';
import { listSaves, saveGame, saveSettings } from '../../game/save.js';
import { QUALITY } from '../../engine/graphics.js';
import { MAP } from '../minimap.js';
import { esc } from './common.js';

export const market = {
  id: 'market', name: 'Market Intel', icon: '🌐',
  render(p, T) {
    const s = ctx.state, e = s.economy;
    const tab = p.tab || 'economy';
    const tabs = [['economy', 'Economy'], ['districts', 'Districts'], ['competition', 'Competition'], ['news', 'News']];
    let body = '';
    if (tab === 'economy') {
      body = `<div class="grid g5"><div class="card kpi"><div class="l">Business cycle</div><div class="v">${phaseName()}</div><div class="s">activity index ${(e.index * 100).toFixed(0)}</div></div>
        <div class="card kpi"><div class="l">Base rate</div><div class="v num">${(e.baseRate * 100).toFixed(2)}%</div></div><div class="card kpi"><div class="l">Inflation</div><div class="v num">${(e.inflation * 100).toFixed(1)}%</div><div class="s">price level ×${e.priceLevel.toFixed(3)}</div></div>
        <div class="card kpi"><div class="l">Unemployment</div><div class="v num">${(e.unemployment * 100).toFixed(1)}%</div></div><div class="card kpi"><div class="l">Property index</div><div class="v num">${(e.propertyIndex * 100).toFixed(0)}</div></div></div>
        <div class="grid g2" style="margin-top:14px"><div class="card"><h3>Activity index & rates (1 year)</h3>${T.chart([{ data: e.history.map((h) => h.index * 100), color: '#f2c14e' }, { data: e.history.map((h) => h.rate * 1000), color: '#5aa9ff' }], { zero: false })}<div class="legend"><span><i style="background:#f2c14e"></i>Activity (100 = trend)</span><span><i style="background:#5aa9ff"></i>Base rate ×10</span></div></div>
        <div class="card"><h3>Commodity prices (index)</h3>${Object.entries(e.commodity).map(([k, v]) => `<div class="meter"><span class="muted">${k}</span><div class="bar ${v > 1.15 ? 'bad' : v < 0.9 ? 'good' : ''}"><div style="width:${clamp(v / 2, 0, 1) * 100}%"></div></div><span class="val num">${(v * 100).toFixed(0)}</span></div>`).join('')}<div class="note">Commodity prices drive your cost of goods: coffee → cafés, food → restaurants/grocers, fabric → boutiques, fuel → logistics.</div></div></div>`;
    } else if (tab === 'districts') {
      body = `<table class="t"><thead><tr><th>District</th><th class="r">Foot traffic</th><th class="r">Wealth</th><th class="r">Residents</th><th class="r">Workers</th><th class="r">Tourism</th><th class="r">Retail rent</th><th class="r">Competitors</th></tr></thead><tbody>${Object.values(DISTRICTS).filter((d) => d.id !== 'park').map((d) => `<tr><td><b style="color:${d.color}">${d.name}</b></td><td class="r num">${Math.round(d.foot * 100)}</td><td class="r num">${Math.round(d.wealth * 100)}</td><td class="r num">${d.population.toLocaleString()}</td><td class="r num">${d.workers.toLocaleString()}</td><td class="r num">${Math.round(d.tourism * 100)}</td><td class="r num">${money(d.rent.retail)}/m²</td><td class="r num">${districtCompetition(d.id).length}</td></tr>`).join('')}</tbody></table>
        ${e.festival ? `<div class="callout gold" style="margin-top:12px">🎉 <b>${esc(e.festival.name)}</b> in ${DISTRICTS[e.festival.district].name} until day ${e.festival.until}: +45% demand.</div>` : ''}`;
    } else if (tab === 'competition') {
      const type = p.type || 'cafe';
      body = `<div class="row" style="margin-bottom:12px"><select data-change="ctype">${Object.values(BUSINESS_TYPES).filter((t) => ['retail', 'membership', 'hotel'].includes(t.model)).map((t) => `<option value="${t.id}" ${t.id === type ? 'selected' : ''}>${t.icon} ${t.name}</option>`).join('')}</select></div>
        <div class="grid g3">${Object.values(DISTRICTS).filter((d) => d.id !== 'park').map((d) => { const cs = districtCompetition(d.id, type); const mine = s.businesses.filter((b) => b.type === type && b.district === d.id); return `<div class="card"><h3 style="color:${d.color}">${d.name} <span class="pill">demand ×${(d.affinity[type] ?? 0).toFixed(2)}</span></h3>${mine.map((b) => `<div class="row sb"><b class="gold">★ ${esc(b.name)}</b><span class="num">rep ${Math.round(b.reputation)}</span></div>`).join('')}${cs.length ? cs.map((c) => `<div class="row sb" style="margin:4px 0"><span>${esc(c.name)} ${c.krane ? '<span class="pill bad">KRANE</span>' : ''}</span><span class="num muted">Q${Math.round(c.quality)} · R${Math.round(c.reputation)} · ${c.priceIdx.toFixed(2)}×</span></div>`).join('') : '<div class="muted">No competitors — open market!</div>'}</div>`; }).join('')}</div>`;
    } else {
      body = `<div class="stack">${e.news.map((n) => `<div class="card" style="padding:12px 14px"><span class="pill">${n.kind}</span> <span class="muted" style="font-size:12px">${fmtDate(n.day)}</span><div style="margin-top:6px">${esc(n.text)}</div></div>`).join('') || '<div class="muted">No news yet.</div>'}</div>`;
    }
    return `<div class="subtabs">${tabs.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-arg="${k}">${n}</button>`).join('')}</div>${body}`;
  },
  actions: {
    tab: (t) => { ctx.tablet.params = { tab: t }; ctx.tablet.render(true); },
    ctype: (v) => { ctx.tablet.params.type = v; ctx.tablet.render(true); },
  },
};

export const missions = {
  id: 'missions', name: 'Missions', icon: '🎯',
  render() {
    const s = ctx.state;
    const m = currentMission();
    const g = s.gig;
    const t = s.tender;
    return `${m ? `<div class="card" style="margin-bottom:14px"><h3>Current mission · from ${esc(m.giver)}</h3><div style="font-size:20px;font-weight:800">${esc(m.title)}</div><p class="note" style="font-size:13.5px;line-height:1.6">${esc(m.brief)}</p>
        ${objectiveStates(m).map((o) => `<div class="obj ${o.ok ? 'done' : ''}" style="font-size:14px"><span class="tick"></span><span>${esc(o.text)}${o.progressText && !o.ok ? ` <span class="prog" style="display:inline">${esc(o.progressText)}</span>` : ''}</span></div>`).join('')}
        <div class="row" style="margin-top:12px">${missionTarget() ? '<button class="btn primary" data-act="track">📍 Track objective on GPS</button>' : ''}${m.reward.cash ? `<span class="pill gold">Reward ${money(m.reward.cash)}</span>` : ''}</div></div>` : '<div class="callout gold" style="margin-bottom:14px">Campaign complete — the city is your sandbox.</div>'}
      <div class="grid g2"><div class="card"><h3>Side work</h3>
        ${g ? `<div><b>${esc(g.cargo)}</b><div class="note">${g.stage === 'pickup' ? 'Pick up at ' + esc(g.pickup.name) : 'Deliver to ' + esc(g.drop.name)} · ${money(g.pay)}</div><button class="btn small bad" style="margin-top:8px" data-act="cancelGig">Abandon job</button></div>` : '<div class="note">• Courier gigs at <b>SwiftRoute Depot</b> (Harborfront)<br>• Catering deliveries for your own food businesses<br>• City tenders at <b>City Hall</b></div>'}
        ${t ? `<div style="margin-top:12px"><span class="pill info">City tender</span> <b>${esc(t.title)}</b><div class="note">${money(t.bid)} · completes day ${t.until}</div></div>` : ''}</div>
      <div class="card"><h3>Campaign progress (${s.missions.done.length}/${MISSIONS.length})</h3>${MISSIONS.map((x) => `<div class="obj ${s.missions.done.includes(x.id) ? 'done' : ''}"><span class="tick"></span><span>${s.missions.done.includes(x.id) || x.id === s.missions.active ? esc(x.title) : '<span class="dim">???</span>'}</span></div>`).join('')}</div></div>`;
  },
  actions: {
    track: () => { ctx.state.waypoint = null; ctx.bus.emit('toast', { title: 'Tracking mission', text: 'Follow the yellow GPS route.', kind: 'info' }); },
    cancelGig: () => { cancelGig(); ctx.tablet.render(); },
  },
};

export const messages = {
  id: 'messages', name: 'Messages', icon: '✉️',
  render(p) {
    const s = ctx.state;
    if (!s.messages.length) return '<div class="empty">Inbox empty.</div>';
    const open = p.open || s.messages[0].id;
    return `<div class="row" style="margin-bottom:10px"><span class="sp"></span><button class="btn small" data-act="readAll">Mark all read</button></div><div class="stack">${s.messages.map((m) => {
      if (m.id === open) m.read = true;
      return `<div class="msg ${m.read ? '' : 'unread'}" data-act="open" data-arg="${m.id}"><div class="row sb"><span class="from">${esc(m.from)}</span><span class="muted" style="font-size:12px">${fmtDate(m.day)}</span></div><div class="sub">${m.read ? '' : '<span class="pill gold">NEW</span> '}${esc(m.subject)}</div>${m.id === open ? `<div class="body">${esc(m.body)}</div>${m.biz ? `<button class="btn small" style="margin-top:10px" data-act="biz" data-arg="${m.biz}">Go to business</button>` : ''}` : ''}</div>`;
    }).join('')}</div>`;
  },
  actions: {
    open: (id) => { ctx.tablet.params.open = id; ctx.tablet.render(); },
    readAll: () => { ctx.state.messages.forEach((m) => (m.read = true)); ctx.tablet.render(); },
    biz: (id) => ctx.tablet.go('businesses', { id }),
  },
};

// ------------------------------------------------------------------------------- map
export const mapApp = {
  id: 'map', name: 'City Map', icon: '🗺️',
  render() {
    const L = ctx.layout;
    return `<div class="grid" style="grid-template-columns:1fr 280px;height:100%"><div class="mapwrap"><canvas id="bigmap"></canvas></div>
      <div class="stack" style="overflow-y:auto;max-height:640px"><div class="note">Click the map to set a GPS waypoint. Scroll to zoom, drag to pan.</div>
        ${Object.entries(L.landmarks).map(([id, lm]) => `<div class="card" style="padding:10px 12px"><div class="row sb"><b style="color:${lm.color}">${esc(lm.name)}</b></div><div class="note">${esc(lm.desc)}</div><div class="row" style="margin-top:6px"><button class="btn small" data-act="wp" data-arg="${id}">📍 GPS</button><button class="btn small" data-act="taxi" data-arg="${id}">🚕 Taxi</button></div></div>`).join('')}
        <div class="legend"><span><i style="background:#f2c14e"></i>Your businesses</span><span><i style="background:#3ecf8e"></i>Listings</span><span><i style="background:#fff"></i>You</span></div></div></div>`;
  },
  after(root) { drawBigMap(root.querySelector('#bigmap')); },
  actions: {
    wp: (id) => { const b = ctx.layout.buildingById[ctx.layout.landmarks[id].buildingId]; ctx.state.waypoint = { x: b.door.x, z: b.door.z, label: ctx.layout.landmarks[id].name }; ctx.bus.emit('toast', { title: 'Waypoint set', text: ctx.layout.landmarks[id].name, kind: 'info' }); },
    taxi: (id) => { const b = ctx.layout.buildingById[ctx.layout.landmarks[id].buildingId]; ctx.bus.emit('taxi', { x: b.door.x, z: b.door.z, name: ctx.layout.landmarks[id].name }); },
  },
};

const view = { zoom: 0.55, cx: null, cz: null };
function drawBigMap(cv) {
  if (!cv || !MAP.canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const x = cv.getContext('2d');
  const s = ctx.state;
  const me = ctx.player.inCar ? ctx.vehicle.pos : ctx.player.pos;
  if (view.cx === null) { view.cx = MAP.x0 + MAP.w / 2; view.cz = MAP.z0 + MAP.h / 2 - 60; view.zoom = Math.min(w / MAP.w, h / MAP.h) * 1.05; }
  void me;
  const draw = () => {
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#0b1016'; x.fillRect(0, 0, w, h);
    const k = view.zoom;
    const toS = (wx, wz) => [(wx - view.cx) * k + w / 2, (wz - view.cz) * k + h / 2];
    const [ox, oy] = toS(MAP.x0, MAP.z0);
    x.imageSmoothingEnabled = true;
    x.drawImage(MAP.canvas, ox, oy, MAP.w * k, MAP.h * k);
    const dot = (wx, wz, c, r, label) => { const [sx, sy] = toS(wx, wz); x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fillStyle = c; x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1.5; x.stroke(); if (label && k > 0.35) { x.fillStyle = '#fff'; x.font = '600 11px Inter, sans-serif'; x.fillText(label, sx + r + 3, sy + 4); } };
    for (const l of s.listings) { const b = ctx.layout.buildingById[ctx.units[l.unitId].bId]; dot(b.door.x, b.door.z, '#3ecf8e', 3); }
    for (const [, lm] of Object.entries(ctx.layout.landmarks)) { const b = ctx.layout.buildingById[lm.buildingId]; dot(b.door.x, b.door.z, lm.color, 6, lm.name); }
    for (const b of s.businesses) { const bl = ctx.layout.buildingById[b.bId]; dot(bl.door.x, bl.door.z, '#f2c14e', 6, '★ ' + b.name); }
    if (s.waypoint) dot(s.waypoint.x, s.waypoint.z, '#b794f4', 7, s.waypoint.label || 'Waypoint');
    const mt = missionTarget(); if (mt) dot(mt.x, mt.z, '#ffd54a', 7, mt.label);
    dot(me.x, me.z, '#fff', 6, 'You');
    // district labels
    if (k < 0.9) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '800 12px Inter, sans-serif'; const seen = new Set(); for (const bl of ctx.layout.blocks) { if (seen.has(bl.district)) continue; seen.add(bl.district); const [sx, sy] = toS(bl.cx, bl.cz); x.fillText(DISTRICTS[bl.district].name.toUpperCase(), sx - 30, sy); } }
  };
  draw();
  let drag = null, moved = false;
  cv.onmousedown = (e) => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz }; moved = false; };
  cv.onmousemove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; view.cx = drag.cx - dx / view.zoom; view.cz = drag.cz - dy / view.zoom; draw(); };
  cv.onmouseup = (e) => {
    if (drag && !moved) {
      const r = cv.getBoundingClientRect();
      const wx = (e.clientX - r.left - w / 2) / view.zoom + view.cx, wz = (e.clientY - r.top - h / 2) / view.zoom + view.cz;
      s.waypoint = { x: wx, z: wz, label: 'Waypoint' };
      ctx.bus.emit('toast', { title: 'Waypoint set', text: 'Follow the purple GPS route.', kind: 'info' });
      draw();
    }
    drag = null;
  };
  cv.onwheel = (e) => { e.preventDefault(); view.zoom = clamp(view.zoom * (e.deltaY > 0 ? 0.88 : 1.14), 0.25, 3); draw(); };
}

// ------------------------------------------------------------------------------- settings
export const settings = {
  id: 'settings', name: 'Settings', icon: '⚙️',
  render() {
    const st = ctx.settings;
    const saves = listSaves();
    return `<div class="grid g2"><div class="card"><h3>Graphics</h3><div class="opt-grid">${Object.entries(QUALITY).map(([k, q]) => `<div class="opt ${st.quality === k ? 'on' : ''}" data-act="quality" data-arg="${k}"><div class="h">${q.label}</div><div class="d">${q.shadows ? `Shadows ${q.shadowSize}px` : 'No shadows'}${q.ao ? ' · Ambient occlusion' : ''}${q.bloom ? ' · Bloom' : ''} · ${q.pixelRatio}× res</div></div>`).join('')}</div>
        <div class="note" style="margin-top:8px">Traffic & pedestrian density apply after reload. Drop to Medium/Low if the frame rate struggles.</div>
        <label class="chk" style="margin-top:10px"><input type="checkbox" ${st.showFps ? 'checked' : ''} data-change="fps"> Show FPS</label></div>
      <div class="card"><h3>Audio & controls</h3><div class="meter"><span class="muted">Master volume</span><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-change="vol"><span></span></div>
        <div class="meter"><span class="muted">Ambience</span><input type="range" min="0" max="1" step="0.05" value="${st.music}" data-change="amb"><span></span></div>
        <div class="meter"><span class="muted">Mouse sensitivity</span><input type="range" min="0.3" max="2.5" step="0.1" value="${st.sensitivity}" data-change="sens"><span></span></div>
        <label class="chk" style="margin-top:8px"><input type="checkbox" ${st.pauseInMenus ? 'checked' : ''} data-change="pim"> Pause time while menus are open</label></div></div>
      <div class="card" style="margin-top:14px"><h3>Save game</h3>${saves.map((sv) => `<div class="row sb" style="margin:8px 0"><span><b>${sv.slot === 'auto' ? 'Autosave' : 'Slot ' + sv.slot}</b> <span class="muted">${sv.empty ? 'Empty' : esc(sv.label)}</span></span><span class="row">${sv.slot !== 'auto' ? `<button class="btn small" data-act="save" data-arg="${sv.slot}">Save here</button>` : ''}${sv.empty ? '' : `<button class="btn small" data-act="load" data-arg="${sv.slot}">Load</button>`}</span></div>`).join('')}
        <div class="note">The game autosaves every in-game day and whenever you sleep at home. Saves live in this browser's local storage.</div>
        <div class="row" style="margin-top:12px"><button class="btn bad" data-act="newgame">Start a new game</button></div></div>
      <div class="card" style="margin-top:14px"><h3>Controls</h3><div class="note" style="line-height:1.9">WASD move / drive · Shift sprint · Space jump / handbrake · F enter/exit vehicle · E interact · Tab tablet · M map · Click canvas to capture mouse (Esc to release) · Mouse wheel zoom camera · H toggle help · 1–5 time speed · P pause</div></div>`;
  },
  actions: {
    quality: (k) => { ctx.settings.quality = k; saveSettings(ctx.settings); ctx.gfx.setQuality(k); ctx.tablet.render(); },
    fps: (v) => { ctx.settings.showFps = v; saveSettings(ctx.settings); },
    vol: (v) => { ctx.settings.volume = +v; ctx.audio.setVolume(+v); saveSettings(ctx.settings); },
    amb: (v) => { ctx.settings.music = +v; ctx.audio.setAmbient(+v); saveSettings(ctx.settings); },
    sens: (v) => { ctx.settings.sensitivity = +v; ctx.camRig.sensitivity = +v; saveSettings(ctx.settings); },
    pim: (v) => { ctx.settings.pauseInMenus = v; saveSettings(ctx.settings); },
    save: (slot) => { if (saveGame(slot)) ctx.bus.emit('toast', { title: 'Game saved', text: `Slot ${slot}`, kind: 'good' }); ctx.tablet.render(); },
    load: (slot) => ctx.modal.confirm('Load this save?', 'Unsaved progress will be lost.', () => ctx.bus.emit('loadGame', slot), { yes: 'Load' }),
    newgame: () => ctx.modal.confirm('Start a new game?', 'Your current progress will be lost unless saved.', () => ctx.bus.emit('newGame'), { yes: 'New game', cls: 'bad' }),
  },
};
