// مداد — يشتغل بدون إنترنت بعد أول فتح
const CACHE = 'midad-v8';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // الخطوط: من الكاش أولاً
  if (url.host.includes('fonts.googleapis.com') || url.host.includes('fonts.gstatic.com') || url.host.includes('unpkg.com') || url.host.includes('cdnjs.cloudflare.com')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
    })));
    return;
  }
  // ملفات التطبيق: الشبكة أولاً حتى توصل التحديثات، والكاش عند انقطاع الإنترنت
  if (url.origin === location.origin && !url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  }
});
