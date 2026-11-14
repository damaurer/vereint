import type { Dictionary } from './languages';

/** Platzhalterwerte für `{name}`-Platzhalter; `count` wählt zusätzlich die Pluralform. */
export type TranslationParams = Readonly<Record<string, string | number | null | undefined>>;

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/** Liest einen Punkt-Schlüssel (`nav.events`) aus einem verschachtelten Wörterbuch. */
export function lookup(dictionary: Dictionary, key: string): string | Dictionary | undefined {
  let node: string | Dictionary | undefined = dictionary;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Übersetzt einen Schlüssel.
 *
 * - Platzhalter: `"Hallo {name}"` mit `{ name: 'Ada' }`.
 * - Plural: Ist der Eintrag ein Objekt mit `one`/`other` (…) und `count` gesetzt,
 *   wählt `Intl.PluralRules` die passende Form; `zero` wird für `0` bevorzugt.
 * - Fehlt der Schlüssel, greift `fallback` (Deutsch), sonst der Schlüssel selbst.
 */
export function translateWith(
  locale: string,
  dictionary: Dictionary,
  fallback: Dictionary,
  key: string,
  params?: TranslationParams,
): string {
  const entry = lookup(dictionary, key) ?? lookup(fallback, key);
  const template = resolveEntry(locale, entry, params);
  if (template === undefined) return key;
  return interpolate(template, params);
}

function resolveEntry(
  locale: string,
  entry: string | Dictionary | undefined,
  params?: TranslationParams,
): string | undefined {
  if (entry === undefined) return undefined;
  if (typeof entry === 'string') return entry;
  const count = Number(params?.['count']);
  if (!Number.isFinite(count)) return typeof entry['other'] === 'string' ? entry['other'] : undefined;
  if (count === 0 && typeof entry['zero'] === 'string') return entry['zero'];
  const category = new Intl.PluralRules(locale).select(count);
  const form = entry[category] ?? entry['other'];
  return typeof form === 'string' ? form : undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function isPluralEntry(entry: unknown): boolean {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    Object.keys(entry).every((key) => (PLURAL_CATEGORIES as readonly string[]).includes(key))
  );
}
