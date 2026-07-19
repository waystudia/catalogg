/// <reference lib="webworker" />

import { clientsClaim, skipWaiting } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};

skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'catalog-pages',
    networkTimeoutSeconds: 3
  })
);

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request }) => request.destination === 'image',
  new NetworkFirst({
    cacheName: 'catalog-images',
    networkTimeoutSeconds: 4
  })
);

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

  const title = payload.title || 'WayCatalog';
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
