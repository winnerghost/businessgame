// Synthesised audio (Web Audio API): UI sounds, engine hum, ambient city bed, rain. No audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.ambientVol = 0.35;
    this.engine = null;
  }
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (_) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    // ambient: filtered brown noise (city rumble) + rain hiss
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    this.amb = c.createGain(); this.amb.gain.value = 0.12 * this.ambientVol;
    src.connect(lp).connect(this.amb).connect(this.master); src.start();
    const wbuf = c.createBuffer(1, len, c.sampleRate);
    const wd = wbuf.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    const rs = c.createBufferSource(); rs.buffer = wbuf; rs.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    this.rainG = c.createGain(); this.rainG.gain.value = 0;
    rs.connect(hp).connect(this.rainG).connect(this.master); rs.start();
    // engine
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 40;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 20;
    const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 400; ef.Q.value = 2;
    const eg = c.createGain(); eg.gain.value = 0;
    o1.connect(ef); o2.connect(ef); ef.connect(eg).connect(this.master);
    o1.start(); o2.start();
    this.engine = { o1, o2, ef, eg };
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setAmbient(v) { this.ambientVol = v; }
  update(dt, { driving, rpm = 0, throttle = 0, rain = 0, urban = 1 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engine) {
      const f = 38 + rpm * 120;
      this.engine.o1.frequency.setTargetAtTime(f, t, 0.08);
      this.engine.o2.frequency.setTargetAtTime(f / 2, t, 0.08);
      this.engine.ef.frequency.setTargetAtTime(300 + rpm * 900 + throttle * 400, t, 0.1);
      this.engine.eg.gain.setTargetAtTime(driving ? 0.05 + throttle * 0.05 + rpm * 0.03 : 0, t, 0.15);
    }
    this.rainG.gain.setTargetAtTime(rain * 0.05 * this.ambientVol * 2, t, 0.5);
    this.amb.gain.setTargetAtTime((0.06 + urban * 0.1) * this.ambientVol, t, 0.5);
  }
  tone(freq, dur, type = 'sine', vol = 0.15, delay = 0, slide = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'click': this.tone(880, 0.05, 'triangle', 0.05); break;
      case 'open': this.tone(520, 0.08, 'sine', 0.08); this.tone(780, 0.1, 'sine', 0.07, 0.06); break;
      case 'close': this.tone(700, 0.07, 'sine', 0.07); this.tone(460, 0.1, 'sine', 0.06, 0.05); break;
      case 'cash': this.tone(1318, 0.12, 'triangle', 0.1); this.tone(1760, 0.25, 'triangle', 0.09, 0.08); break;
      case 'confirm': this.tone(660, 0.08, 'sine', 0.1); this.tone(990, 0.14, 'sine', 0.09, 0.07); break;
      case 'error': this.tone(180, 0.18, 'square', 0.06); break;
      case 'notify': this.tone(988, 0.1, 'sine', 0.07); this.tone(1318, 0.15, 'sine', 0.06, 0.09); break;
      case 'fanfare': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.09, i * 0.1)); break;
      case 'jump': this.tone(300, 0.12, 'sine', 0.04, 0, 1.6); break;
      case 'door': this.tone(140, 0.2, 'triangle', 0.08); this.tone(90, 0.25, 'sine', 0.08, 0.05); break;
      case 'crash': this.tone(90, 0.35, 'sawtooth', 0.12, 0, 0.5); this.tone(60, 0.4, 'square', 0.08); break;
      case 'horn': this.tone(392, 0.35, 'square', 0.06); this.tone(494, 0.35, 'square', 0.05); break;
      default: break;
    }
  }
}
