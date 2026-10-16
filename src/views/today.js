/** Tab 1 — Today: hero ring, weekly bar chart, habit checklist. */
import { escapeHtml, setText, setHtml, $ } from '../utils/dom.js';
import { toDateKey, todayMidnight, DAY_SHORT } from '../utils/date.js';
import { getActiveStreak, getWeekDates, dayCompletion, rangeStats } from '../stats.js';
import { state } from '../state.js';
import { getHabits } from '../store.js';

const RING_CIRCUMFERENCE = 188.5;

export function renderHeader() {
  const today = todayMidnight();
  setText(
    'header-date-str',
    today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()
  );

  const week = getWeekDates(state.weekOffset);
  const habits = getHabits();

  setText(
    'week-range-lbl',
    state.weekOffset === 0
      ? 'This Week'
      : `${week[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ` +
        `${week[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
  );

  const nextBtn = $('next-week-btn');
  if (nextBtn) nextBtn.disabled = state.weekOffset >= 0;

  const todayKey = toDateKey(today);
  setHtml(
    'week-strip',
    week
      .map((d) => {
        const key = toDateKey(d);
        const future = d > today;
        const { done, total } = dayCompletion(habits, key);
        const dotCls =
          total > 0 && done === total ? ' done' : done > 0 ? ' partial' : '';
        const cls = ['day-pill', key === state.selectedDate ? 'selected' : key === todayKey ? 'today' : '']
          .filter(Boolean)
          .join(' ');

        return (
          `<button class="${cls}" data-action="select-date" data-date="${key}"${future ? ' disabled' : ''}>` +
          `<span class="day-name">${DAY_SHORT[d.getDay()]}</span>` +
          `<span class="day-num">${d.getDate()}</span>` +
          `<span class="day-dot${dotCls}"></span>` +
          `</button>`
        );
      })
      .join('')
  );
}

export function renderTodayTab() {
  const habits = getHabits();
  const week = getWeekDates(state.weekOffset);
  const sel = state.selectedDate;
  const { done, total, pct } = dayCompletion(habits, sel);

  // --- Hero ---
  const isToday = sel === toDateKey(todayMidnight());
  setText('hero-day-badge', isToday ? "Today's Progress" : `Progress — ${sel}`);
  setText(
    'hero-status-title',
    total === 0
      ? 'Pehla habit add kijiye'
      : pct === 100
        ? 'Perfect day! 🎉'
        : pct >= 50
          ? 'Keep the momentum!'
          : 'Chaliye shuru karte hain'
  );
  setText('hero-status-sub', `${done} of ${total} daily goals completed`);
  setText('progress-ring-pct', `${pct}%`);

  const ring = $('progress-ring-circle');
  if (ring) {
    ring.style.transition = 'stroke-dashoffset 420ms ease';
    ring.setAttribute('stroke-dashoffset', String(RING_CIRCUMFERENCE * (1 - pct / 100)));
  }

  // --- KPIs ---
  const bestStreak = habits.reduce((max, h) => Math.max(max, getActiveStreak(h)), 0);
  const wk = rangeStats(habits, week);
  setText('kpi-top-streak', `🔥 ${bestStreak}d`);
  setText('kpi-week-done', `✅ ${wk.logs}`);
  setText('kpi-week-rate', `📈 ${wk.rate}%`);
  setText('perfect-days-pill', `${wk.perfect} Perfect Days`);

  // --- Weekly bar chart ---
  setHtml(
    'weekly-bar-chart',
    week
      .map((d) => {
        const key = toDateKey(d);
        const c = dayCompletion(habits, key);
        const future = d > todayMidnight();
        const height = future ? 8 : Math.max(c.pct, 10);
        const fill = future || c.done === 0 ? ' empty' : c.pct === 100 ? ' perfect' : '';
        return (
          `<div class="bar-col${key === state.selectedDate ? ' active' : ''}"` +
          `${future ? '' : ` data-action="select-date" data-date="${key}"`}>` +
          `<span class="bar-ratio">${future ? '-' : `${c.done}/${c.total}`}</span>` +
          `<div class="bar-track"><div class="bar-fill${fill}" style="height:${height}%"></div></div>` +
          `<span class="bar-day">${DAY_SHORT[d.getDay()].charAt(0)}</span>` +
          `</div>`
        );
      })
      .join('')
  );

  // --- Checklist ---
  const filtered =
    state.category === 'All' ? habits : habits.filter((h) => h.category === state.category);

  if (!filtered.length) {
    setHtml(
      'habits-checklist',
      '<div class="card" style="text-align:center; color:var(--text-sub);">' +
        'Is category mein abhi koi habit nahi. <b>+ Add Goal</b> dabaiye!</div>'
    );
    return;
  }

  setHtml(
    'habits-checklist',
    filtered
      .map((hab) => {
        const on = !!hab.history?.[sel];
        const streak = getActiveStreak(hab);
        const goal = hab.weeklyGoal || 7;
        const dots = week
          .map((d) => `<span class="mini-dot${hab.history?.[toDateKey(d)] ? ' on' : ''}"></span>`)
          .join('');
        const weekDone = week.filter((d) => hab.history?.[toDateKey(d)]).length;
        const id = escapeHtml(hab.id);

        return (
          `<div class="habit-item${on ? ' completed' : ''}">` +
          `<div class="habit-left" data-action="toggle-habit" data-habit-id="${id}">` +
          `<div class="habit-icon">${escapeHtml(hab.emoji || '✅')}</div>` +
          `<div class="habit-info">` +
          `<div class="habit-name">${escapeHtml(hab.name)}</div>` +
          `<div class="habit-meta">` +
          `<span class="streak-tag">🔥 ${streak}d streak</span>` +
          `<span>• ${weekDone}/${goal} wk</span>` +
          `<span>• ${escapeHtml(hab.category || '')}</span>` +
          `</div>` +
          `<div class="mini-dots">${dots}</div>` +
          `</div></div>` +
          `<div class="habit-actions">` +
          `<button class="del-btn" data-action="delete-habit" data-habit-id="${id}" title="Delete Habit">🗑️</button>` +
          `<button class="check-btn${on ? ' done' : ''}" data-action="toggle-habit" ` +
          `data-habit-id="${id}" aria-label="${escapeHtml(hab.name)} done">${on ? '✓' : ''}</button>` +
          `</div></div>`
        );
      })
      .join('')
  );
}

export function renderLeaderboard() {
  const habits = getHabits();
  const ranked = habits
    .map((h) => ({
      id: h.id,
      name: h.name,
      emoji: h.emoji,
      active: getActiveStreak(h),
      best: Math.max(getActiveStreak(h), bestOf(h)),
    }))
    .sort((a, b) => b.active - a.active || b.best - a.best);

  setHtml(
    'leaderboard-list',
    ranked.length
      ? ranked
          .map(
            (item) =>
              `<div class="habit-item">` +
              `<div class="habit-left" style="cursor:default;">` +
              `<div class="habit-icon">${escapeHtml(item.emoji || '✅')}</div>` +
              `<div class="habit-info">` +
              `<div class="habit-name">${escapeHtml(item.name)}</div>` +
              `<div class="habit-meta">Best Streak: <b>${item.best} days</b></div>` +
              `</div></div>` +
              `<span class="badge-pill" style="background:rgba(245,158,11,0.16); color:var(--amber);">` +
              `🔥 ${item.active}d active</span></div>`
          )
          .join('')
      : '<div class="card" style="text-align:center; color:var(--text-sub);">Abhi koi habit nahi.</div>'
  );
}

function bestOf(habit) {
  const keys = Object.keys(habit.history || {}).sort();
  if (!keys.length) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < keys.length; i++) {
    const gap = Math.round((new Date(keys[i]) - new Date(keys[i - 1])) / 864e5);
    run = gap === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}
