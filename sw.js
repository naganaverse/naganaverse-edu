const CACHE_NAME = 'ecell-shell-v1';
const DATA_CACHE_NAME = 'ecell-data-v1';

// Your specific Supabase instance
const SUPABASE_URL = 'REDACTED';

// Core assets to pre-cache on installation
const PRECACHE_ASSETS = [
    '/',
    '/login.html',
    '/register.html',
    '/gateway.html',
    '/success.html',
    '/offline.html'
    // Note: Add any local CSS/JS/Logo files here if you aren't using CDNs exclusively
];

// ── 1. Install Event: Precache App Shell ──
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching offline page and app shell');
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
    self.skipWaiting(); // Force the waiting service worker to become the active service worker.
});

// ── 2. Activate Event: Clean up old caches ──
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
                    console.log('[ServiceWorker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// ── 3. Fetch Event: The Traffic Router ──
self.addEventListener('fetch', (event) => {
    // Check if the request is an API call to Supabase
    if (event.request.url.includes(SUPABASE_URL)) {
        // STRATEGY: Network-First for Database requests
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Clone and cache the successful network response
                    const responseClone = response.clone();
                    caches.open(DATA_CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Network failed (Offline) -> Fallback to the last cached API response
                    console.warn('[ServiceWorker] Network down. Serving API from cache.');
                    return caches.match(event.request);
                })
        );
        return; // Exit fetch handler for API requests
    }

    // STRATEGY: Stale-While-Revalidate for local UI Assets & Pages
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Initiate the background network fetch to update the cache
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                })
                .catch(() => {
                    // Network failed & not in cache. 
                    // If the user was trying to navigate to a new HTML page, show the offline wall.
                    if (event.request.mode === 'navigate') {
                        return caches.match('/offline.html');
                    }
                });

            // Return cached response immediately if it exists. If not, wait for the network fetch.
            return cachedResponse || fetchPromise;
        })
    );
});
                      
