/// <reference lib="webworker" />

import { clientsClaim, skipWaiting } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};

skipWaiting();
clientsClaim();

// Keep the worker only for push notifications. The browser HTTP cache still
// handles immutable hashed assets, while pages and images always use the
// network and can never be trapped behind a stale PWA cache.
Object.freeze(self.__WB_MANIFEST);

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  })());
});

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
};

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    payload = { body: event.data?.text() ?? '' };
  }

  const title = payload.title || 'WayYaam';
  const options: NotificationOptions = {
    body: payload.body || 'Есть новое обновление',
    tag: payload.tag || 'waycatalog-update',
    icon: '/catalogg/assets/logo/icon-192.png',
    badge: '/catalogg/assets/logo/icon-192.png',
    requireInteraction: true,
    data: { ...(payload.data ?? {}), url: payload.url || '/catalogg/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = typeof event.notification.data?.url === 'string'
    ? event.notification.data.url
    : '/catalogg/';

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingClient = windowClients.find((client) => 'focus' in client);
    if (existingClient) {
      await existingClient.focus();
      await existingClient.navigate(url);
      return;
    }
    await self.clients.openWindow(url);
  })());
});
