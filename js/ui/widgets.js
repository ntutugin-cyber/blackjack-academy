import { $ } from '../utils/helpers.js';
let openCount = 0, current = null;
export const isModalOpen = () => openCount > 0;

export function toast(msg, tone = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${tone}`; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 3600);
}

export function modal({ title, html, actions = [], wide = false, dismissable = true }) {
  current?.close();
  const root = $('#modalRoot');
  const scrim = document.createElement('div'); scrim.className = 'modal-scrim';
  scrim.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><b>${title}</b><button class="modal-x" aria-label="Закрыть">✕</button></div>
    <div class="modal-body">${html}</div>
    ${actions.length ? '<div class="modal-actions"></div>' : ''}</div>`;
  root.appendChild(scrim); openCount++;
  const api = {
    el: scrim,
    close() { if (!scrim.isConnected) return; scrim.remove(); openCount--; document.removeEventListener('keydown', onKey); if (current === api) current = null; },
  };
  current = api;
  const onKey = e => { if (e.key === 'Escape' && dismissable) api.close(); };
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('pointerdown', e => { if (e.target === scrim && dismissable) api.close(); });
  scrim.querySelector('.modal-x').addEventListener('click', () => api.close());
  const row = scrim.querySelector('.modal-actions');
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = `btn ${a.tone === 'primary' ? 'btn-primary' : a.tone === 'danger' ? 'btn-danger' : 'btn-ghost'}`;
    b.innerHTML = a.label;
    b.addEventListener('click', () => { a.onClick?.(api); if (a.close !== false) api.close(); });
    row?.appendChild(b);
  });
  (row?.querySelector('.btn-primary') || scrim.querySelector('.modal-x')).focus();
  return api;
}

export function confirmModal(title, text, onYes, yesLabel = 'Подтвердить') {
  modal({ title, html: `<p>${text}</p>`, actions: [
    { label: 'Отмена', tone: 'ghost' },
    { label: yesLabel, tone: 'danger', onClick: onYes },
  ] });
}