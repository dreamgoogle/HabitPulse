# HabitPulse

Daily habit tracker — streaks, monthly heatmaps, per-user cloud sync, aur CSV / Google Sheets export.
PWA hai, Android par TWA ya Capacitor se package hota hai.

---

## Is branch mein kya badla

Ye `feat/production-ready` branch purane single-file prototype ko production-ready app mein
badalta hai. Purana code tha: ek `index.html` (4195 lines — CSS + HTML + JS sab inline),
`manifest.json`, aur `sw.js`.

### 🔴 Security fixes

| Kya galat tha | Ab kya hai |
|---|---|
| **Nakli Google Sign-In.** `confirmInAppGoogleSignIn()` ek hand-made modal tha jisme user koi bhi email type karke uska data khol sakta tha. Verification zero. | Asli Firebase Google Auth. ID token server par verify hota hai; `request.auth.uid` hi pehchaan hai. |
| **Saara data public path par.** `artifacts/{appId}/public/data/habitpulse_accounts/{key}`, jahan `key = 'google_' + email`. Email jaante ho to doc path jaante ho. | `/users/{uid}/...` + `firestore.rules` jo default-deny karte hain. |
| **Password scheme.** Unsalted SHA-256 client-side, `passHash` publicly-readable doc mein, comparison bhi client par. `btoa` fallback to hash hi nahi tha. | Password handling poori tarah hata di — Google sign-in hi ek raasta hai. |
| **Firebase kabhi initialize hi nahi hota tha.** `__firebase_config` ek Canvas sandbox global hai jo repo mein kahin define nahi tha, isliye `initFirebaseCloud()` hamesha jaldi return ho jata tha aur cloud layer chup-chaap dead rehta tha. | Config `.env.local` se aati hai; missing ho to app loudly fail hota hai. |
| **DOM XSS.** `escapeHtml()` single quote escape nahi karta tha, aur wahi value `onclick="fn('...')"` ke andar jaati thi. | Saare 5 characters escape, aur inline `onclick` ki jagah event delegation. |
| **Webhook jhooth bolta tha.** `mode: 'no-cors'` wala fetch hamesha resolve karta hai, isliye fail hone par bhi "✅ sent" dikhta tha. Diya gaya Apps Script bina auth ke `sheet.clear()` karta tha. | Webhook hata diya. Ab Cloud Function + `drive.file` scope se seedha user ki Drive mein sheet banti hai. |

### 🟠 Bug fixes

- **Service worker kuch bhi cache nahi karta tha.** Precache list mein `icon-192.png` aur
  `icon-512.png` the jo repo mein exist hi nahi karte — `cache.addAll()` reject hota tha aur
  wo reject `.catch(() => {})` mein nigal liya jata tha. Offline mode poora dead tha.
- **Manifest icons remote URLs the** (`placehold.co`) — Bubblewrap/PWABuilder inhe reject karte hain.
  Ab asli local PNG hain (`npm run icons`).
- **Demo data real users ko ship hota tha** — `createSeedHabits()` fresh install par 28 din ka
  nakli history bhar deta tha. Hata diya.

### 🟢 Naye features

- Per-user cloud sync, offline-first Firestore cache
- Server-side export: 1M / 3M / 6M / 12M / custom range
- Direct Google Sheet creation (`drive.file` scope — restricted scope nahi, isliye Google ka
  mehnga saalana security assessment nahi lagta)
- Admin panel (alag app, alag hosting target, custom claims se guarded)
- In-app account deletion (Play Store mandatory)
- Purane localStorage data ki automatic migration

---

## Architecture

```
Client (PWA, Vite)
   │  ID token har request par
   ▼
Firebase Auth ──► custom claims { admin: true }
   │
   ├──► Firestore         /users/{uid}/habits/{habitId}
   │    + security rules  /users/{uid}/logs/{YYYY-MM-DD}
   │                      /admin_stats/{date}   ← sirf Functions likhta hai
   │
   └──► Cloud Functions   exportHabits · deleteMyAccount
        (asia-south1)     setAdminRole · adminOverview · adminListUsers
                          aggregateDailyStats · pruneOrphanLogKeys
```

**Data model kyun badla:** purane model mein poora habits array ek string field `habitsJson`
mein thunsa tha. Firestore ka doc limit 1 MiB hai, har toggle poora blob rewrite karta tha,
aur date-range query server-side namumkin thi. Ab ek din = ek doc, to toggle sirf ek chhota
doc likhta hai aur export ek saaf `documentId()` range query ban jata hai.

In-memory shape (`habits[].history[dateKey]`) jaan-boojh kar purani rakhi gayi hai taaki
render layer bina badle chale.

---

## Setup

### 1. Firebase project

