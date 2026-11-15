import type { Page, Request } from '@playwright/test';

/** Die Live-Verbindung der App bleibt offen; sie zählt nicht als laufende Anfrage. */
const LONG_LIVED = ['/api/v1/live'];

const QUIET_MS = 500;
const TIMEOUT_MS = 15_000;

const trackers = new WeakMap<Page, Set<Request>>();

function isLongLived(request: Request): boolean {
  try {
    return LONG_LIVED.includes(new URL(request.url()).pathname);
  } catch {
    return false;
  }
}

/**
 * Zählt ab jetzt die laufenden Anfragen der Seite. Früh aufrufen (vor dem
 * ersten `goto`), damit [waitForSettled] auch schon laufende Anfragen kennt.
 */
export function trackRequests(page: Page): Set<Request> {
  const existing = trackers.get(page);
  if (existing) return existing;
  const pending = new Set<Request>();
  page.on('request', (request) => {
    if (!isLongLived(request)) pending.add(request);
  });
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('requestfailed', (request) => pending.delete(request));
  trackers.set(page, pending);
  return pending;
}

/**
 * Wartet, bis die Seite geladen ist und 500 ms lang keine Anfrage mehr läuft.
 *
 * Ersetzt `waitForLoadState('networkidle')`: Das wird nie erreicht, solange
 * die Live-Verbindung (`/api/v1/live`, Server-Sent Events) offen ist.
 */
export async function waitForSettled(page: Page): Promise<void> {
  const pending = trackRequests(page);
  await page.waitForLoadState('load');
  const deadline = Date.now() + TIMEOUT_MS;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    if (pending.size > 0) quietSince = Date.now();
    else if (Date.now() - quietSince >= QUIET_MS) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`Seite kommt nicht zur Ruhe, offen: ${[...pending].map((r) => r.url()).join(', ')}`);
}
