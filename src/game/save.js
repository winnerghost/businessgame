// Save / load to localStorage (autosave + 3 manual slots) and user settings.
import { ctx } from '../core/ctx.js';
import { SAVE_VERSION, fmtDate, now } from './state.js';
import { money } from '../core/utils.js';

const KEY = 'venture_pm_save_';
const SETTINGS = 'venture_pm_settings';

export const DEFAULT_SETTINGS = { quality: 'high', sensitivity: 1, volume: 0.7, music: 0.35, pauseInMenus: true, showFps: false, invertY: false };

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS) || '{}')) }; } catch (_) { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch (_) { /* storage unavailable */ }
}

export function syncPlayerToState() {
  const s = ctx.state;
  const p = ctx.player, v = ctx.vehicle;
  if (p) { s.player.x = p.pos.x; s.player.z = p.pos.z; s.player.yaw = p.yaw; s.player.inCar = p.inCar; }
  if (v) { s.car.x = v.pos.x; s.car.z = v.pos.z; s.car.yaw = v.yaw; }
}

export function saveGame(slot = 'auto') {
  try {
    syncPlayerToState();
    const s = ctx.state;
    const meta = { slot, at: Date.now(), day: now().day, date: fmtDate(now().day), cash: s.cash, company: s.company?.name || 'Unregistered', businesses: s.businesses.length, v: SAVE_VERSION };
    localStorage.setItem(KEY + slot, JSON.stringify({ meta, state: s }));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function listSaves() {
  const out = [];
  for (const slot of ['auto', '1', '2', '3']) {
    try {
      const raw = localStorage.getItem(KEY + slot);
      if (!raw) { out.push({ slot, empty: true }); continue; }
      const { meta } = JSON.parse(raw);
      out.push({ slot, ...meta, label: `${meta.company} — ${meta.date} — ${money(meta.cash)} — ${meta.businesses} businesses` });
    } catch (_) { out.push({ slot, empty: true }); }
  }
  return out;
}

export function readSave(slot) {
  try {
    const raw = localStorage.getItem(KEY + slot);
    if (!raw) return null;
    const { state } = JSON.parse(raw);
    if (!state || state.v !== SAVE_VERSION) return null;
    return state;
  } catch (_) { return null; }
}

export function hasAnySave() { return listSaves().some((s) => !s.empty); }
export function deleteSave(slot) { try { localStorage.removeItem(KEY + slot); } catch (_) { /* ignore */ } }
