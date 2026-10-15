/**
 * firestore.rules ke security tests.
 *
 * Ye file app ka asli security boundary test karti hai. Client code aur Cloud
 * Functions ke checks defence-in-depth hain — koi bhi unhe bypass kar ke seedha
 * Firestore REST API hit kar sakta hai. Tab sirf ye rules bachati hain.
 *
 * Chalaiye:  npm test
 * (emulator apne aap start/stop hota hai — koi live project ya Blaze plan nahi chahiye)
 *
 * Node ke built-in test runner par chalti hai, jaan-boojh kar: vitest@5 ko
 * vite@6+ chahiye, aur project vite@5 par hai. Ek test framework ke liye build
 * toolchain upgrade karna uchit nahi tha.
 */
import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'habitpulse-rules-test';

const ALICE = 'alice_uid';
const BOB = 'bob_uid';
const ADMIN = 'admin_uid';

const ALICE_EMAIL = 'alice@example.com';
const BOB_EMAIL = 'bob@example.com';
const ADMIN_EMAIL = 'admin@example.com';

let testEnv;

/** Emulator host — emulators:exec FIRESTORE_EMULATOR_HOST set kar deta hai. */
function emulatorTarget() {
  const raw = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const [host, port] = raw.split(':');
  return { host, port: Number(port) };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      ...emulatorTarget(),
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/* ------------------------------------------------------------------ *
 * Contexts
 * ------------------------------------------------------------------ */

const asAlice = () =>
  testEnv.authenticatedContext(ALICE, { email: ALICE_EMAIL }).firestore();
const asBob = () => testEnv.authenticatedContext(BOB, { email: BOB_EMAIL }).firestore();
const asAdmin = () =>
  testEnv.authenticatedContext(ADMIN, { email: ADMIN_EMAIL, admin: true }).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

/** Rules bypass kar ke seed data daalna. */
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}

const validHabit = (over = {}) => ({
  name: 'Drink water',
  category: 'Health',
  emoji: '💧',
  weeklyGoal: 7,
  archived: false,
  order: 0,
  ...over,
});

const validLog = (over = {}) => ({
  date: '2026-10-15',
  completed: { h1: true },
  ...over,
});

async function seedAlice() {
  await seed(async (db) => {
    await setDoc(doc(db, 'users', ALICE), {
      uid: ALICE,
      email: ALICE_EMAIL,
      displayName: 'Alice',
      role: 'user',
    });
    await setDoc(doc(db, 'users', ALICE, 'habits', 'h1'), validHabit());
    await setDoc(doc(db, 'users', ALICE, 'logs', '2026-10-15'), validLog());
  });
}

/* ================================================================== *
 * 1. Cross-user isolation — purane model ka sabse bada chhed
 *
 * Pehle sab kuch artifacts/{appId}/public/data/habitpulse_accounts/{key} par
 * tha, jahan key email se deterministically banti thi. Email jaante ho to doc
 * path jaante ho, aur collection public thi.
 * ================================================================== */

describe('cross-user isolation', () => {
  beforeEach(seedAlice);

  it('Bob, Alice ka profile nahi padh sakta', async () => {
    await assertFails(getDoc(doc(asBob(), 'users', ALICE)));
  });

  it('Bob, Alice ke habits nahi padh sakta', async () => {
    await assertFails(getDoc(doc(asBob(), 'users', ALICE, 'habits', 'h1')));
    await assertFails(getDocs(collection(asBob(), 'users', ALICE, 'habits')));
  });

  it('Bob, Alice ke logs nahi padh sakta', async () => {
    await assertFails(getDoc(doc(asBob(), 'users', ALICE, 'logs', '2026-10-15')));
    await assertFails(getDocs(collection(asBob(), 'users', ALICE, 'logs')));
  });

  it('Bob, Alice ke habits mein likh nahi sakta', async () => {
    await assertFails(
      setDoc(doc(asBob(), 'users', ALICE, 'habits', 'evil'), validHabit())
    );
  });

  it('Bob, Alice ke logs mein likh nahi sakta', async () => {
    await assertFails(
      setDoc(doc(asBob(), 'users', ALICE, 'logs', '2026-10-16'), validLog())
    );
  });

  it('Bob, Alice ka habit delete nahi kar sakta', async () => {
    await assertFails(deleteDoc(doc(asBob(), 'users', ALICE, 'habits', 'h1')));
  });

  it('Bob, Alice ka profile update nahi kar sakta', async () => {
    await assertFails(
      updateDoc(doc(asBob(), 'users', ALICE), { displayName: 'Hacked' })
    );
  });
});

/* ================================================================== *
 * 2. Signed-out access
 * ================================================================== */

