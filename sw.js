// يخلي التطبيق ينفتح حتى بلا نت (الصفحة نفسها من الذاكرة، والملخص الأخير محفوظ بالجهاز)
const CACHE = 'mizan-phone-v1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // الملخص من سوبابيس دايماً من النت
  if (url.hostname.endsWith('supabase.co')) return;
  // ملفات التطبيق: النت أول (حتى التحديث يوصل)، وإذا ماكو نت من الذاكرة
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && e.request.method === 'GET') {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('index.html')))
  );
});
