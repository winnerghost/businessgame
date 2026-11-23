// Global runtime context shared across modules (filled during bootstrap).
import { Bus } from './utils.js';

export const ctx = {
  bus: new Bus(),
  scene: null,
  camera: null,
  renderer: null,
  gfx: null,
  layout: null,
  world: null,
  collision: null,
  traffic: null,
  peds: null,
  markers: null,
  player: null,
  vehicle: null,
  camRig: null,
  input: null,
  audio: null,
  state: null,
  sim: null,
  hud: null,
  tablet: null,
  modal: null,
  paused: false,
  uiOpen: false,
  started: false,
};
