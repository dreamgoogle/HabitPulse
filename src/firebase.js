/**
 * Firebase initialisation.
 *
 * Purane code mein `__firebase_config` nam ka ek global padha ja raha tha jo
 * sirf Gemini Canvas sandbox mein exist karta hai. Real host par wo undefined
 * hota tha, isliye initFirebaseCloud() hamesha jaldi return ho jata tha aur
 * poora cloud layer chup-chaap dead rehta tha. Ab config build-time env se
 * aati hai, aur missing hone par hum loudly fail karte hain.
 *
 * DO MODE:
 *   1. Emulator mode  (VITE_USE_EMULATORS=true) — local testing, koi cloud
 *      project ya billing nahi chahiye. Config dummy hoti hai.
 *   2. Cloud mode     — asli Firebase project, .env.local se config.
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';
const REGION = import.meta.env.VITE_FB_REGION || 'asia-south1';

/**
 * Emulator mode mein config ki values asli nahi hoti — emulators inhe verify
 * nahi karte. Sirf projectId matter karta hai (emulator data usi ke neeche
 * rehta hai), aur apiKey ka non-empty hona SDK ke liye zaroori hai.
 */
const EMULATOR_CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: 'localhost',
  projectId: import.meta.env.VITE_FB_PROJECT_ID || 'habitpulse-local',
  storageBucket: 'demo.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:demo',
};

const CLOUD_CONFIG = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

const firebaseConfig = USE_EMULATORS ? EMULATOR_CONFIG : CLOUD_CONFIG;

if (!USE_EMULATORS) {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(
      `[HabitPulse] Firebase config adhoori hai: ${missing.join(', ')}.\n` +
        'Do raaste hain:\n' +
        '  1. Local testing — .env.local mein VITE_USE_EMULATORS=true likhiye, ' +
        'phir `npm run dev:emulators` chalaiye (koi cloud project nahi chahiye)\n' +
        '  2. Asli project — .env.example ko .env.local mein copy karke values bhariye'
    );
  }
}

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Emulator mode mein persistent cache jaan-boojh kar band hai: emulator ka data
// restart par reset hota hai, par browser ka IndexedDB cache nahi — isse testing
// ke waqt purana data "bhoot" ki tarah dikhta rehta hai.
export const db = USE_EMULATORS
  ? initializeFirestore(app, {})
  : initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
    });

export const fns = getFunctions(app, REGION);

if (USE_EMULATORS) {
  const host = import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(fns, host, 5001);
  console.info(
    `%c[HabitPulse] EMULATOR MODE — ${host} (auth:9099, firestore:8080, functions:5001)`,
    'background:#f59e0b; color:#000; padding:2px 6px; border-radius:4px; font-weight:700'
  );
} else {
  // Session reload/app restart ke baad bhi bana rahe (TWA ke liye zaroori).
  // Emulator mode mein ye skip hai — har test run saaf state se shuru ho.
  setPersistence(auth, browserLocalPersistence).catch((err) =>
    console.warn('[HabitPulse] Auth persistence set nahi ho payi:', err)
  );
}
