// 브라우저 알림을 띄우기 위한 최소 서비스 워커. 오프라인 캐시는 하지 않는다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
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
