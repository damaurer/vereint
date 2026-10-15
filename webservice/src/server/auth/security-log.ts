import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

/**
 * Strukturierte Protokollierung von Sicherheitsereignissen der Express-Schicht.
 *
 * Es werden ausschließlich Metadaten geschrieben. Tokens, Authorization Codes,
 * PKCE-Verifier, Nonces, Cookie-Inhalte und Klartext-Secrets dürfen niemals in
 * einen Logeintrag gelangen (`docs/authentifizierung.md`).
 */

export type SecurityEventOutcome = 'denied' | 'failed' | 'allowed';

export interface SecurityEvent {
  event: string;
  outcome: SecurityEventOutcome;
  errorClass?: string;
  correlationId?: string;
  subject?: string;
  detail?: string;
}

export interface SecurityLogEntry extends SecurityEvent {
  timestamp: string;
  correlationId: string;
  remoteAddress: string;
  method?: string;
  path?: string;
}

/** Schlüsselnamen, deren Werte niemals protokolliert werden. */
const FORBIDDEN_DETAIL_PATTERN =
  /(access_token|refresh_token|id_token|code_verifier|client_secret|authorization|bearer\s|nonce=|code=)/i;

export function createCorrelationId(): string {
  return randomUUID();
}

/**
 * Client-IP über `req.ip`: Express wertet `X-Forwarded-For` nur aus, wenn die
 * Anfrage vom vertrauenswürdigen Proxy (Caddy) kommt (`trust proxy`).
 */
export function resolveRemoteAddress(req?: Request): string {
  if (!req) return 'unknown';
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/** Entfernt Detailtexte, die Geheimnisse enthalten könnten. */
export function sanitizeDetail(detail?: string): string | undefined {
  if (!detail) return undefined;
  if (FORBIDDEN_DETAIL_PATTERN.test(detail)) return '[redacted]';
  return detail.length > 200 ? `${detail.slice(0, 200)}…` : detail;
}

export function buildSecurityLogEntry(event: SecurityEvent, req?: Request): SecurityLogEntry {
  return {
    ...event,
    detail: sanitizeDetail(event.detail),
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId ?? createCorrelationId(),
    remoteAddress: resolveRemoteAddress(req),
    method: req?.method,
    path: req?.originalUrl?.split('?')[0] ?? req?.path,
  };
}

export function logSecurityEvent(event: SecurityEvent, req?: Request): SecurityLogEntry {
  const entry = buildSecurityLogEntry(event, req);
  const line = JSON.stringify({ level: entry.outcome === 'allowed' ? 'info' : 'warn', ...entry });
  if (entry.outcome === 'allowed') {
    console.info(line);
  } else {
    console.warn(line);
  }
  return entry;
}
