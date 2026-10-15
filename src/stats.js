/** Streak aur completion calculations. */
import { toDateKey, addDays, todayMidnight, getMonday } from './utils/date.js';

/** Aaj (ya kal, agar aaj abhi tick nahi hua) se peeche ginte hue active streak. */
export function getActiveStreak(habit) {
  const history = habit.history || {};
  let cursor = todayMidnight();

  // Aaj abhi tick nahi hua to streak kal se gini jaye — din khatam nahi hua
  if (!history[toDateKey(cursor)]) cursor = addDays(cursor, -1);

  let streak = 0;
  while (history[toDateKey(cursor)]) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function getBestStreak(habit) {
  const keys = Object.keys(habit.history || {}).sort();
  if (!keys.length) return 0;

  let best = 1;
  let run = 1;
  for (let i = 1; i < keys.length; i++) {
    const prev = new Date(keys[i - 1]);
    const cur = new Date(keys[i]);
    const gapDays = Math.round((cur - prev) / 864e5);
    run = gapDays === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Diye gaye week (Monday-start) ke 7 din. */
export function getWeekDates(weekOffset = 0) {
  const monday = getMonday(addDays(todayMidnight(), weekOffset * 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function dayCompletion(habits, dateKey) {
  if (!habits.length) return { done: 0, total: 0, pct: 0 };
  const done = habits.filter((h) => h.history?.[dateKey]).length;
  return {
    done,
    total: habits.length,
    pct: Math.round((done / habits.length) * 100),
  };
}

export function rangeStats(habits, dates) {
  let logs = 0;
  let perfect = 0;
  dates.forEach((d) => {
    const { done, total } = dayCompletion(habits, toDateKey(d));
    logs += done;
    if (total && done === total) perfect++;
  });
  const possible = dates.length * habits.length;
  return {
    logs,
    perfect,
    rate: possible ? Math.round((logs / possible) * 100) : 0,
  };
}
