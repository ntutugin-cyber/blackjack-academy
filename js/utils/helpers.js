export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = n => Math.round(n).toLocaleString('ru-RU');
export const fmtSign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
export const nowTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export function download(name, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export class Emitter {
  constructor() { this._m = new Map(); }
  on(e, f) { if (!this._m.has(e)) this._m.set(e, new Set()); this._m.get(e).add(f); }
  emit(e, p) { this._m.get(e)?.forEach(f => { try { f(p); } catch (err) { console.error(err); } }); }
}