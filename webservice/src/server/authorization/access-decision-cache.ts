import type { ResolvedAccessDecision } from './authorization.types';

/**
 * Kurzlebiger LRU-Cache der Zugriffsentscheidungen je `sessionId`.
 *
 * Zweck ist ausschließlich die SSR-Latenz: Ohne Cache löst jeder Request einen
 * Netzwerk-Roundtrip zum Fachservice aus. Die Serverautorisierung bleibt
 * unangetastet — Spring Boot prüft weiterhin jeden fachlichen API-Aufruf.
 *
 * Die TTL ist bewusst kurz (Standard 45 s). Zusätzlich wird der Eintrag bei
 * Logout sowie bei Rollen- und Statusänderungen explizit verworfen
 * (`invalidateAccessDecision`, TICKET-006/TICKET-009).
 */

export const ACCESS_DECISION_TTL_MS = 45_000;

/** Obergrenze der gecachten Sessions; älteste Einträge fallen zuerst heraus. */
export const ACCESS_DECISION_CACHE_LIMIT = 500;

interface CacheEntry {
  decision: ResolvedAccessDecision;
  expiresAt: number;
}

/** `Map` hält die Einfügereihenfolge; damit ist der LRU-Verlauf abbildbar. */
const cache = new Map<string, CacheEntry>();

export function readAccessDecision(sessionId: string | undefined, now = Date.now()): ResolvedAccessDecision | undefined {
  if (!sessionId) return undefined;

  const entry = cache.get(sessionId);
  if (!entry) return undefined;

  // Abgelaufene Einträge bleiben absichtlich liegen: `readStaleAccessDecision`
  // darf sie innerhalb der Gnadenfrist noch verwenden, wenn der Fachservice
  // nicht antwortet.
  if (entry.expiresAt <= now) {
    return undefined;
  }

  // Zuletzt genutzten Eintrag ans Ende verschieben (LRU).
  cache.delete(sessionId);
  cache.set(sessionId, entry);
  return entry.decision;
}

/**
 * Liefert eine abgelaufene Entscheidung, damit ein kurzer Ausfall des
 * Fachservices nicht sofort zur Wartungsseite führt. Die Gnadenfrist ist
 * begrenzt; danach gilt strikt `fail closed`.
 */
export function readStaleAccessDecision(
  sessionId: string | undefined,
  graceMs: number,
  now = Date.now(),
): ResolvedAccessDecision | undefined {
  if (!sessionId) return undefined;

  const entry = cache.get(sessionId);
  if (!entry) return undefined;

  if (entry.expiresAt + graceMs <= now) {
    cache.delete(sessionId);
    return undefined;
  }

  return entry.decision;
}

export function writeAccessDecision(
  sessionId: string | undefined,
  decision: ResolvedAccessDecision,
  now = Date.now(),
): void {
  if (!sessionId) return;

  cache.delete(sessionId);
  cache.set(sessionId, { decision, expiresAt: now + ACCESS_DECISION_TTL_MS });

  while (cache.size > ACCESS_DECISION_CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/** Verwirft die Entscheidung einer Session, zum Beispiel bei Logout. */
export function invalidateAccessDecision(sessionId: string | undefined): void {
  if (!sessionId) return;
  // Einträge sind je Session und Stammtisch abgelegt (`<session>#<stammtisch>`).
  const base = sessionId.split('#')[0];
  for (const key of [...cache.keys()]) {
    if (key === sessionId || key === base || key.startsWith(`${base}#`)) cache.delete(key);
  }
}

/**
 * Verwirft alle Entscheidungen eines Subjekts. Rollen- und Statusänderungen
 * (TICKET-009) betreffen die Person, nicht eine einzelne Session.
 */
export function invalidateAccessDecisionsForSubject(subject: string | undefined): void {
  if (!subject) return;
  for (const [sessionId, entry] of cache) {
    if (entry.decision.subject === subject || entry.decision.userId === subject) {
      cache.delete(sessionId);
    }
  }
}

export function clearAccessDecisionCache(): void {
  cache.clear();
}

export function accessDecisionCacheSize(): number {
  return cache.size;
}
