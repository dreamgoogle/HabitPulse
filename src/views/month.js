/** Tab 3 — monthly heatmap, day inspector, per-habit consistency. */
import { escapeHtml, setText, setHtml } from '../utils/dom.js';
import { toDateKey, todayMidnight, startOfMonth, endOfMonth } from '../utils/date.js';
import { dayCompletion, rangeStats } from '../stats.js';
import { state } from '../state.js';
import { getHabits, ensureLogsLoaded } from '../store.js';

function monthDate() {
  const now = todayMidnight();
  return new Date(now.getFullYear(), now.getMonth() + state.monthOffset, 1);
}

/** Purana mahina kholne par us range ke logs Firestore se le aao. */
export async function preloadMonth() {
  const base = monthDate();
  await ensureLogsLoaded(toDateKey(startOfMonth(base)), toDateKey(endOfMonth(base)));
}

export function renderMonthTab() {
  const habits = getHabits();
  const base = monthDate();
  const first = startOfMonth(base);
  const last = endOfMonth(base);
  const today = todayMidnight();

  setText('month-title', base.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
  setText('month-sub', 'Monthly Overview');

  const nextBtn = document.getElementById('next-month-btn');
  if (nextBtn) nextBtn.disabled = state.monthOffset >= 0;

  // Sirf beete hue din count karo — aane wale din rate neecha nahi dikhane chahiye
  const elapsed = [];
  for (let d = new Date(first); d <= last && d <= today; d.setDate(d.getDate() + 1)) {
    elapsed.push(new Date(d));
  }
  const stats = rangeStats(habits, elapsed);
  setText('m-kpi-logs', String(stats.logs));
  setText('m-kpi-perfect', String(stats.perfect));
  setText('m-kpi-rate', `${stats.rate}%`);

  // Monday-start grid
  const leadBlanks = (first.getDay() + 6) % 7;
  let cells = '<div></div>'.repeat(leadBlanks);

  for (let day = 1; day <= last.getDate(); day++) {
    const d = new Date(base.getFullYear(), base.getMonth(), day);
    const key = toDateKey(d);
    const { pct } = dayCompletion(habits, key);
    const future = d > today;
    const level = future ? 0 : habits.length && pct === 100 ? 4 : pct >= 70 ? 3 : pct >= 40 ? 2 : pct > 0 ? 1 : 0;

    cells +=
      `<button class="cal-cell${level ? ` lvl-${level}` : ''}${key === state.selectedDate ? ' selected' : ''}" ` +
      `data-action="select-date" data-date="${key}"${future ? ' disabled' : ''}>${day}</button>`;
  }
  setHtml('month-cal-grid', cells);

  renderInspector(habits);
  renderHabitBars(habits, elapsed.length);
}

function renderInspector(habits) {
  const key = state.selectedDate;
  const { done, total } = dayCompletion(habits, key);

  setText(
    'inspector-date-lbl',
    new Date(`${key}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  );
  setText('inspector-count-badge', `${done}/${total} Done`);

  setHtml(
    'inspector-chips',
    habits.length
      ? habits
          .map((h) => {
            const on = !!h.history?.[key];
            return (
              `<button class="inspector-chip${on ? ' done' : ''}" data-action="toggle-habit" ` +
              `data-habit-id="${escapeHtml(h.id)}" data-date="${key}">` +
              `<span>${escapeHtml(h.emoji || '')}</span><span>${escapeHtml(h.name)}</span>` +
              `${on ? '<span>✓</span>' : ''}</button>`
            );
          })
          .join('')
      : '<span style="font-size:12px; color:var(--text-sub);">Koi habit nahi.</span>'
  );
}

function renderHabitBars(habits, elapsedDays) {
  const base = monthDate();
  const prefix = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;

  setHtml(
    'month-habit-bars',
    habits.length
      ? habits
          .map((h) => {
            const count = Object.keys(h.history || {}).filter((k) => k.startsWith(prefix)).length;
            const pct = elapsedDays ? Math.round((count / elapsedDays) * 100) : 0;
            return (
              `<div class="progress-row">` +
              `<div class="progress-top">` +
              `<span>${escapeHtml(h.emoji || '')} ${escapeHtml(h.name)} ` +
              `<span style="font-weight:500; color:var(--text-sub);">(${count}/${elapsedDays}d)</span></span>` +
              `<span style="color:var(--brand-light);">${pct}%</span></div>` +
              `<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>` +
              `</div>`
            );
          })
          .join('')
      : '<div style="font-size:12px; color:var(--text-sub); text-align:center;">Koi habit nahi.</div>'
  );
}
