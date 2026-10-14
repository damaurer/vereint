/*
 * VEREINT-Service-Worker.
 *
 * Aufgaben:
 * - Offline: öffentliche statische Assets cachen und bei fehlendem Netz statt
 *   einer Fehlerseite des Browsers `/offline.html` zeigen.
 * - Web Push: Der Server sendet Pushes ohne Nutzlast. Der Worker lädt die
 *   eigentliche Mitteilung autorisiert über `/api/v1/notifications` nach und
 *   zeigt sie als Systembenachrichtigung an. Einladungen zu Events tragen die
 *   Aktionen „Zusagen“/„Absagen“, die direkt `PUT /api/v1/events/{id}/rsvp` aufrufen.
 *
 * Cache-Regeln (deny by default) spiegeln `src/app/pwa/service-worker-cache-policy.ts`;
 * beide Dateien synchron halten. Niemals gecacht werden `/api/`, Nicht-GET,
 * cross-origin, Antworten mit `no-store`/`private` und HTML-Seiten, weil
 * serverseitig gerenderte Seiten persönliche Daten enthalten.
 */

const VERSION = 'v1';
const STATIC_CACHE = `vereint-static-${VERSION}`;
const ASSET_CACHE = 'vereint-assets';
const ASSET_CACHE_LIMIT = 150;
const OFFLINE_URL = '/offline.html';
const NOTIFICATION_ICON = '/icons/icon-192.png';
const PRECACHE_URLS = [OFFLINE_URL, NOTIFICATION_ICON, '/vereint-app-icon.svg'];

const API_PATH_PREFIX = '/api/';
const ASSET_PATH_PATTERN =
  /\.(?:js|mjs|css|map|woff2|woff|ttf|otf|svg|png|jpg|jpeg|webp|avif|gif|ico)$/i;
const HASHED_FILE_PATTERN = /[.-](?=[A-Za-z0-9_]*[0-9A-Z])[A-Za-z0-9_]{8,}\.[a-z0-9]+$/;

function isCacheableAssetPath(pathname) {
  if (!pathname || pathname.startsWith(API_PATH_PREFIX)) return false;
  return ASSET_PATH_PATTERN.test(pathname);
}

function isBypassedRequest(pathname, method, sameOrigin) {
  if ((method || '').toUpperCase() !== 'GET') return true;
  if (!sameOrigin) return true;
  return !pathname || pathname.startsWith(API_PATH_PREFIX);
}

function isPrivateResponse(cacheControlHeader) {
  if (!cacheControlHeader) return false;
  const value = cacheControlHeader.toLowerCase();
  return value.includes('no-store') || value.includes('private');
}

function isImmutableHashedAsset(pathname) {
  if (!isCacheableAssetPath(pathname)) return false;
  return HASHED_FILE_PATTERN.test(pathname.split('/').pop() || '');
}

// --- Lebenszyklus ---

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('vereint-') && key !== STATIC_CACHE && key !== ASSET_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// --- Netzwerk ---

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (isBypassedRequest(url.pathname, request.method, url.origin === self.location.origin)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => offlineFallback()));
    return;
  }

  if (isImmutableHashedAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isCacheableAssetPath(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
});

