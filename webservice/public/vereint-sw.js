/*
 * VEREINT-Service-Worker (registriert von `PwaService`).
 *
 * Aufgaben:
 * - Web Push anzeigen. Der baseservice sendet Pushes ohne Inhalt (nur ein
 *   Weckruf, siehe `VapidPushSender`), damit keine Vereinsdaten über den
 *   Push-Dienst laufen. Angezeigt wird deshalb ein neutraler Hinweis; ein Klick
 *   öffnet die Mitteilungen.
 * - Gehashte, öffentliche Build-Artefakte cache-first ausliefern.
 *
 * Die Cache-Regeln spiegeln `src/app/pwa/service-worker-cache-policy.ts`;
 * beide Dateien MÜSSEN synchron bleiben. Alles andere (API, HTML, private
 * Antworten) geht unverändert ans Netz.
 */
'use strict';

const CACHE_NAME = 'vereint-assets-v1';
const API_PATH_PREFIX = '/api/';
const ASSET_PATH_PATTERN =
  /\.(?:js|mjs|css|map|woff2|woff|ttf|otf|svg|png|jpg|jpeg|webp|avif|gif|ico)$/i;
const HASHED_FILE_PATTERN = /[.-][0-9a-f]{8,}\.[a-z0-9]+$/i;

function isCacheableAssetPath(pathname) {
  if (!pathname || pathname.startsWith(API_PATH_PREFIX)) return false;
  return ASSET_PATH_PATTERN.test(pathname);
}

function isBypassedRequest(pathname, method, sameOrigin) {
  if ((method || '').toUpperCase() !== 'GET') return true;
  if (!sameOrigin) return true;
  if (!pathname || pathname.startsWith(API_PATH_PREFIX)) return true;
  return false;
}

function isPrivateResponse(cacheControl) {
  if (!cacheControl) return false;
  const value = cacheControl.toLowerCase();
  return value.includes('no-store') || value.includes('private');
}

function isImmutableHashedAsset(pathname) {
  if (!isCacheableAssetPath(pathname)) return false;
  const file = pathname.split('/').pop() || '';
  return HASHED_FILE_PATTERN.test(file);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (isBypassedRequest(url.pathname, request.method, sameOrigin)) return;
  if (!isImmutableHashedAsset(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && !isPrivateResponse(response.headers.get('Cache-Control'))) {
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Vereint', {
      body: 'Du hast eine neue Mitteilung.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'vereint-notification',
      data: { url: '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/notifications', self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target.href);
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
