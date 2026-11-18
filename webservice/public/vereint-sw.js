/*
 * VEREINT-Service-Worker.
 *
 * Aufgaben:
 * - Offline: öffentliche statische Assets cachen und bei fehlendem Netz statt
 *   einer Fehlerseite des Browsers `/offline.html` zeigen.
 * - Web Push: Jeder Push trägt Titel, Text und Ziel verschlüsselt (RFC 8291).
 *   Der Worker zeigt ihn sofort an, ohne erst etwas nachzuladen; das klappt
 *   auch mit abgelaufener Sitzung und schlechtem Netz. Danach lädt er, wenn die
 *   Sitzung noch gilt, `/api/v1/personal-notifications` für App-Badge und
 *   Zugestellt-Haken. Kommt ein Push ohne Inhalt (ältere Server), lädt er wie
 *   früher das Neueste von dort, höchstens einige Sekunden lang. Chats und
 *   Direktnachrichten teilen sich je Gespräch einen Tag, neue ersetzen ältere.
 *   Ein Tipp öffnet das Ziel der Mitteilung im offenen Fenster oder in einem neuen.
 *   Gehört der Eintrag zu einer anderen Gruppe als der gewählten, wechselt ein
 *   Tipp darauf zuerst in diese Gruppe. Einladungen zu Events tragen die
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
  const payload = readPayload(event);
  event.waitUntil(payload ? showFromPayload(payload) : showLatestNotification());
});

/** Höchstdauer für Nachladen im Push: iOS beendet zu langsame Worker und entzieht dann das Abo. */
const FETCH_TIMEOUT_MS = 8000;

function readPayload(event) {
  try {
    const value = event.data ? event.data.json() : null;
    return value && typeof value === 'object' && typeof value.title === 'string' ? value : null;
  } catch {
    return null;
  }
}

async function showFromPayload(payload) {
  const link = isAppLink(payload.url) ? payload.url : '/notifications';
  let data = { url: link };
  if (typeof payload.stammtischId === 'string') data = { ...data, stammtischId: payload.stammtischId };
  let actions;
  const eventId = eventIdFromLink(link);
  if (payload.type === 'event_invitation' && eventId) {
    data = { ...data, eventId, notificationId: payload.notificationId };
    actions = [
      { action: 'accept', title: 'Zusagen' },
      { action: 'decline', title: 'Absagen' },
    ];
  }
  const key = typeof payload.tag === 'string' && payload.tag ? payload.tag : link;
  await self.registration.showNotification(payload.title || 'Vereint', {
    body: truncate(payload.body, 180),
    tag: `vereint-${key}`,
    renotify: true,
    icon: NOTIFICATION_ICON,
    lang: 'de',
    data,
    ...(actions ? { actions } : {}),
  });
  // Erst nach der Anzeige: Badge und Zugestellt-Haken, falls die Sitzung noch gilt.
  const lists = await Promise.all(NOTIFICATION_SOURCES.map(loadUnread));
  if (lists.some((list) => list !== null)) await updateAppBadge(lists.flat().filter(Boolean).length);
}

// Gruppenübergreifend: Mitteilungen und Chats aller eigenen Gruppen samt Direktnachrichten und Freunden.
const NOTIFICATION_SOURCES = ['/api/v1/personal-notifications'];
/** Je Gespräch eine Benachrichtigung: neue Nachrichten ersetzen die vorige. */
const CONVERSATION_TYPES = ['direct_message', 'chat_message'];

/** Ungelesenes der Quelle oder `null`, wenn es nicht zu laden war (keine Sitzung, kein Netz, zu langsam). */
async function loadUnread(path) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) return null;
    const items = await response.json();
    return Array.isArray(items) ? items.filter((item) => !item.read) : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function showLatestNotification() {
  let title = 'Vereint';
  let body = 'Du hast eine neue Mitteilung.';
  let tag = 'vereint-notification';
  let data = { url: '/notifications' };
  let actions;

  try {
    const lists = await Promise.all(NOTIFICATION_SOURCES.map(loadUnread));
    const unread = lists
      .flat()
      .filter(Boolean)
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    await updateAppBadge(unread.length);
    const latest = unread[0];
    if (latest) {
      title = latest.title;
      body = truncate(latest.body, 180);
      // Chats und Direktnachrichten je Gespräch unter einem Tag: neue ersetzen ältere.
      tag = `vereint-${CONVERSATION_TYPES.includes(latest.type) ? latest.link : latest.id}`;
      if (isAppLink(latest.link)) data = { url: latest.link };
      if (typeof latest.stammtischId === 'string') data = { ...data, stammtischId: latest.stammtischId };
      const eventId = eventIdFromLink(latest.link);
      if (latest.type === 'event_invitation' && eventId) {
        data = { ...data, eventId, notificationId: latest.id };
        actions = [
          { action: 'accept', title: 'Zusagen' },
          { action: 'decline', title: 'Absagen' },
        ];
      }
    }
  } catch {
    // Ohne Sitzung oder Netz bleibt es beim neutralen Hinweis.
  }

  // Browser verlangen zu jedem Push eine sichtbare Benachrichtigung.
  await self.registration.showNotification(title, {
    body,
    tag,
    // Ersetzt eine Benachrichtigung desselben Gesprächs und meldet sich trotzdem erneut.
    renotify: true,
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
    event.waitUntil(
      selectGroup(data.stammtischId).then(() =>
        answerInvitation(data, event.action === 'accept' ? 'accepted' : 'declined', target.href),
      ),
    );
    return;
  }
  event.waitUntil(selectGroup(data.stammtischId).then(() => openOrFocus(target.href)));
});

/**
 * Wählt die Gruppe des Eintrags, damit Link und Antwort in der richtigen
 * Gruppe landen. Ist sie schon gewählt, ändert sich nichts; schlägt es fehl,
 * öffnet sich die App trotzdem.
 */
async function selectGroup(stammtischId) {
  if (typeof stammtischId !== 'string' || !stammtischId) return;
  try {
    await fetch('/api/auth/stammtisch', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ stammtischId }),
    });
  } catch {
    // Ohne Netz bleibt die gewählte Gruppe.
  }
}

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

/**
 * Öffnet [href] in einem offenen Fenster der App (bevorzugt dem sichtbaren)
 * oder in einem neuen. Scheitert das Umleiten des offenen Fensters (etwa weil
 * es noch nicht von diesem Worker gesteuert wird), öffnet sich ein neues.
 */
async function openOrFocus(href) {
  const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(
    (client) => new URL(client.url).origin === self.location.origin,
  );
  windows.sort((a, b) => Number(b.focused) - Number(a.focused) || visibilityRank(b) - visibilityRank(a));
  for (const client of windows) {
    try {
      const focused = client.focused ? client : await client.focus();
      const target = focused || client;
      if ('navigate' in target) {
        const navigated = await target.navigate(href);
        if (navigated) return;
      }
    } catch {
      // Nächstes Fenster versuchen oder ein neues öffnen.
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(href);
}

function visibilityRank(client) {
  return client.visibilityState === 'visible' ? 1 : 0;
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
