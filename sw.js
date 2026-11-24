// يخلي التطبيق ينفتح حتى بلا نت (الصفحة نفسها من الذاكرة، والملخص الأخير محفوظ بالجهاز)
const CACHE = 'mizan-phone-v6';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'vendor/zxing-0.21.3.min.js'];

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

// إشعار من البرنامج بالحاسبة (طلب دواء): يبين حتى لو التطبيق مسدود
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: 'ميزان', body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'ميزان', {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: { url: d.url || './?tab=orders' },
    })
  );
});
// الضغط على الإشعار: يفتح التطبيق على الطلبات
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './?tab=orders', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          c.postMessage({ mz: 'open', tab: 'orders' });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
