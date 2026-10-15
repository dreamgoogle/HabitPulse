/**
 * HabitPulse Cloud Functions
 *
 * Yahan wahi kaam hain jo client par karna surakshit nahi:
 *   - exportHabits      : server-side data se range export (client ko poora
 *                         history download karne ki zaroorat nahi)
 *   - deleteMyAccount   : recursive delete + Auth user delete (Play Store mandatory)
 *   - setAdminRole      : custom claim — sirf maujooda admin hi de sakta hai
 *   - adminOverview     : aggregated stats, har user doc scan kiye bina
 *   - aggregateDailyStats / pruneOrphanLogKeys : scheduled maintenance
 *
 * Har callable sabse pehle req.auth check karta hai. Rules client ko rokte hain,
 * ye checks Functions ko rokte hain — dono layers chahiye.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

const db = admin.firestore();
const { FieldPath, FieldValue } = admin.firestore;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Pehle sign in kijiye.');
  return req.auth.uid;
}

function requireAdmin(req) {
  requireAuth(req);
  if (req.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Sirf admin ke liye.');
  }
  return req.auth.uid;
}

const dateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const PERIOD_DAYS = { month: 30, '3months': 92, '6months': 183, year: 365 };

/* ------------------------------------------------------------------ *
 * exportHabits — 1M / 3M / 6M / 12M / custom range
 * ------------------------------------------------------------------ */

exports.exportHabits = onCall(async (req) => {
  const uid = requireAuth(req);
  const { period = 'month', startKey, endKey } = req.data || {};

  let start;
  let end = new Date();

  if (period === 'custom') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endKey || '')) {
      throw new HttpsError('invalid-argument', 'startKey aur endKey YYYY-MM-DD hone chahiye.');
    }
    start = new Date(startKey);
    end = new Date(endKey);
    const span = (end - start) / 864e5;
    if (span < 0) throw new HttpsError('invalid-argument', 'End date start se pehle hai.');
    if (span > 1100) throw new HttpsError('invalid-argument', 'Range 3 saal se zyada nahi ho sakti.');
  } else {
    const days = PERIOD_DAYS[period];
    if (!days) throw new HttpsError('invalid-argument', `Unknown period: ${period}`);
    start = new Date(Date.now() - days * 864e5);
  }

  const [habitsSnap, logsSnap] = await Promise.all([
    db.collection(`users/${uid}/habits`).orderBy('order').get(),
    db
      .collection(`users/${uid}/logs`)
      .where(FieldPath.documentId(), '>=', dateKey(start))
      .where(FieldPath.documentId(), '<=', dateKey(end))
      .get(),
  ]);

  const habits = habitsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const logs = Object.fromEntries(logsSnap.docs.map((d) => [d.id, d.data().completed || {}]));

  const header = [
    'Date',
    'Day',
    ...habits.map((h) => `${h.emoji || ''} ${h.name}`.trim()),
    'Completed',
    'Total Habits',
    'Completion %',
  ];

  const rows = [];
  let totalLogs = 0;
  const cursor = new Date(end);

  while (cursor >= start) {
    const key = dateKey(cursor);
    const done = logs[key] || {};
    const cells = habits.map((h) => (done[h.id] ? 1 : 0));
    const sum = cells.reduce((a, b) => a + b, 0);
    totalLogs += sum;

    rows.push([
      key,
      cursor.toLocaleDateString('en-US', { weekday: 'short' }),
      ...cells,
      sum,
      habits.length,
      habits.length ? Math.round((sum / habits.length) * 100) : 0,
    ]);
    cursor.setDate(cursor.getDate() - 1);
  }

  const possible = rows.length * habits.length;

  return {
    header,
    rows,
    meta: {
      startKey: dateKey(start),
      endKey: dateKey(end),
      daysCount: rows.length,
      habitCount: habits.length,
      totalLogs,
      rate: possible ? Math.round((totalLogs / possible) * 100) : 0,
      generatedAt: Date.now(),
    },
  };
});

/* ------------------------------------------------------------------ *
 * deleteMyAccount — Play Store ke liye mandatory
 * ------------------------------------------------------------------ */

exports.deleteMyAccount = onCall(async (req) => {
  const uid = requireAuth(req);

  for (const sub of ['habits', 'logs']) {
    await db.recursiveDelete(db.collection(`users/${uid}/${sub}`));
  }
  await db.doc(`users/${uid}`).delete();
  await admin.auth().deleteUser(uid);

  return { deleted: true, uid };
});

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

