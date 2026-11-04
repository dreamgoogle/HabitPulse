/**
 * User settings — sirf is device ke localStorage mein (login ki zaroorat nahi).
 * Har value sanitize hoti hai, isliye galat/kharab input kuch tod nahi sakta.
 */
const KEY = 'habitpulse_settings_v1';

// Gap sirf 45-din ki live window se nikalta hai (store.js), isliye 44 se upar threshold bekaar hai
export const LIMITS = { warnMin: 1, warnMax: 43, dangerMax: 44 };

// Rang preset hain (free colour picker nahi) — har ek dono themes mein tune kiya hua, taaki contrast kabhi kharab na ho
export const WARN_COLORS = ['yellow', 'amber', 'orange'];
export const DANGER_COLORS = ['red', 'rose', 'purple'];

export const DEFAULTS = Object.freeze({
  warnDays: 7,
  dangerDays: 14,
  warnColor: 'amber',
  dangerColor: 'red',
  showGapChip: true,
  showCategory: true,
  showDots: true,
});

let current = { ...DEFAULTS };

function toInt(v, fallback) {
  if (v === null || v === undefined || String(v).trim() === '') return fallback;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Kuch bhi aaye, hamesha valid settings object + kya badla gaya uski list. */
export function sanitize(raw = {}) {
  const notes = [];
  const out = { ...DEFAULTS };

  let warn = toInt(raw.warnDays, DEFAULTS.warnDays);
  const warnClamped = clamp(warn, LIMITS.warnMin, LIMITS.warnMax);
  if (warnClamped !== warn) notes.push(`Amber din ${LIMITS.warnMin}–${LIMITS.warnMax} ke beech hone chahiye, ${warnClamped} kar diya`);
  warn = warnClamped;

  let danger = toInt(raw.dangerDays, DEFAULTS.dangerDays);
  const dangerClamped = clamp(danger, warn + 1, LIMITS.dangerMax);
  if (dangerClamped !== danger) notes.push(`Red din amber (${warn}) se bade aur ${LIMITS.dangerMax} se kam hone chahiye, ${dangerClamped} kar diya`);
  danger = dangerClamped;

  out.warnDays = warn;
  out.dangerDays = danger;
  out.warnColor = WARN_COLORS.includes(raw.warnColor) ? raw.warnColor : DEFAULTS.warnColor;
  out.dangerColor = DANGER_COLORS.includes(raw.dangerColor) ? raw.dangerColor : DEFAULTS.dangerColor;
  for (const k of ['showGapChip', 'showCategory', 'showDots']) {
    out[k] = typeof raw[k] === 'boolean' ? raw[k] : DEFAULTS[k];
  }
  return { settings: out, notes };
}

export function getSettings() {
  return current;
}

/** Colour variables set karo — --c-* tokens theme ke hisaab se khud badalte hain. */
export function applySettings() {
  const root = document.documentElement;
  root.style.setProperty('--gap-warn', `var(--c-${current.warnColor})`);
  root.style.setProperty('--gap-danger', `var(--c-${current.dangerColor})`);
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode / storage full — is session ke liye settings phir bhi chalengi */
  }
}

export function loadSettings() {
  let raw = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    raw = {};
  }
  current = sanitize(raw).settings;
  applySettings();
  return current;
}

/** @returns {string[]} user ko dikhane layak notes (kuch auto-theek hua to) */
export function updateSettings(patch) {
  const { settings, notes } = sanitize({ ...current, ...patch });
  current = settings;
  applySettings();
  persist();
  return notes;
}

export function resetSettings() {
  current = { ...DEFAULTS };
  applySettings();
  persist();
}

/** gap (din) -> 'none' | 'warn' | 'danger' */
export function gapLevel(gap) {
  if (gap >= current.dangerDays) return 'danger';
  if (gap >= current.warnDays) return 'warn';
  return 'none';
}
