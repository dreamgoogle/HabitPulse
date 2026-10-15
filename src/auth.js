/**
 * Authentication — asli Google Sign-In.
 *
 * HATAYA GAYA (purane code se):
 *   - confirmInAppGoogleSignIn()  : ek nakli "Choose an account" modal jisme user
 *                                   koi bhi email type karke kisi ka bhi data khol
 *                                   sakta tha. Zero verification.
 *   - __performCredentialLogin()  : unsalted SHA-256 client-side, passHash ek
 *                                   publicly-readable Firestore doc mein, aur
 *                                   comparison bhi client par.
 *   - getCustomGoogleClientId()   : user se Client ID localStorage mein mangna.
 *   - quickSwitchAccount()        : arbitrary email se account switch.
 *
 * Ab sirf ek hi raasta hai: Google ID token → Firebase verify karta hai →
 * request.auth.uid milta hai → Firestore rules usi uid par data isolate karte hain.
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, fns } from './firebase.js';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

/** Popup block hone par redirect par girna chahiye — in error codes par. */
const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
]);

export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (POPUP_FALLBACK_CODES.has(err.code)) {
      // TWA / embedded WebView mein popup aksar block hota hai
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

export function logout() {
  return signOut(auth);
}

/**
 * Login ke baad user ki basic details capture karo (requirement #1).
 * Note: `role` yahan se kabhi set nahi hota — Firestore rules usse block karte
 * hain. Admin banane ka raasta sirf Cloud Function hai.
 */
async function upsertUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  const payload = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || (user.email || '').split('@')[0] || 'User',
    photoURL: user.photoURL || '',
    emailVerified: !!user.emailVerified,
    provider: user.providerData[0]?.providerId || 'google.com',
    lastLoginAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
    payload.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  }

  await setDoc(ref, payload, { merge: true });
  return snap.exists();
}

/**
 * App boot par ek baar call karo.
 * @param {(user: import('firebase/auth').User|null, meta: {isNewUser: boolean}) => void} onUser
 */
export async function initAuth(onUser) {
  // Redirect flow se wapas aaye ho to result yahan milta hai
  try {
    await getRedirectResult(auth);
  } catch (err) {
    console.warn('[HabitPulse] Redirect sign-in fail hua:', err.code || err);
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onUser(null, { isNewUser: false });
      return;
    }
    let existed = true;
    try {
      existed = await upsertUserProfile(user);
    } catch (err) {
      console.warn('[HabitPulse] Profile upsert fail hua:', err);
    }
    onUser(user, { isNewUser: !existed });
  });
}

/** Admin claim check — sirf UI gating ke liye. Asli gate rules + Functions hain. */
export async function isAdmin() {
  if (!auth.currentUser) return false;
  const token = await auth.currentUser.getIdTokenResult(true);
  return token.claims.admin === true;
}

/**
 * Google One Tap (optional). VITE_GOOGLE_CLIENT_ID set ho to hi chalega.
 * Yahan ID token Firebase ko jata hai jo use cryptographically verify karta hai —
 * purane code ki tarah bharose par email string nahi li jati.
 */
export function initGoogleOneTap() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId || auth.currentUser) return;
  if (!window.google?.accounts?.id) return;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async ({ credential }) => {
      try {
        await signInWithCredential(auth, GoogleAuthProvider.credential(credential));
      } catch (err) {
        console.warn('[HabitPulse] One Tap sign-in fail hua:', err);
      }
    },
    auto_select: true,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true,
  });
  window.google.accounts.id.prompt();
}

/**
 * Account deletion — Play Store ke liye mandatory hai.
 * Firestore ka recursive delete sirf Admin SDK kar sakta hai, isliye Cloud Function.
 */
export async function deleteMyAccount() {
  const call = httpsCallable(fns, 'deleteMyAccount');
  await call();
  await signOut(auth);
}
