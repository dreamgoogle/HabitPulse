/**
 * Firebase initialisation.
 *
 * Purane code mein `__firebase_config` nam ka ek global padha ja raha tha jo
 * sirf Gemini Canvas sandbox mein exist karta hai. Real host par wo undefined
 * hota tha, isliye initFirebaseCloud() hamesha jaldi return ho jata tha aur
 * poora cloud layer chup-chaap dead rehta tha. Ab config build-time env se
 * aati hai, aur missing hone par hum loudly fail karte hain.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

const REGION = import.meta.env.VITE_FB_REGION || 'asia-south1';

const missing = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  throw new Error(
    `[HabitPulse] Firebase config adhoori hai: ${missing.join(', ')}. ` +
      '.env.example ko .env.local mein copy karke values bhariye.'
  );
}

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Session reload/app restart ke baad bhi bana rahe (TWA ke liye zaroori)
setPersistence(auth, browserLocalPersistence).catch((err) =>
  console.warn('[HabitPulse] Auth persistence set nahi ho payi:', err)
);

// Offline-first: network na ho to bhi app padh/likh sake
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});

export const fns = getFunctions(app, REGION);
