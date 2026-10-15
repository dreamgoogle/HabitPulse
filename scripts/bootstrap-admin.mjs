/**
 * Pehla admin banane ke liye — sirf EK BAAR, apne computer par.
 *
 * Iske baad baaki admins `setAdminRole` Cloud Function se bante hain
 * (jisme requireAdmin() check hai). Ye script kabhi deploy mat kijiye.
 *
 * Chalane se pehle:
 *   1. Firebase Console → Project settings → Service accounts
 *      → "Generate new private key" → file ko serviceAccountKey.json naam se
 *        project root mein rakhiye (.gitignore mein already hai)
 *   2. Us email se app mein ek baar sign in kar lijiye (user exist karna chahiye)
 *
 * Chalaiye:
 *   node scripts/bootstrap-admin.mjs you@example.com
 *
 * Chalane ke BAAD serviceAccountKey.json delete kar dijiye.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile } from 'node:fs/promises';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/bootstrap-admin.mjs <email>');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(await readFile('./serviceAccountKey.json', 'utf8'));
} catch {
  console.error('❌ serviceAccountKey.json nahi mili. Upar wale steps dekhiye.');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });

try {
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, { admin: true });
  await getFirestore().doc(`users/${user.uid}`).set({ role: 'admin' }, { merge: true });

  console.log(`✅ ${email} ab admin hai (uid: ${user.uid})`);
  console.log('   Note: unhe ek baar sign out/in karna hoga — token refresh ke liye.');
  console.log('⚠️  Ab serviceAccountKey.json delete kar dijiye.');
  process.exit(0);
} catch (err) {
  if (err.code === 'auth/user-not-found') {
    console.error(`❌ ${email} ka account nahi mila. Pehle app mein ek baar sign in kijiye.`);
  } else {
    console.error('❌', err.message);
  }
  process.exit(1);
}
