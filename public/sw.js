/**
 * HabitPulse service worker.
 *
 * PURANA BUG: precache list mein `./icon-192.png` aur `./icon-512.png` the,
 * jo repo mein exist hi nahi karte the. `cache.addAll()` ek bhi URL fail hone
 * par poora reject ho jata hai — aur wo reject `.catch(() => {})` mein
 * chup-chaap nigal liya jata tha. Natija: KUCHH BHI cache nahi hota tha,
 * offline mode poora dead tha, aur koi error bhi nahi dikhta tha.
 *
 * Fix: (1) sirf wahi files jo sach mein maujood hain, (2) addAll ke bajaye
 * per-file add taaki ek file ka 404 baaki sab ko na le doobe, (3) errors log.
 */
const VERSION = 'v3';
const SHELL_CACHE = `habitpulse-shell-${VERSION}`;
const RUNTIME_CACHE = `habitpulse-runtime-${VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/** Ye hosts kabhi cache nahi hone chahiye — auth aur live data. */
const NEVER_CACHE_HOSTS = [
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
  'cloudfunctions.net',
  'accounts.google.com',
  'sheets.googleapis.com',
  'www.googleapis.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // addAll ke bajaye ek-ek karke — taaki ek 404 poore precache ko na maare
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] precache skip:', url, err.message))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname.endsWith(h))) return;
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, offline par fallback page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(async () => (await caches.match(request)) || caches.match('/offline.html'))
    );
    return;
  }

  // Static assets: cache-first (Vite hashed filenames deta hai, isliye safe)
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
