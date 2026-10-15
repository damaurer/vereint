import type { AppContext } from './auth.types';

/**
 * Open-Redirect-Schutz für alle vom Client übergebenen Rücksprungziele
 * (`returnTo`).
 *
 * Die Funktion ist bewusst wiederverwendbar: Sowohl die Login- und
 * Callback-Routen (`src/server/routes/auth.routes.ts`) als auch die
 * Autorisierungs-Middleware nutzen dieselbe Validierung, damit es nur eine
 * Quelle für erlaubte Ziele gibt (`deny by default`).
 */

/** Bekannte App-Präfixe, die als Rücksprungziel erlaubt sind. */
export const KNOWN_APP_PREFIXES: readonly string[] = [
  '/app',
  '/dashboard',
  '/profile',
  '/wallet',
  '/purchases',
  '/scan',
  '/events',
  '/guest',
  '/catalog',
  '/sublists',
  '/chat',
  '/notifications',
  '/moments',
  '/board',
  '/admin',
  '/tablet',
  '/invite/accept',
  '/403',
  '/404',
];

/** Standardziel je App-Kontext, falls kein gültiges `returnTo` vorliegt. */
export const CONTEXT_DEFAULT_PATHS: Readonly<Record<AppContext, string>> = {
  memberPwa: '/app',
  event: '/events',
  eventOwner: '/events',
  boardGeneral: '/board',
  boardTreasury: '/board/treasury',
  boardCommunications: '/board/communications',
  admin: '/admin',
  tabletRecorder: '/tablet',
  eventGuest: '/guest',
};

export const DEFAULT_RETURN_TO = '/app';

/** Maximale Länge eines akzeptierten Rücksprungziels. */
const MAX_RETURN_TO_LENGTH = 512;

/** Steuerzeichen, Backslash und Whitespace sind in Pfaden nicht zulässig. */
const FORBIDDEN_CHARACTERS = /[\\\s\u0000-\u0008\u000e-\u001f\u007f]/;

function matchesKnownPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Prüft, ob ein Wert ein sicheres, anwendungsinternes Rücksprungziel ist.
 * Erlaubt sind ausschließlich relative Pfade auf bekannte App-Präfixe.
 */
export function isSafeReturnTo(value: unknown, prefixes: readonly string[] = KNOWN_APP_PREFIXES): value is string {
  if (typeof value !== 'string') return false;
  if (!value.length || value.length > MAX_RETURN_TO_LENGTH) return false;
  if (FORBIDDEN_CHARACTERS.test(value)) return false;

  // Nur relative Pfade; `//host` und `/\host` sind protokollrelative URLs.
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;

  // Absolute URLs, `javascript:`, `data:` und Ähnliches sind ausgeschlossen.
  if (value.includes(':')) return false;

  const [pathAndQuery] = value.split('#');
  const pathname = pathAndQuery.split('?')[0];

  if (pathname.includes('..')) return false;
  if (pathname.includes('%2f') || pathname.includes('%2F') || pathname.includes('%5c')) return false;

  return matchesKnownPrefix(pathname, prefixes);
}

export interface ResolveReturnToOptions {
  /** App-Kontext, dessen Standardpfad als Fallback dient. */
  context?: AppContext;
  /** Abweichender Fallback, falls kein Kontext gesetzt ist. */
  fallback?: string;
  /** Abweichende Liste erlaubter Präfixe (Standard: `KNOWN_APP_PREFIXES`). */
  prefixes?: readonly string[];
}

/**
 * Liefert ein sicheres Rücksprungziel. Ungültige, absolute oder
 * protokollrelative Werte fallen auf den Kontext-Standardpfad zurück.
 */
export function resolveSafeReturnTo(value: unknown, options?: ResolveReturnToOptions): string {
  const prefixes = options?.prefixes ?? KNOWN_APP_PREFIXES;
  if (isSafeReturnTo(value, prefixes)) {
    return value;
  }

  const contextDefault = options?.context ? CONTEXT_DEFAULT_PATHS[options.context] : undefined;
  return contextDefault ?? options?.fallback ?? DEFAULT_RETURN_TO;
}
