/**
 * HabitPulse — app entry point.
 *
 * Purane index.html mein 1600+ lines ka ek inline <script> tha jisme 60+
 * functions `window.*` par chipkaye gaye the (taaki inline onclick se chal
 * sakein). Ab saara wiring yahan ek jagah hai, aur clicks event delegation
 * se handle hote hain — `window` namespace poora saaf hai.
 */
import './styles.css';
import { initAuth, signInWithGoogle, logout, deleteMyAccount, initGoogleOneTap } from './auth.js';
import {
  startGuestSession,
  startCloudSession,
  getHabits,
  toggleHabit,
  addHabit,
  deleteHabit,
  updateHabit,
  hasLegacyData,
  migrateLegacyToCloud,
  isGuest,
} from './store.js';
import { state, EMOJIS } from './state.js';
import { escapeHtml, setText, setHtml, show, hide, $, toast, delegate } from './utils/dom.js';
import { toDateKey, todayMidnight } from './utils/date.js';
import { renderHeader, renderTodayTab, renderLeaderboard } from './views/today.js';
import { renderMatrixTab } from './views/matrix.js';
import { renderMonthTab, preloadMonth } from './views/month.js';
import {
  renderSheetsTab,
  handleDownloadCSV,
  handleCopyTSV,
  handleGoogleSheet,
} from './views/sheets.js';

/* ------------------------------------------------------------------ *
 * Render orchestration
 * ------------------------------------------------------------------ */

let renderQueued = false;

function render() {
  // Ek frame mein kai store updates aa sakte hain — ek hi baar render karo
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderHeader();
    renderAuthUI();
    if (state.tab === 'today') renderTodayTab();
    else if (state.tab === 'matrix') {
      renderMatrixTab();
      renderLeaderboard();
    } else if (state.tab === 'month') renderMonthTab();
    else if (state.tab === 'sheets') renderSheetsTab();
  });
}

function renderAuthUI() {
  const u = state.user;
  const name = u?.displayName || 'Login / Sync';
  const initial = (u?.displayName || u?.email || '👤').trim().charAt(0).toUpperCase();

  setText('header-user-name', name);
  const badge = $('header-sync-badge');
  if (badge) {
    badge.textContent = u ? '☁️ Synced' : '📱 Local Mode';
    badge.classList.toggle('local', !u);
  }

  for (const id of ['header-user-avatar', 'modal-user-avatar']) {
    const avatar = $(id);
    if (!avatar) continue;
    if (u?.photoURL) {
      avatar.innerHTML = `<img src="${escapeHtml(u.photoURL)}" alt="" referrerpolicy="no-referrer">`;
    } else {
      avatar.textContent = u ? initial : '👤';
    }
  }

  setText('modal-user-title', u ? u.displayName || 'User' : 'Guest Profile');
  setText('modal-user-sub', u ? u.email || '' : 'Data sirf is device par hai');
  setText('modal-user-uid', u ? u.uid : 'guest-local');

  if (u) {
    hide('signed-out-box');
    show('signed-in-box');
  } else {
    show('signed-out-box');
    hide('signed-in-box');
  }
}

/* ------------------------------------------------------------------ *
 * Tabs & navigation
 * ------------------------------------------------------------------ */

const TABS = ['today', 'matrix', 'month', 'sheets'];

async function switchTab(tab) {
  state.tab = tab;
  TABS.forEach((t) => {
    $(`view-${t}`)?.classList.toggle('hidden', t !== tab);
    $(`nav-${t}`)?.classList.toggle('active', t === tab);
  });
  if (tab === 'month') await preloadMonth();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------------ *
 * Modals
 * ------------------------------------------------------------------ */

function openModal(id) {
  $(id)?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  $(id)?.classList.add('hidden');
  document.body.style.overflow = '';
}

/** Add aur Edit dono ek hi modal use karte hain. habitId null = naya habit. */
function openHabitModal(habitId) {
  const hab = habitId ? getHabits().find((h) => h.id === habitId) : null;
  state.editingId = hab ? hab.id : null;
  state.pickedEmoji = hab?.emoji || '✅';

  $('new-habit-name').value = hab ? hab.name : '';
  $('new-habit-cat').value = hab?.category || 'Health';
  $('new-habit-goal').value = String(hab?.weeklyGoal || 5);
  setText('habit-modal-title', hab ? 'Edit Habit' : 'Create New Daily Habit');
  setText('habit-save-btn', hab ? 'Save Changes' : 'Save Habit');

  renderEmojiPicker();
  openModal('add-modal');
}

function renderEmojiPicker() {
  setHtml(
    'emoji-grid',
    EMOJIS.map(
      (em) =>
        `<button type="button" class="emoji-choice${state.pickedEmoji === em ? ' selected' : ''}" ` +
        `data-action="pick-emoji" data-emoji="${em}">${em}</button>`
    ).join('')
  );
}

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

const THEME_KEY = 'habitpulse_theme';

function applyTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  const btn = $('theme-btn');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#ffffff' : '#4f46e5');
}

function toggleTheme() {
  applyTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
}

/* ------------------------------------------------------------------ *
 * Event wiring — ek hi delegated listener, inline onclick zero
 * ------------------------------------------------------------------ */

