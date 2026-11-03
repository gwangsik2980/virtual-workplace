// 브라우저 알림을 띄우기 위한 서비스 워커. 오프라인 캐시는 하지 않는다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 닫아 둔 동안 알림: 알림 서버(worker/)가 예정표 시각에 보낸 웹 푸시를 띄운다.
// 아이폰은 푸시를 받으면 반드시 알림을 보여 줘야 해서, 내용이 비어 있어도 기본 문구로 띄운다.
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || '가온식품 알림', {
      body: d.body || '',
      tag: d.tag || undefined,
      icon: '/virtual-workplace/icon-192.png',
      badge: '/virtual-workplace/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const c = list.find((w) => w.url.includes('/virtual-workplace/'));
      if (c) return c.focus();
      return self.clients.openWindow('/virtual-workplace/');
    }),
  );
});
