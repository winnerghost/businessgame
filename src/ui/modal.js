// Modal dialogs (one at a time, with a queue for event choices) and toast notifications.
import { ctx } from '../core/ctx.js';
import { bind } from './dom.js';
import { escapeHtml } from '../core/utils.js';

export class Modal {
  constructor() {
    this.root = document.getElementById('modal-root');
    this.queue = [];
    this.current = null;
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root && this.current?.dismissable !== false) this.close(); });
  }
  get isOpen() { return !!this.current; }
  open(o) {
    if (this.current && o.queue) { this.queue.push(o); return; }
    if (this.current) this.close(true);
    this.current = o;
    this.render();
    this.root.classList.add('on');
    ctx.uiOpen = true;
    ctx.input?.releaseLock();
    ctx.audio?.play('open');
  }
  render() {
    const o = this.current;
    if (!o) return;
    const body = typeof o.body === 'function' ? o.body() : o.body || '';
    this.root.innerHTML = `<div class="modal ${o.wide ? 'wide' : ''}">
      <div class="modal-head">${o.icon ? `<div class="mi">${o.icon}</div>` : ''}<div><h2>${escapeHtml(o.title)}</h2>${o.sub ? `<div class="sub">${o.sub}</div>` : ''}</div>
      ${o.dismissable === false ? '' : '<button class="btn small x" data-act="__close">✕</button>'}</div>
      <div class="modal-body">${body}</div>
      ${o.foot ? `<div class="modal-foot">${o.foot.map((b, i) => `<button class="btn ${b.cls || ''}" data-act="__foot" data-arg="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('')}</div>` : ''}
    </div>`;
    const scroll = this._scroll || 0;
    const mb = this.root.querySelector('.modal-body');
    if (mb) mb.scrollTop = scroll;
    bind(this.root, {
      __close: () => this.close(),
      __foot: (i) => { const b = o.foot[+i]; const keep = b.fn?.(); if (b.close !== false && keep !== false) this.close(); },
      ...(o.handlers || {}),
    });
    o.after?.(this.root);
  }
  refresh() {
    if (!this.current) return;
    const mb = this.root.querySelector('.modal-body');
    this._scroll = mb ? mb.scrollTop : 0;
    this.render();
    this._scroll = 0;
  }
  close(silent = false) {
    const o = this.current;
    this.current = null;
    this.root.classList.remove('on');
    this.root.innerHTML = '';
    o?.onClose?.();
    if (!silent) ctx.audio?.play('close');
    ctx.uiOpen = !!ctx.tablet?.isOpen;
    if (this.queue.length) setTimeout(() => this.open(this.queue.shift()), 150);
  }
  confirm(title, text, onYes, { yes = 'Confirm', cls = 'primary' } = {}) {
    this.open({ title, body: `<p class="note" style="font-size:14px;color:#c8d2dc">${text}</p>`, foot: [{ label: 'Cancel' }, { label: yes, cls, fn: onYes }] });
  }
}

export class Toasts {
  constructor() {
    this.root = document.getElementById('toasts');
    ctx.bus.on('toast', (t) => this.show(t));
  }
  show({ title, text = '', kind = 'info' }) {
    const el = document.createElement('div');
    el.className = `toast glass ${kind}`;
    el.innerHTML = `<div class="tt">${escapeHtml(title)}</div>${text ? `<div class="tx">${escapeHtml(text)}</div>` : ''}`;
    this.root.appendChild(el);
    while (this.root.children.length > 4) this.root.firstChild.remove();
    if (kind === 'bad') ctx.audio?.play('error');
    else if (kind !== 'info') ctx.audio?.play('notify');
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, kind === 'mission' ? 6000 : 4200);
  }
}
