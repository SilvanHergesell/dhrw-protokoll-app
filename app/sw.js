// VERSION bei jeder Änderung an den Dateien erhöhen, damit installierte Apps sich aktualisieren.
const VERSION = 'v9';
const CACHE = `protokoll-${VERSION}`;
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'fields.js', 'db.js', 'export-pdf.js',
  'pdf-lib.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'vorlagen/Leeres_Pruefprotokoll.pdf', 'vorlagen/Leeres_Pruefprotokoll.docx',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' umgeht den HTTP-Cache, sonst könnten alte Dateien in die neue Version gelangen
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Zuerst aus dem Cache: Die App muss ganz ohne Verbindung starten.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)),
  );
});
