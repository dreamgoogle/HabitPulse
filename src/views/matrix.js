/** Tab 2 — 7-day habit matrix. */
import { escapeHtml, setHtml } from '../utils/dom.js';
import { toDateKey, todayMidnight, DAY_SHORT } from '../utils/date.js';
import { getWeekDates } from '../stats.js';
import { state } from '../state.js';
import { getHabits } from '../store.js';

export function renderMatrixTab() {
  const habits = getHabits();
  const week = getWeekDates(state.weekOffset);
  const todayKey = toDateKey(todayMidnight());

  setHtml(
    'matrix-head-row',
    '<th class="matrix-habit-cell">Habit</th>' +
      week
        .map(
          (d) =>
            `<th class="${toDateKey(d) === todayKey ? 'is-today' : ''}">` +
            `<div>${DAY_SHORT[d.getDay()]}</div><div style="font-size:9px; opacity:0.75;">${d.getDate()}</div></th>`
        )
        .join('')
  );

  if (!habits.length) {
    setHtml(
      'matrix-body-rows',
      `<tr><td colspan="8" style="text-align:center; padding:18px; color:var(--text-sub);">` +
        `Abhi koi habit nahi.</td></tr>`
    );
    return;
  }

  setHtml(
    'matrix-body-rows',
    habits
      .map((hab) => {
        const cells = week
          .map((d) => {
            const key = toDateKey(d);
            const on = !!hab.history?.[key];
            const future = d > todayMidnight();
            return (
              `<td><button class="matrix-toggle${on ? ' done' : ''}" ` +
              `data-action="toggle-habit" data-habit-id="${escapeHtml(hab.id)}" data-date="${key}" ` +
              `${future ? 'disabled' : ''} aria-label="${escapeHtml(hab.name)} ${key}">` +
              `${on ? '✓' : ''}</button></td>`
            );
          })
          .join('');

        return (
          `<tr><td class="matrix-habit-cell">` +
          `<div style="font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">` +
          `${escapeHtml(hab.emoji || '')} ${escapeHtml(hab.name)}</div></td>${cells}</tr>`
        );
      })
      .join('')
  );
}