async function offlineFallback() {
  const cached = await caches.match(OFFLINE_URL);
  return cached || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await remember(request, response);
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    await remember(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function remember(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  if (isPrivateResponse(response.headers.get('Cache-Control'))) return;
  try {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    const overflow = keys.length - ASSET_CACHE_LIMIT;
    for (let i = 0; i < overflow; i++) await cache.delete(keys[i]);
  } catch {
    // Speicher voll oder Cache blockiert: die App funktioniert ohne Cache weiter.
  }
}

// --- Web Push ---

self.addEventListener('push', (event) => {
  event.waitUntil(showLatestNotification());
});

async function showLatestNotification() {
  let title = 'Vereint';
  let body = 'Du hast eine neue Mitteilung.';
  let tag = 'vereint-notification';
  let data = { url: '/notifications' };
  let actions;

  try {
    const response = await fetch('/api/v1/notifications', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (response.ok) {
      const unread = (await response.json()).filter((item) => !item.read);
      await updateAppBadge(unread.length);
      const latest = unread[0];
      if (latest) {
        title = latest.title;
        body = truncate(latest.body, 180);
        tag = `vereint-${latest.id}`;
        if (isAppLink(latest.link)) data = { url: latest.link };
        const eventId = eventIdFromLink(latest.link);
        if (latest.type === 'event_invitation' && eventId) {
          data = { ...data, eventId, notificationId: latest.id };
          actions = [
            { action: 'accept', title: 'Zusagen' },
            { action: 'decline', title: 'Absagen' },
          ];
        }
      }
    }
  } catch {
    // Ohne Sitzung oder Netz bleibt es beim neutralen Hinweis.
  }

  // Browser verlangen zu jedem Push eine sichtbare Benachrichtigung.
  await self.registration.showNotification(title, {
    body,
    tag,
    icon: NOTIFICATION_ICON,
    lang: 'de',
    data,
    ...(actions ? { actions } : {}),
  });
}

/** Nur app-interne Pfade (`/…`, nicht `//…`) dienen als Klickziel. */
function isAppLink(link) {
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//');
}

function eventIdFromLink(link) {
  const match = /^\/events\/([^/?#]+)\/?$/.exec(typeof link === 'string' ? link : '');
  return match ? match[1] : null;
}

function truncate(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function updateAppBadge(count) {
  try {
    if (count > 0 && 'setAppBadge' in self.navigator) await self.navigator.setAppBadge(count);
    else if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
  } catch {
    // App-Badges sind optional.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || '/notifications', self.location.origin);
  if ((event.action === 'accept' || event.action === 'decline') && data.eventId) {
    event.waitUntil(answerInvitation(data, event.action === 'accept' ? 'accepted' : 'declined', target.href));
    return;
  }
  event.waitUntil(openOrFocus(target.href));
});

// Antwort direkt aus der Benachrichtigung, ohne ein Fenster zu öffnen.
async function answerInvitation(data, status, fallbackHref) {
  try {
    const response = await fetch(`/api/v1/events/${encodeURIComponent(data.eventId)}/rsvp`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error(`rsvp ${response.status}`);
    if (data.notificationId) {
      await fetch(`/api/v1/notifications/${encodeURIComponent(data.notificationId)}/read`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      }).catch(() => undefined);
    }
    await self.registration.showNotification('Vereint', {
      body: status === 'accepted' ? 'Du hast zugesagt.' : 'Du hast abgesagt.',
      tag: `vereint-rsvp-${data.eventId}`,
      icon: NOTIFICATION_ICON,
      lang: 'de',
      data: { url: fallbackHref },
    });
  } catch {
    // Ohne Sitzung oder Netz: das Event öffnen, dort kann man antworten.
    await openOrFocus(fallbackHref);
  }
}

async function openOrFocus(href) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    await client.focus();
    if ('navigate' in client) await client.navigate(href);
    return;
  }
  await self.clients.openWindow(href);
}

// Der Push-Dienst kann ein Abonnement austauschen; dann neu beim Server anmelden.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(renewSubscription(event.newSubscription));
});

async function renewSubscription(newSubscription) {
  try {
    let subscription = newSubscription;
    if (!subscription) {
      const keyResponse = await fetch('/api/v1/notifications/vapid-public-key', {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!keyResponse.ok) return;
      const vapid = await keyResponse.json();
      if (!vapid.enabled || !vapid.publicKey) return;
      subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(vapid.publicKey),
      });
    }
    const json = subscription.toJSON();
    await fetch('/api/v1/notifications/subscriptions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        userAgent: self.navigator.userAgent,
      }),
    });
  } catch {
    // Beim nächsten App-Start gleicht die App das Abonnement erneut ab.
  }
}

function base64UrlToBytes(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
