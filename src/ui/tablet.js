// The management tablet ("VentureOS"): sidebar of apps, each rendering HTML with delegated actions.
import { ctx } from '../core/ctx.js';
import { money } from '../core/utils.js';
import { bind } from './dom.js';
import { drawChart } from './charts.js';

export class Tablet {
  constructor(apps) {
    this.apps = apps; // [{id, name, icon, render(state) => html, actions, after?}]
    this.root = document.getElementById('tablet');
    this.isOpen = false;
    this.appId = 'dashboard';
    this.params = {};
    this.charts = [];
    this.refreshTimer = 0;
    this.dirty = false;
    for (const ev of ['business', 'staff', 'loan', 'property', 'trade', 'candidates', 'listings', 'message', 'mission', 'missionDone', 'gig', 'investment', 'ipo', 'monthClosed', 'day']) {
      ctx.bus.on(ev, () => { this.dirty = true; });
    }
  }
  open(appId = null, params = null) {
    if (appId) this.appId = appId;
    if (params) this.params = params;
    this.isOpen = true;
    ctx.uiOpen = true;
    ctx.input?.releaseLock();
    this.root.classList.remove('hidden');
    this.render(true);
    ctx.audio?.play('open');
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    ctx.uiOpen = !!ctx.modal?.isOpen;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    ctx.audio?.play('close');
  }
  toggle(appId) { if (this.isOpen && (!appId || appId === this.appId)) this.close(); else this.open(appId); }
  go(appId, params = {}) { this.appId = appId; this.params = params; this.render(true); }

  render(resetScroll = false) {
    if (!this.isOpen) return;
    const app = this.apps.find((a) => a.id === this.appId) || this.apps[0];
    const s = ctx.state;
    const unread = s.messages.filter((m) => !m.read).length;
    const prev = this.root.querySelector('.tab-content');
    const scroll = !resetScroll && prev ? prev.scrollTop : 0;
    this.charts = [];
    let body;
    try { body = app.render(this.params, this); } catch (e) { console.error(e); body = `<div class="empty">Something went wrong rendering this app.<br><span class="dim">${e.message}</span></div>`; }
    this.root.innerHTML = `<div class="tab-frame">
      <nav class="tab-side"><div class="os">VENTURE OS</div>
        ${this.apps.map((a) => `<button class="${a.id === app.id ? 'on' : ''}" data-act="__app" data-arg="${a.id}"><span class="ico">${a.icon}</span><span class="lbl">${a.name}</span>${a.id === 'messages' && unread ? `<span class="badge">${unread}</span>` : ''}</button>`).join('')}
        <div class="spacer"></div>
        <button data-act="__close"><span class="ico">✕</span><span class="lbl">Close (Tab)</span></button>
      </nav>
      <section class="tab-main">
        <div class="tab-top"><h2>${app.title ? app.title(this.params) : app.name}</h2><span class="muted">Cash</span><span class="tcash num">${money(s.cash)}</span></div>
        <div class="tab-content">${body}</div>
      </section></div>`;
    const content = this.root.querySelector('.tab-content');
    content.scrollTop = scroll;
    bind(this.root, {
      __app: (id) => this.go(id),
      __close: () => this.close(),
      ...(app.actions || {}),
    });
    for (const c of this.charts) {
      const cv = this.root.querySelector(`canvas[data-chart="${c.id}"]`);
      if (cv) drawChart(cv, c.series, c.opts);
    }
    app.after?.(this.root, this.params, this);
    this.dirty = false;
  }
  // Apps call this to register a chart placeholder
  chart(series, opts = {}, cls = '') {
    const id = 'c' + this.charts.length;
    this.charts.push({ id, series, opts });
    return `<canvas class="chart ${cls}" data-chart="${id}"></canvas>`;
  }
  update(dt) {
    if (!this.isOpen) return;
    this.refreshTimer -= dt;
    const focused = document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && this.root.contains(document.activeElement);
    if ((this.dirty && this.refreshTimer <= 0) || this.refreshTimer < -4) {
      if (!focused && !ctx.input?.dragging) { this.render(); this.refreshTimer = 1.0; }
    }
  }
}
