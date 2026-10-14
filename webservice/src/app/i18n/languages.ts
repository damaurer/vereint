/**
 * Registrierte UI-Sprachen.
 *
 * Eine neue Sprache braucht genau zwei Schritte (siehe `docs/frontend/i18n.md`):
 * 1. `locales/<code>.json` als Kopie von `locales/de.json` anlegen und übersetzen.
 * 2. Hier einen Eintrag ergänzen.
 *
 * Deutsch ist Standard- und Rückfallsprache: Fehlt ein Schlüssel in einer
 * anderen Sprache, erscheint der deutsche Text. Jede Sprache ist ein eigener
 * Chunk und wird erst geladen, wenn sie gebraucht wird (Deutsch immer mit).
 */

export type Dictionary = { readonly [key: string]: string | Dictionary };

export interface LanguageDefinition {
  /** ISO-639-1-Code, z. B. `de`; identisch mit dem Dateinamen unter `locales/`. */
  readonly code: string;
  /** Name der Sprache in der Sprache selbst (für die Sprachwahl). */
  readonly label: string;
  /** BCP-47-Locale für Datums-, Zahlen- und Währungsformate. */
  readonly locale: string;
  /** Lädt das Wörterbuch als eigenen Chunk. */
  readonly load: () => Promise<{ default: Dictionary }>;
}

export const DEFAULT_LANGUAGE = 'de';

export const LANGUAGES: readonly LanguageDefinition[] = [
  { code: 'de', label: 'Deutsch', locale: 'de-DE', load: () => import('./locales/de.json') },
  { code: 'en', label: 'English', locale: 'en-GB', load: () => import('./locales/en.json') },
];

export function findLanguage(code: string | null | undefined): LanguageDefinition | undefined {
  if (!code) return undefined;
  const normalized = code.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((language) => language.code === normalized);
}

export function isSupportedLanguage(code: string | null | undefined): boolean {
  return findLanguage(code) !== undefined;
}

/**
 * Wählt die beste unterstützte Sprache aus einem `Accept-Language`-Header bzw.
 * einer Liste wie `navigator.languages`. Gewichte (`q=`) werden beachtet.
 */
export function negotiateLanguage(accepted: string | readonly string[] | null | undefined): string {
  const entries = typeof accepted === 'string' ? parseAcceptLanguage(accepted) : (accepted ?? []);
  for (const entry of entries) {
    const language = findLanguage(entry);
    if (language) return language.code;
  }
  return DEFAULT_LANGUAGE;
}

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((entry) => entry.tag);
}
