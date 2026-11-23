/* Little Days service worker: receives encrypted web push alerts and opens the app on tap.
   No fetch listener and no CacheStorage: the gateway stays the only source of app files and records. */

self.addEventListener('push', event => {
  const show = (async () => {
    let data = {};
    if (event.data) {
      try { data = await event.data.json(); }
      catch {
        try { data = { body: await event.data.text() }; } catch { data = {}; }
      }
    }
    const title = typeof data.title === 'string' && data.title ? data.title : 'Little Days';
    const body = typeof data.body === 'string' && data.body ? data.body : 'Reminder';
    const tag = typeof data.tag === 'string' && data.tag ? data.tag : 'little-days-alert';
    await self.registration.showNotification(title, {
      body,
      tag,
      icon: '/apple-touch-icon.png?v=lilac-bunny-v1',
      badge: '/apple-touch-icon.png?v=lilac-bunny-v1',
      data: { url: '/' },
    });
  })();
  event.waitUntil(show);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const open = (async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url && new URL(client.url).origin === self.location.origin) {
        if ('focus' in client) return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })();
  event.waitUntil(open);
});
