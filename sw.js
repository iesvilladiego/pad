// ==================== Service Worker - Plan de Actuación Digital ====================
const CACHE_NAME = 'plan-digital-v2.23';
const BASE_URL = '/pad/';

const PRECACHE_URLS = [
  BASE_URL + 'manifest.json',
  BASE_URL + 'pwa/icons/icon-192.png',
  BASE_URL + 'pwa/icons/icon-512.png'
];

const EXTERNAL_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

// Install: precache core assets (NOT index.html — it must always be fresh)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Cache local files first
        const localPromise = cache.addAll(PRECACHE_URLS).catch(() => {});
        // Cache external resources individually (non-blocking)
        const externalPromises = EXTERNAL_URLS.map((url) =>
          cache.add(url).catch(() => {
            console.warn('SW: Could not cache external resource:', url);
          })
        );
        return Promise.all([localPromise, ...externalPromises]);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Firestore API calls: network-first (always need fresh data)
  if (url.hostname === 'firestore.googleapis.com' ||
      url.pathname.includes('firestore')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || new Response(JSON.stringify({ error: 'Sin conexión' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Firebase auth/internal: network-first
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // index.html: NETWORK-FIRST (always fetch fresh version to get latest code changes)
  if (event.request.mode === 'navigate' ||
      (url.pathname === BASE_URL || url.pathname === BASE_URL + 'index.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh version for offline use
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // If offline, serve cached version
          return caches.match(BASE_URL + 'index.html').then((cached) => {
            return cached || caches.match(event.request);
          });
        })
    );
    return;
  }

  // Other static assets (icons, manifest, CSS, JS): cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && (event.request.url.startsWith(self.location.origin) ||
            EXTERNAL_URLS.some(ext => event.request.url.startsWith(ext)))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match(BASE_URL + 'index.html');
        }
      });
    })
  );
});
