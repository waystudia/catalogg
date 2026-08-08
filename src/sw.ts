/// <reference lib="webworker" />

import { skipWaiting } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};

skipWaiting();

const appBasePath = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
const notificationIconPath = `${appBasePath}assets/logo/wayyaam-icon-192.png`;

// This worker stays network-only: it owns no fetch routes or precache, but it
// must remain registered so iOS and other installed PWAs can receive Web Push.
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
    icon: notificationIconPath,
    badge: notificationIconPath,
    requireInteraction: true,
    data: { ...(payload.data ?? {}), url: payload.url || appBasePath }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = typeof event.notification.data?.url === 'string'
    ? event.notification.data.url
    : appBasePath;

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
