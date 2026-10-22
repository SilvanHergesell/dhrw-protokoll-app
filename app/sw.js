// Bump VERSION on every deploy so clients pick up the new files.
const VERSION = 'v1';
const CACHE = `protokoll-${VERSION}`;
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'fields.js', 'db.js', 'export-pdf.js',
  'pdf-lib.min.js', 'template.pdf', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache first: the app must open with no connection at all.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)),
  );
});
