/**
 * Data layer.
 *
 * PURANA MODEL (tha):
 *   ek hi Firestore doc, jisme poora habits array ek STRING field `habitsJson`
 *   mein thunsa hua tha, aur har habit ke andar uska `history` map tha.
 *   Problems: 1 MiB doc limit, har toggle par poora blob rewrite, aur
 *   date-range query server-side namumkin.
 *
 * NAYA MODEL:
 *   /users/{uid}/habits/{habitId}   → sirf metadata (name, emoji, goal...)
 *   /users/{uid}/logs/{YYYY-MM-DD}  → { date, completed: { habitId: true } }
 *
 *   Ek din = ek doc. Toggle karne par sirf ek chhota doc likhta hai, aur
 *   3/6/12-month export ek saaf documentId() range query ban jata hai.
 *
 * In-memory shape jaan-boojh kar purani jaisi rakhi gayi hai
 * (habits[].history[dateKey] = true) taaki poora render layer bina badle chale.
 */
import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  setDoc,
  updateDoc,
  deleteField,
  writeBatch,
  documentId,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { toDateKey, addDays } from './utils/date.js';

const GUEST_KEY = 'habitpulse_guest_v3';
const REALTIME_WINDOW_DAYS = 45; // itne recent din live sync hote hain

let uid = null;
let habits = [];
let loadedRanges = []; // [{start, end}] — kaunse log windows memory mein aa chuke
let unsubHabits = null;
let unsubLogs = null;
let onChange = () => {};

export const isGuest = () => uid === null;
export const getHabits = () => habits;

/* ------------------------------------------------------------------ *
 * Guest mode (sign-in se pehle app usable rahe)
 * ------------------------------------------------------------------ */

function readGuest() {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeGuest() {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ habits }));
  } catch {
    /* private mode / quota — chup-chaap ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Session lifecycle
 * ------------------------------------------------------------------ */

export function detach() {
  if (unsubHabits) unsubHabits();
  if (unsubLogs) unsubLogs();
  unsubHabits = null;
  unsubLogs = null;
  loadedRanges = [];
}

export function startGuestSession(notify) {
  detach();
  uid = null;
  onChange = notify || (() => {});
  habits = readGuest()?.habits ?? [];
  onChange();
}

export async function startCloudSession(userId, notify) {
  detach();
  uid = userId;
  onChange = notify || (() => {});
  habits = [];

  // 1. Habits collection — realtime
  unsubHabits = onSnapshot(
    query(collection(db, 'users', uid, 'habits'), orderBy('order', 'asc')),
    (snap) => {
      const byId = new Map(habits.map((h) => [h.id, h.history]));
      habits = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        history: byId.get(d.id) || {}, // logs alag se aate hain
      }));
      onChange();
    },
    (err) => console.warn('[HabitPulse] habits listener:', err)
  );

  // 2. Recent logs — realtime
  const from = toDateKey(addDays(new Date(), -REALTIME_WINDOW_DAYS));
  unsubLogs = onSnapshot(
    query(collection(db, 'users', uid, 'logs'), where(documentId(), '>=', from)),
    (snap) => {
      snap.docs.forEach((d) => applyLogDoc(d.id, d.data()));
      onChange();
    },
    (err) => console.warn('[HabitPulse] logs listener:', err)
  );

  markRangeLoaded(from, toDateKey(new Date()));
}

function applyLogDoc(dateKey, data) {
  const completed = data?.completed || {};
  habits.forEach((h) => {
    if (completed[h.id]) h.history[dateKey] = true;
    else delete h.history[dateKey];
  });
}

/* ------------------------------------------------------------------ *
 * On-demand history loading (purane mahine kholne par)
 * ------------------------------------------------------------------ */

function markRangeLoaded(start, end) {
  loadedRanges.push({ start, end });
}

function isRangeLoaded(start, end) {
  return loadedRanges.some((r) => r.start <= start && r.end >= end);
}

