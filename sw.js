/* Service Worker：静态资源全量缓存，断网可用
   全部使用相对路径，兼容 GitHub Pages 子路径
*/
const CACHE = 'yuwen-v1';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './exam-templates.json',
  './error-tags.json',
  './js/util.js',
  './js/db.js',
  './js/calc.js',
  './js/charts.js',
  './js/photos.js',
  './js/ui.js',
  './js/fallback.js',
  './js/page-entry.js',
  './js/page-analysis.js',
  './js/page-detail.js',
  './js/page-settings.js',
  './js/boot.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      // 逐条缓存，单个失败不拖垮整个安装
      return Promise.all(ASSETS.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
          console.warn('[SW] 跳过缓存失败：', url, err && err.message);
        })
      ));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求：优先网络（拿最新 HTML），断网回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() =>
        caches.match(req).then((hit) => hit || caches.match('./index.html'))
      )
    );
    return;
  }

  // 其余静态资源：缓存优先
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // 数据文件断网且没缓存时，给一个可解析的空结构，避免启动崩掉
        if (/exam-templates\.json$/.test(url.pathname)) {
          return new Response('{"schemaVersion":1,"templates":[]}', { headers: { 'Content-Type': 'application/json' } });
        }
        if (/error-tags\.json$/.test(url.pathname)) {
          return new Response('{"schemaVersion":1,"groups":[]}', { headers: { 'Content-Type': 'application/json' } });
        }
        return Response.error();
      });
    })
  );
});