/** UI state (data nahi — data store.js mein hai). */
import { todayMidnight, toDateKey } from './utils/date.js';

export const state = {
  tab: 'today', // today | matrix | month | sheets
  category: 'All',
  weekOffset: 0,
  monthOffset: 0,
  selectedDate: toDateKey(todayMidnight()),
  exportPeriod: 'month', // month | 3months | 6months | year | custom
  exportStart: '',
  exportEnd: '',
  pickedEmoji: '✅',
  user: null,
  syncing: false,
};

export const EMOJIS = [
  '💧', '🏃', '📖', '💻', '🧘', '🥗', '😴', '🚭',
  '💊', '🎯', '✍️', '🎸', '🧹', '💰', '☎️', '🌱',
  '🏋️', '🚴', '🧠', '✅',
];

export const CATEGORIES = ['All', 'Health', 'Fitness', 'Mind', 'Work'];