describe('unauthenticated access', () => {
  beforeEach(seedAlice);

  it('anon kisi ka profile nahi padh sakta', async () => {
    await assertFails(getDoc(doc(asAnon(), 'users', ALICE)));
  });

  it('anon users collection list nahi kar sakta', async () => {
    await assertFails(getDocs(collection(asAnon(), 'users')));
  });

  it('anon habits/logs na padh sakta hai na likh sakta hai', async () => {
    await assertFails(getDoc(doc(asAnon(), 'users', ALICE, 'habits', 'h1')));
    await assertFails(setDoc(doc(asAnon(), 'users', ALICE, 'habits', 'x'), validHabit()));
  });

  it('anon naya profile nahi bana sakta', async () => {
    await assertFails(
      setDoc(doc(asAnon(), 'users', 'ghost'), { uid: 'ghost', email: 'g@example.com' })
    );
  });

  it('anon admin_stats nahi padh sakta', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'admin_stats', '2026-10-15'), { totalUsers: 5 });
    });
    await assertFails(getDoc(doc(asAnon(), 'admin_stats', '2026-10-15')));
  });
});

/* ================================================================== *
 * 3. Privilege escalation
 * ================================================================== */

describe('privilege escalation', () => {
  beforeEach(seedAlice);

  it('Alice khud ko admin nahi bana sakti', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { role: 'admin' }));
  });

  it('Alice role field ko kisi bhi value mein nahi badal sakti', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { role: 'superuser' }));
  });

  it('Alice apna uid nahi badal sakti', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { uid: BOB }));
  });

  it('Alice dusre ke email se profile claim nahi kar sakti', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'users', 'brand_new'), {
        uid: 'brand_new',
        email: BOB_EMAIL,
      })
    );
  });

  it('Alice apne hi doc par dusre ka uid nahi likh sakti', async () => {
    await testEnv.clearFirestore();
    await assertFails(
      setDoc(doc(asAlice(), 'users', ALICE), { uid: BOB, email: ALICE_EMAIL })
    );
  });

  it('Alice baad mein apna email badal kar dusre ka nahi likh sakti', async () => {
    // Ye gap test likhte waqt mila: email check pehle sirf create par tha.
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { email: BOB_EMAIL }));
  });

  it('Alice apna profile delete nahi kar sakti (sirf Cloud Function se)', async () => {
    await assertFails(deleteDoc(doc(asAlice(), 'users', ALICE)));
  });

  it('admin bhi user doc delete nahi kar sakta', async () => {
    await assertFails(deleteDoc(doc(asAdmin(), 'users', ALICE)));
  });
});

/* ================================================================== *
 * 4. Owner ke legit kaam — rules itne sakht na ho jayein ki app hi na chale
 * ================================================================== */

describe('owner happy paths', () => {
  it('Alice matching email se apna profile bana sakti hai', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), 'users', ALICE), {
        uid: ALICE,
        email: ALICE_EMAIL,
        displayName: 'Alice',
      })
    );
  });

  it('Alice apna profile padh sakti hai', async () => {
    await seedAlice();
    await assertSucceeds(getDoc(doc(asAlice(), 'users', ALICE)));
  });

  it('Alice apna displayName update kar sakti hai', async () => {
    await seedAlice();
    await assertSucceeds(
      updateDoc(doc(asAlice(), 'users', ALICE), { displayName: 'Alice T.' })
    );
  });

  it('Alice apne habits create/read/update/delete kar sakti hai', async () => {
    await seedAlice();
    const db = asAlice();
    await assertSucceeds(setDoc(doc(db, 'users', ALICE, 'habits', 'h2'), validHabit()));
    await assertSucceeds(getDocs(collection(db, 'users', ALICE, 'habits')));
    await assertSucceeds(
      setDoc(doc(db, 'users', ALICE, 'habits', 'h2'), validHabit({ name: 'Renamed' }))
    );
    await assertSucceeds(deleteDoc(doc(db, 'users', ALICE, 'habits', 'h2')));
  });

  it('Alice valid log likh sakti hai', async () => {
    await seedAlice();
    await assertSucceeds(
      setDoc(doc(asAlice(), 'users', ALICE, 'logs', '2026-10-16'), validLog())
    );
  });

  it('khaali completed map allowed hai (aakhri habit untick karne par)', async () => {
    await seedAlice();
    await assertSucceeds(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'logs', '2026-10-16'),
        validLog({ completed: {} })
      )
    );
  });
});

/* ================================================================== *
 * 5. Habit validation
 * ================================================================== */

describe('habit validation', () => {
  beforeEach(seedAlice);

  it('36 chars se lamba naam reject hota hai', async () => {
    await assertFails(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'habits', 'long'),
        validHabit({ name: 'x'.repeat(37) })
      )
    );
  });

  it('theek 36 chars allowed hai', async () => {
    await assertSucceeds(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'habits', 'edge'),
        validHabit({ name: 'x'.repeat(36) })
      )
    );
  });

  it('khaali naam reject hota hai', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'users', ALICE, 'habits', 'empty'), validHabit({ name: '' }))
    );
  });

  it('naam string hona chahiye', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'users', ALICE, 'habits', 'num'), validHabit({ name: 123 }))
    );
  });

  it('weeklyGoal range ke bahar reject hota hai', async () => {
    for (const goal of [0, 8, -1, 100]) {
      await assertFails(
        setDoc(
          doc(asAlice(), 'users', ALICE, 'habits', `g${goal}`),
          validHabit({ weeklyGoal: goal })
        )
      );
    }
  });

  it('weeklyGoal 1 se 7 tak allowed hai', async () => {
    for (const goal of [1, 3, 5, 7]) {
      await assertSucceeds(
        setDoc(
          doc(asAlice(), 'users', ALICE, 'habits', `ok${goal}`),
          validHabit({ weeklyGoal: goal })
        )
      );
    }
  });

  it('weeklyGoal number hona chahiye', async () => {
    await assertFails(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'habits', 'str'),
        validHabit({ weeklyGoal: '7' })
      )
    );
  });
});

