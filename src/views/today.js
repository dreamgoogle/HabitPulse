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
        const { pct } = dayCompletion(habits, key);
        const classes = [
          'week-day',
          key === state.selectedDate ? 'selected' : '',
          key === todayKey ? 'is-today' : '',
          pct === 100 ? 'complete' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          `<button class="${classes}" data-action="select-date" data-date="${key}">` +
          `<span class="wd-name">${DAY_SHORT[d.getDay()]}</span>` +
          `<span class="wd-num">${d.getDate()}</span>` +
          `<span class="wd-dot" style="opacity:${pct / 100}"></span>` +
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
        return (
          `<div class="bar-col" data-action="select-date" data-date="${key}">` +
          `<div class="bar-track"><div class="bar-fill${c.pct === 100 ? ' full' : ''}" ` +
          `style="height:${future ? 0 : c.pct}%"></div></div>` +
          `<span class="bar-lbl">${DAY_SHORT[d.getDay()]}</span>` +
          `<span class="bar-val">${future ? '–' : c.done}</span>` +
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
        const weekDone = week.filter((d) => hab.history?.[toDateKey(d)]).length;
        const goal = hab.weeklyGoal || 7;
        const goalPct = Math.min(100, Math.round((weekDone / goal) * 100));

        return (
          `<div class="habit-row${on ? ' done' : ''}">` +
          `<button class="habit-check${on ? ' on' : ''}" data-action="toggle-habit" ` +
          `data-habit-id="${escapeHtml(hab.id)}" aria-label="${escapeHtml(hab.name)} toggle">` +
          `${on ? '✓' : ''}</button>` +
          `<div class="habit-main">` +
          `<div class="habit-name">${escapeHtml(hab.emoji || '')} ${escapeHtml(hab.name)}</div>` +
          `<div class="habit-sub">` +
          `<span class="habit-chip">${escapeHtml(hab.category || '')}</span>` +
          `<span>🔥 ${streak}d</span>` +
          `<span>${weekDone}/${goal} this week</span>` +
          `</div>` +
          `<div class="goal-track"><div class="goal-fill" style="width:${goalPct}%"></div></div>` +
          `</div>` +
          `<button class="habit-del" data-action="delete-habit" ` +
          `data-habit-id="${escapeHtml(hab.id)}" aria-label="Delete">✕</button>` +
          `</div>`
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
            (item, i) =>
              `<div class="habit-row">` +
              `<span class="lb-rank">${i + 1}</span>` +
              `<div class="habit-main">` +
              `<div class="habit-name">${escapeHtml(item.emoji || '')} ${escapeHtml(item.name)}</div>` +
              `<div class="habit-sub"><span>🔥 ${item.active}d active</span>` +
              `<span>🏆 ${item.best}d best</span></div>` +
              `</div></div>`
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
