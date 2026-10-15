/**
 * DOM helpers.
 *
 * BUG FIX: purana escapeHtml() single quote escape nahi karta tha —
 *
 *   function escapeHtml(str) {
 *     return str.replace(/&/g,'&amp;').replace(/</g,'&lt;')
 *               .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 *   }                                      // ← ' missing
 *
 * ...aur wahi value `onclick="fn('...')"` ke andar JS string literal mein
 * jaati thi. Name mein ek apostrophe daal kar string se bahar nikal kar
 * arbitrary JS chalaya ja sakta tha (DOM XSS).
 *
 * Do-tarfa fix: (1) saare 5 characters escape, (2) views ab inline onclick
 * ke bajaye data-attributes + event delegation use karte hain.
 */

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ENTITIES[c]);
}

export const $ = (id) => document.getElementById(id);

export function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

export function setHtml(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

export function show(id) {
  $(id)?.classList.remove('hidden');
}

export function hide(id) {
  $(id)?.classList.add('hidden');
}

let toastTimer = null;
export function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2400);
}

/**
 * Event delegation. Inline onclick handlers ki jagah:
 *   <button data-action="toggle-habit" data-habit-id="h1">
 */
export function delegate(root, eventName, handlers) {
  root.addEventListener(eventName, (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.action];
    if (fn) {
      ev.preventDefault();
      fn(el.dataset, el, ev);
    }
  });
}
