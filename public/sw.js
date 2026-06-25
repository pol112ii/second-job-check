// 아주 가벼운 서비스워커 — 앱 셸을 캐시해 홈 화면 설치/오프라인 진입 지원.
// 데이터(API)는 항상 네트워크에서 가져오고, 정적 파일만 캐시합니다.
const CACHE = 'bujob-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API/인증 요청은 캐시하지 않음 (항상 최신 수익)
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('/')))
  );
});