exports.setAdminRole = onCall(async (req) => {
  requireAdmin(req);
  const { targetUid, isAdmin: makeAdmin } = req.data || {};
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid chahiye.');
  if (targetUid === req.auth.uid && makeAdmin === false) {
    throw new HttpsError('failed-precondition', 'Khud ka admin access nahi hata sakte.');
  }

  await admin.auth().setCustomUserClaims(targetUid, { admin: !!makeAdmin });
  await db.doc(`users/${targetUid}`).set({ role: makeAdmin ? 'admin' : 'user' }, { merge: true });

  return { ok: true, targetUid, isAdmin: !!makeAdmin };
});

exports.adminOverview = onCall(async (req) => {
  requireAdmin(req);

  const dayAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 864e5);
  const weekAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 864e5);

  // count() aggregation — har doc padhe bina sirf ginti
  const [total, dau, wau, newToday] = await Promise.all([
    db.collection('users').count().get(),
    db.collection('users').where('lastLoginAt', '>=', dayAgo).count().get(),
    db.collection('users').where('lastLoginAt', '>=', weekAgo).count().get(),
    db.collection('users').where('createdAt', '>=', dayAgo).count().get(),
  ]);

  const trendSnap = await db
    .collection('admin_stats')
    .orderBy(FieldPath.documentId(), 'desc')
    .limit(30)
    .get();

  return {
    live: {
      totalUsers: total.data().count,
      dau: dau.data().count,
      wau: wau.data().count,
      newToday: newToday.data().count,
    },
    trend: trendSnap.docs.map((d) => d.data()).reverse(),
  };
});

/** Recent users list — pagination ke saath, PII minimal. */
exports.adminListUsers = onCall(async (req) => {
  requireAdmin(req);
  const { limit = 25, startAfterUid = null } = req.data || {};
  const capped = Math.min(Number(limit) || 25, 100);

  let q = db.collection('users').orderBy('createdAt', 'desc').limit(capped);
  if (startAfterUid) {
    const cursorDoc = await db.doc(`users/${startAfterUid}`).get();
    if (cursorDoc.exists) q = q.startAfter(cursorDoc);
  }

  const snap = await q.get();
  return {
    users: snap.docs.map((d) => {
      const u = d.data();
      return {
        uid: d.id,
        email: u.email,
        displayName: u.displayName,
        photoURL: u.photoURL,
        role: u.role || 'user',
        createdAt: u.createdAt?.toMillis?.() ?? null,
        lastLoginAt: u.lastLoginAt?.toMillis?.() ?? null,
      };
    }),
    nextCursor: snap.docs.length === capped ? snap.docs[snap.docs.length - 1].id : null,
  };
});

/* ------------------------------------------------------------------ *
 * Scheduled maintenance
 * ------------------------------------------------------------------ */

exports.aggregateDailyStats = onSchedule(
  { schedule: '0 1 * * *', timeZone: 'Asia/Kolkata' },
  async () => {
    const today = dateKey(new Date());
    const dayAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 864e5);

    const [total, dau, newUsers] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('users').where('lastLoginAt', '>=', dayAgo).count().get(),
      db.collection('users').where('createdAt', '>=', dayAgo).count().get(),
    ]);

    await db.doc(`admin_stats/${today}`).set({
      date: today,
      totalUsers: total.data().count,
      dau: dau.data().count,
      newSignups: newUsers.data().count,
      computedAt: FieldValue.serverTimestamp(),
    });
  }
);

/**
 * Habit delete hone par purane log docs mein uski key reh jati hai.
 * Render par asar nahi padta, par data saaf rakhna behtar hai.
 */
exports.pruneOrphanLogKeys = onSchedule(
  { schedule: '30 2 * * 0', timeZone: 'Asia/Kolkata', timeoutSeconds: 540 },
  async () => {
    const users = await db.collection('users').select().get();

    for (const userDoc of users.docs) {
      const uid = userDoc.id;
      const habitsSnap = await db.collection(`users/${uid}/habits`).select().get();
      const liveIds = new Set(habitsSnap.docs.map((d) => d.id));
      if (!liveIds.size) continue;

      const logsSnap = await db.collection(`users/${uid}/logs`).get();
      let batch = db.batch();
      let ops = 0;

      for (const logDoc of logsSnap.docs) {
        const completed = logDoc.data().completed || {};
        const orphans = Object.keys(completed).filter((id) => !liveIds.has(id));
        if (!orphans.length) continue;

        const patch = {};
        orphans.forEach((id) => {
          patch[`completed.${id}`] = FieldValue.delete();
        });
        batch.update(logDoc.ref, patch);

        if (++ops >= 400) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops) await batch.commit();
    }
  }
);