export async function ensureLogsLoaded(startKey, endKey) {
  if (isGuest() || isRangeLoaded(startKey, endKey)) return;

  const snap = await getDocs(
    query(
      collection(db, 'users', uid, 'logs'),
      where(documentId(), '>=', startKey),
      where(documentId(), '<=', endKey)
    )
  );
  snap.docs.forEach((d) => applyLogDoc(d.id, d.data()));
  markRangeLoaded(startKey, endKey);
  onChange();
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

export async function toggleHabit(habitId, dateKey) {
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) return;

  const nowOn = !habit.history[dateKey];
  if (nowOn) habit.history[dateKey] = true;
  else delete habit.history[dateKey];
  onChange();

  if (isGuest()) {
    writeGuest();
    return;
  }

  const ref = doc(db, 'users', uid, 'logs', dateKey);
  try {
    await setDoc(
      ref,
      {
        date: dateKey,
        completed: { [habitId]: nowOn ? true : deleteField() },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    // Rollback — UI aur server ka state alag na ho jaye
    if (nowOn) delete habit.history[dateKey];
    else habit.history[dateKey] = true;
    onChange();
    throw err;
  }
}

export async function addHabit({ name, category, emoji, weeklyGoal }) {
  const id = `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    name: String(name).slice(0, 36),
    category,
    emoji,
    weeklyGoal: Number(weeklyGoal) || 5,
    archived: false,
    order: habits.length,
  };

  habits.push({ id, ...record, history: {} });
  onChange();

  if (isGuest()) {
    writeGuest();
    return id;
  }
  await setDoc(doc(db, 'users', uid, 'habits', id), {
    ...record,
    createdAt: serverTimestamp(),
  });
  return id;
}

export async function deleteHabit(habitId) {
  habits = habits.filter((h) => h.id !== habitId);
  onChange();

  if (isGuest()) {
    writeGuest();
    return;
  }
  await deleteDoc(doc(db, 'users', uid, 'habits', habitId));
  // Note: purane log docs mein is habit ki key reh jati hai. Wo harmless hai
  // (render sirf maujooda habits par chalta hai) aur cleanup nightly Cloud
  // Function `pruneOrphanLogKeys` karta hai.
}

export async function renameHabit(habitId, name) {
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) return;
  habit.name = String(name).slice(0, 36);
  onChange();
  if (isGuest()) return writeGuest();
  await updateDoc(doc(db, 'users', uid, 'habits', habitId), { name: habit.name });
}

/* ------------------------------------------------------------------ *
 * Migration: purana localStorage blob → naya cloud model
 * ------------------------------------------------------------------ */

const LEGACY_KEYS = ['habitpulse_standalone_v2', GUEST_KEY];
const MIGRATED_FLAG = 'habitpulse_migrated_v3';

export function hasLegacyData() {
  if (localStorage.getItem(MIGRATED_FLAG)) return false;
  return LEGACY_KEYS.some((k) => {
    try {
      const raw = localStorage.getItem(k);
      return raw && Array.isArray(JSON.parse(raw)?.habits) && JSON.parse(raw).habits.length;
    } catch {
      return false;
    }
  });
}

/**
 * writeBatch ki limit 500 ops hai, aur 10 habits x 365 din us se upar jata hai —
 * isliye chunks mein commit karte hain.
 */
export async function migrateLegacyToCloud(userId) {
  let legacy = null;
  for (const k of LEGACY_KEYS) {
    try {
      const parsed = JSON.parse(localStorage.getItem(k) || 'null');
      if (Array.isArray(parsed?.habits) && parsed.habits.length) {
        legacy = parsed.habits;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (!legacy) return { habits: 0, days: 0 };

  const ops = [];
  const logsByDate = {};

  legacy.forEach((h, i) => {
    const id = h.id || `h_legacy_${i}`;
    ops.push({
      ref: doc(db, 'users', userId, 'habits', id),
      data: {
        name: String(h.name || 'Habit').slice(0, 36),
        category: h.category || 'Health',
        emoji: h.emoji || '✅',
        weeklyGoal: Number(h.weeklyGoal) || 5,
        archived: false,
        order: i,
        createdAt: serverTimestamp(),
      },
    });
    Object.keys(h.history || {}).forEach((dateKey) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
      (logsByDate[dateKey] ||= {})[id] = true;
    });
  });

  Object.entries(logsByDate).forEach(([dateKey, completed]) => {
    ops.push({
      ref: doc(db, 'users', userId, 'logs', dateKey),
      data: { date: dateKey, completed, updatedAt: serverTimestamp() },
    });
  });

  const CHUNK = 400; // 500 ki hard limit se safe margin
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + CHUNK).forEach((op) => batch.set(op.ref, op.data, { merge: true }));
    await batch.commit();
  }

  localStorage.setItem(MIGRATED_FLAG, new Date().toISOString());
  return { habits: legacy.length, days: Object.keys(logsByDate).length };
}