/* ================================================================== *
 * 6. Log validation
 * ================================================================== */

describe('log validation', () => {
  beforeEach(seedAlice);

  it('galat doc id reject hoti hai', async () => {
    const bad = ['garbage', '2026-1-5', '20261015', '2026-10-15-extra', '../etc', ''];
    for (const id of bad) {
      if (!id) continue; // khaali id client-side hi invalid hai
      await assertFails(
        setDoc(doc(asAlice(), 'users', ALICE, 'logs', id), validLog({ date: id }))
      );
    }
  });

  it('sahi YYYY-MM-DD id allowed hai', async () => {
    await assertSucceeds(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'logs', '2027-01-01'),
        validLog({ date: '2027-01-01' })
      )
    );
  });

  it('completed map hona chahiye', async () => {
    for (const bad of ['yes', 42, true, ['h1']]) {
      await assertFails(
        setDoc(
          doc(asAlice(), 'users', ALICE, 'logs', '2026-10-17'),
          validLog({ completed: bad })
        )
      );
    }
  });

  it('100 se zyada keys reject hoti hain', async () => {
    const huge = {};
    for (let i = 0; i < 101; i++) huge[`h${i}`] = true;
    await assertFails(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'logs', '2026-10-18'),
        validLog({ completed: huge })
      )
    );
  });

  it('theek 100 keys allowed hain', async () => {
    const full = {};
    for (let i = 0; i < 100; i++) full[`h${i}`] = true;
    await assertSucceeds(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'logs', '2026-10-19'),
        validLog({ completed: full })
      )
    );
  });
});

/* ================================================================== *
 * 7. Admin
 * ================================================================== */

describe('admin access', () => {
  beforeEach(async () => {
    await seedAlice();
    await seed(async (db) => {
      await setDoc(doc(db, 'admin_stats', '2026-10-15'), {
        date: '2026-10-15',
        totalUsers: 42,
        dau: 7,
      });
    });
  });

  it('admin kisi bhi user ka profile padh sakta hai', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), 'users', ALICE)));
  });

  it('admin users collection list kar sakta hai', async () => {
    await assertSucceeds(getDocs(collection(asAdmin(), 'users')));
  });

  it('non-admin users collection list nahi kar sakta', async () => {
    await assertFails(getDocs(collection(asAlice(), 'users')));
  });

  it('admin user ke habits aur logs padh sakta hai', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), 'users', ALICE, 'habits', 'h1')));
    await assertSucceeds(getDoc(doc(asAdmin(), 'users', ALICE, 'logs', '2026-10-15')));
  });

  it('admin admin_stats padh sakta hai', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), 'admin_stats', '2026-10-15')));
  });

  it('admin admin_stats likh NAHI sakta (sirf Cloud Function)', async () => {
    await assertFails(
      setDoc(doc(asAdmin(), 'admin_stats', '2026-10-16'), { totalUsers: 999 })
    );
  });

  it('admin user ke habits mein likh nahi sakta (read-only oversight)', async () => {
    await assertFails(
      setDoc(doc(asAdmin(), 'users', ALICE, 'habits', 'injected'), validHabit())
    );
  });

  it('normal user admin_stats nahi padh sakta', async () => {
    await assertFails(getDoc(doc(asAlice(), 'admin_stats', '2026-10-15')));
  });
});

/* ================================================================== *
 * 8. Catch-all default deny
 *
 * Ye sabse important test hai: naya collection add karne par agar koi uske
 * rules likhna bhool jaye, to wo apne aap band rehna chahiye — khula nahi.
 * ================================================================== */

describe('default deny', () => {
  it('kisi bhi undeclared collection par access band hai', async () => {
    for (const path of ['secrets', 'config', 'artifacts', 'habitpulse_accounts']) {
      await assertFails(getDoc(doc(asAlice(), path, 'anything')));
      await assertFails(setDoc(doc(asAlice(), path, 'anything'), { x: 1 }));
      await assertFails(getDoc(doc(asAdmin(), path, 'anything')));
    }
  });

  it('purane public account path par ab kuch nahi chalta', async () => {
    // Purana model: artifacts/{appId}/public/data/habitpulse_accounts/{key}
    const legacy = ['artifacts', 'habitpulse-family-app', 'public', 'data'];
    await assertFails(getDoc(doc(asAnon(), ...legacy, 'habitpulse_accounts', 'google_alice_example_com')));
    await assertFails(getDoc(doc(asBob(), ...legacy, 'habitpulse_accounts', 'google_alice_example_com')));
  });
});