function wireEvents() {
  delegate(document.body, 'click', {
    'switch-tab': ({ tab }) => switchTab(tab),

    'select-date': ({ date }) => {
      state.selectedDate = date;
      render();
    },

    'shift-week': ({ delta }) => {
      state.weekOffset = Math.min(0, state.weekOffset + Number(delta));
      render();
    },

    'shift-month': async ({ delta }) => {
      state.monthOffset = Math.min(0, state.monthOffset + Number(delta));
      await preloadMonth();
      render();
    },

    'toggle-habit': async ({ habitId, date }) => {
      try {
        await toggleHabit(habitId, date || state.selectedDate);
      } catch (err) {
        toast(`Save fail: ${err.code || err.message}`);
      }
    },

    'delete-habit': async ({ habitId }) => {
      const h = getHabits().find((x) => x.id === habitId);
      if (!h || !confirm(`"${h.name}" delete karein? Iska poora history chala jayega.`)) return;
      try {
        await deleteHabit(habitId);
        toast('Habit delete ho gaya');
      } catch (err) {
        toast(`Delete fail: ${err.code || err.message}`);
      }
    },

    'set-category': ({ cat }) => {
      state.category = cat;
      document
        .querySelectorAll('.cat-btn')
        .forEach((b) => b.classList.toggle('active', b.dataset.cat === cat));
      render();
    },

    'set-period': ({ period }) => {
      state.exportPeriod = period;
      render();
    },

    'pick-emoji': ({ emoji }) => {
      state.pickedEmoji = emoji;
      renderEmojiPicker();
    },

    'open-add': () => openHabitModal(null),
    'edit-habit': ({ habitId }) => openHabitModal(habitId),
    'close-add': () => closeModal('add-modal'),

    'open-auth': () => openModal('auth-modal'),
    'close-auth': () => closeModal('auth-modal'),

    'toggle-theme': toggleTheme,

    'sign-in': async (_, el) => {
      const label = $('google-btn-label');
      if (label) label.textContent = '⏳ Connecting…';
      el.disabled = true;
      try {
        await signInWithGoogle();
      } catch (err) {
        console.error('[HabitPulse] sign-in:', err);
        toast(`Sign-in fail: ${err.code || err.message}`);
      } finally {
        el.disabled = false;
        if (label) label.textContent = 'Continue with Google';
      }
    },

    'sign-out': async () => {
      await logout();
      closeModal('auth-modal');
      toast('Sign out ho gaya');
    },

    'delete-account': async () => {
      const typed = prompt('Account permanently delete karne ke liye DELETE likhiye:');
      if (typed !== 'DELETE') return;
      try {
        await deleteMyAccount();
        toast('Account delete ho gaya');
        closeModal('auth-modal');
      } catch (err) {
        toast(`Delete fail: ${err.message || err.code}`);
      }
    },

    'download-csv': handleDownloadCSV,
    'copy-tsv': handleCopyTSV,
    'export-sheet': handleGoogleSheet,
  });

  // Add / Edit habit form
  $('add-habit-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = $('new-habit-name').value.trim();
    if (!name) return;
    const fields = {
      name,
      category: $('new-habit-cat').value,
      emoji: state.pickedEmoji,
      weeklyGoal: Number($('new-habit-goal').value),
    };
    const editing = state.editingId;
    try {
      if (editing) {
        await updateHabit(editing, fields);
      } else {
        await addHabit(fields);
      }
      state.editingId = null;
      $('new-habit-name').value = '';
      closeModal('add-modal');
      toast(editing ? '✅ Habit update ho gaya' : '✅ Habit add ho gaya');
    } catch (err) {
      toast(`${editing ? 'Update' : 'Add'} fail: ${err.code || err.message}`);
    }
  });

  // Custom export range
  ['exp-start', 'exp-end'].forEach((id) => {
    $(id)?.addEventListener('change', () => {
      state.exportStart = $('exp-start').value;
      state.exportEnd = $('exp-end').value;
      render();
    });
  });

  // Backdrop click se modal band
  document.querySelectorAll('.modal-backdrop').forEach((bd) => {
    bd.addEventListener('click', (ev) => {
      if (ev.target === bd) closeModal(bd.id);
    });
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => closeModal(m.id));
    }
  });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function boot() {
  try {
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  } catch {
    applyTheme('dark');
  }

  state.selectedDate = toDateKey(todayMidnight());
  wireEvents();
  renderEmojiPicker();
  startGuestSession(render);

  await initAuth(async (user, { isNewUser }) => {
    state.user = user;

    if (!user) {
      startGuestSession(render);
      return;
    }

    await startCloudSession(user.uid, render);

    // Pehli baar sign in kar rahe purane local users ka data bachao
    if (hasLegacyData()) {
      try {
        const res = await migrateLegacyToCloud(user.uid);
        if (res.habits) {
          toast(`☁️ ${res.habits} habits, ${res.days} din ka data cloud par aa gaya`);
        }
      } catch (err) {
        console.error('[HabitPulse] migration:', err);
        toast('Purana data migrate nahi ho paya — backup localStorage mein surakshit hai');
      }
    } else if (isNewUser) {
      toast(`Namaste ${user.displayName?.split(' ')[0] || ''}! Pehla habit add kijiye 🎯`);
    }
    render();
  });

  if (isGuest()) initGoogleOneTap();

  // Service worker — sirf production build mein
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('[HabitPulse] SW register fail:', err));
    });
  }
}

boot();