```bash
npm i -g firebase-tools
firebase login
firebase projects:create habitpulse      # ya Console se banaiye
firebase use --add
```

Firebase Console mein:
- **Authentication** → Sign-in method → **Google** enable kijiye
- **Authentication** → Settings → Authorized domains mein apna domain add kijiye
- **Firestore Database** → create (production mode, region `asia-south1`)
- **Blaze plan** chahiye — Cloud Functions ke liye (free tier generous hai)

### 2. Local config

```bash
cp .env.example .env.local
# .env.local mein Firebase Console → Project settings → Your apps → Web app ki values bhariye
```

### 3. Install & run

```bash
npm install
npm run icons          # PWA icons generate (ek baar)
npm run dev            # http://localhost:5173
```

### 4. Rules & Functions deploy

```bash
npm run deploy:rules

cd functions && npm install && cd ..
npm run deploy:functions
```

### 5. Pehla admin banaiye

```bash
# Firebase Console → Project settings → Service accounts → Generate new private key
# File ko project root mein serviceAccountKey.json naam se rakhiye

node scripts/bootstrap-admin.mjs you@example.com

rm serviceAccountKey.json     # ← ye step mat bhooliye
```

Admin ko ek baar sign out/in karna hoga — token refresh ke liye.

### 6. Deploy

```bash
firebase target:apply hosting app   habitpulse
firebase target:apply hosting admin habitpulse-admin

npm run deploy:hosting
npm run deploy:admin
```

---

## Android packaging

### Option A — TWA (tez raasta)

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR-DOMAIN/manifest.json
bubblewrap build
```

Phir `public/.well-known/assetlinks.json` mein SHA-256 fingerprint bhariye.

> ⚠️ Fingerprint **Play App Signing** wala lijiye (Play Console → Setup → App signing),
> apni local keystore wala nahi. Ye sabse common galti hai — galat fingerprint par
> TWA mein browser ka address bar dikhne lagta hai.

### Option B — Capacitor (recommend)

Habit tracker ki sabse badi retention feature daily reminder notifications hai.
TWA mein local notifications nahi milti; Capacitor mein milti hain.

```bash
npm i @capacitor/core @capacitor/android @capacitor/local-notifications
npm i @codetrix-studio/capacitor-google-auth
npx cap init HabitPulse app.habitpulse
npx cap add android
npm run build && npx cap sync
```

Capacitor mein Google Sign-In native plugin se kijiye — WebView popups bharosemand nahi hain.

### Target SDK

```gradle
android {
    compileSdk 36
    defaultConfig {
        targetSdk 36     // 31 Aug 2026 se Play Store par mandatory
        minSdk 24
    }
}
```

---

## Play Store checklist

- [ ] `targetSdk 36` (Android 16) — **31 Aug 2026 se mandatory**, deadline nikal chuki hai
- [ ] **12 testers × 14 din lagatar** closed testing — Nov 2023 ke baad bane personal
      accounts ke liye. Ye wall-clock wait hai, aaj hi shuru kijiye
- [ ] AAB upload (APK ab accept nahi hota)
- [ ] Privacy policy publish — `public/privacy.html` mein `__PLACEHOLDER__` bhariye
- [ ] Data safety form — email, naam, photo, app activity declare kijiye
- [ ] Account deletion URL — `public/delete-account.html`
- [ ] Play App Signing enable
- [ ] Store listing: 512×512 icon (`public/icons/play-store-512.png`),
      1024×500 feature graphic, 2–8 screenshots
- [ ] Content rating questionnaire

---

## Project layout

```
index.html              markup (CSS/JS ab inline nahi)
src/
  main.js               entry — wiring, event delegation
  firebase.js           init (config env se)
  auth.js               Google sign-in, profile upsert, account deletion
  store.js              Firestore read/write + legacy migration
  export.js             CSV / TSV / Google Sheets
  stats.js              streaks, completion rates
  state.js              UI state
  styles.css            purane index.html se nikala gaya
  utils/                date.js, dom.js
  views/                today.js, matrix.js, month.js, sheets.js
functions/index.js      Cloud Functions
admin/                  alag admin SPA
scripts/                generate-icons.mjs, bootstrap-admin.mjs
firestore.rules         ← asli security yahan hai
public/                 manifest, sw, icons, privacy, delete-account
```

---

## Abhi kya baaki hai

- [ ] `firestore.rules` ke liye emulator tests (`@firebase/rules-unit-testing`)
- [ ] Daily reminder notifications (Capacitor raaste par)
- [ ] Habit edit UI (rename backend mein hai, UI nahi)
- [ ] Firebase chunk 134 kB gzipped hai — `firebase/firestore/lite` ya lazy import se kam ho sakta hai
