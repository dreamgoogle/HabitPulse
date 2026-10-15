/**
 * HabitPulse Admin panel.
 *
 * Ye alag Vite app hai aur alag hosting target par jata hai — admin ka code
 * main app ke bundle mein jana hi nahi chahiye.
 *
 * Yahan ka gate sirf UX hai. Asli security do jagah hai:
 *   1. Cloud Functions: requireAdmin() → req.auth.token.admin === true
 *   2. firestore.rules: isAdmin()
 * Browser mein JS badal kar is screen ko khol lena possible hai, par us se
 * koi data nahi milega — har call server par dobara check hoti hai.
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
});

const auth = getAuth(app);
const fns = getFunctions(app, import.meta.env.VITE_FB_REGION || 'asia-south1');

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"'`]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;',
  })[c]);

const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';

let cursor = null;

function showError(msg) {
  const el = $('error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() {
  $('error').classList.add('hidden');
}

async function loadOverview() {
  clearError();
  try {
    const { data } = await httpsCallable(fns, 'adminOverview')();
    $('k-total').textContent = data.live.totalUsers;
    $('k-dau').textContent = data.live.dau;
    $('k-wau').textContent = data.live.wau;
    $('k-new').textContent = data.live.newToday;
  } catch (err) {
    showError(`Overview load nahi hua: ${err.message || err.code}`);
  }
}

async function loadUsers(append = false) {
  try {
    const { data } = await httpsCallable(fns, 'adminListUsers')({
      limit: 25,
      startAfterUid: append ? cursor : null,
    });
    cursor = data.nextCursor;

    const rows = data.users
      .map(
        (u) =>
          `<tr>` +
          `<td>${esc(u.displayName || '—')}</td>` +
          `<td class="muted">${esc(u.email || '—')}</td>` +
          `<td><span class="badge ${u.role === 'admin' ? 'admin' : 'user'}">${esc(u.role)}</span></td>` +
          `<td class="muted">${fmtDate(u.createdAt)}</td>` +
          `<td class="muted">${fmtDate(u.lastLoginAt)}</td>` +
          `</tr>`
      )
      .join('');

    const tbody = $('users');
    if (append) tbody.insertAdjacentHTML('beforeend', rows);
    else tbody.innerHTML = rows || '<tr><td colspan="5" class="muted">Koi user nahi.</td></tr>';

    $('more').classList.toggle('hidden', !cursor);
  } catch (err) {
    showError(`User list load nahi hui: ${err.message || err.code}`);
  }
}

function showGate(msg) {
  $('gate').classList.remove('hidden');
  $('dash').classList.add('hidden');
  if (msg) $('gate-msg').textContent = msg;
}

async function showDash(user) {
  $('gate').classList.add('hidden');
  $('dash').classList.remove('hidden');
  $('who').textContent = `${user.displayName || ''} · ${user.email || ''}`;
  cursor = null;
  await Promise.all([loadOverview(), loadUsers(false)]);
}

$('gate-btn').addEventListener('click', async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    $('gate-msg').textContent = `Sign-in fail: ${err.code || err.message}`;
  }
});

$('signout').addEventListener('click', () => signOut(auth));
$('refresh').addEventListener('click', async () => {
  cursor = null;
  await Promise.all([loadOverview(), loadUsers(false)]);
});
$('more').addEventListener('click', () => loadUsers(true));

onAuthStateChanged(auth, async (user) => {
  if (!user) return showGate('Admin account se sign in kijiye.');

  // force refresh — custom claim abhi-abhi mila ho to purana token kaam nahi karega
  const token = await user.getIdTokenResult(true);
  if (token.claims.admin !== true) {
    await signOut(auth);
    return showGate('Is account ke paas admin access nahi hai.');
  }
  await showDash(user);
});
