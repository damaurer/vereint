import { TestBed } from '@angular/core/testing';
import de from './locales/de.json';
import en from './locales/en.json';
import { I18nService, readCookie, translate } from './i18n.service';
import { LANGUAGES, negotiateLanguage } from './languages';
import { translateWith } from './translate';

/** Alle Blatt-Schlüssel eines Wörterbuchs (`a.b.c`); Pluralobjekte zählen als Blatt. */
function leafKeys(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix];
  const entries = Object.entries(node as Record<string, unknown>);
  const isPlural = entries.every(([key]) => ['zero', 'one', 'two', 'few', 'many', 'other'].includes(key));
  if (isPlural && prefix) return [prefix];
  return entries.flatMap(([key, value]) => leafKeys(value, prefix ? `${prefix}.${key}` : key));
}

describe('I18nService', () => {
  afterEach(async () => {
    document.cookie = 'vereint.lang=; Path=/; Max-Age=0';
    await TestBed.inject(I18nService).use('de');
    document.cookie = 'vereint.lang=; Path=/; Max-Age=0';
  });

  it('defaults to German and translates synchronously', () => {
    const i18n = TestBed.inject(I18nService);
    expect(i18n.language()).toBe('de');
    expect(i18n.t('common.save')).toBe('Speichern');
    expect(translate('common.save')).toBe('Speichern');
  });

  it('loads another language on demand and remembers the choice in a cookie', async () => {
    const i18n = TestBed.inject(I18nService);
    await i18n.use('en');
    expect(i18n.t('common.save')).toBe('Save');
    expect(i18n.locale()).toBe('en-GB');
    expect(document.documentElement.lang).toBe('en');
    expect(readCookie(document.cookie, 'vereint.lang')).toBe('en');
  });

  it('ignores unknown languages', async () => {
    const i18n = TestBed.inject(I18nService);
    await i18n.use('xx');
    expect(i18n.language()).toBe('de');
  });

  it('prefers the stored cookie over the browser language on init', async () => {
    document.cookie = 'vereint.lang=en; Path=/';
    const i18n = TestBed.inject(I18nService);
    await i18n.init();
    expect(i18n.language()).toBe('en');
  });
});

describe('translateWith', () => {
  const dict = {
    greeting: 'Hallo {name}',
    items: { zero: 'Keine Einträge', one: 'Ein Eintrag', other: '{count} Einträge' },
  };

  it('fills placeholders and keeps unknown ones', () => {
    expect(translateWith('de-DE', dict, dict, 'greeting', { name: 'Ada' })).toBe('Hallo Ada');
    expect(translateWith('de-DE', dict, dict, 'greeting')).toBe('Hallo {name}');
  });

  it('picks plural forms', () => {
    expect(translateWith('de-DE', dict, dict, 'items', { count: 0 })).toBe('Keine Einträge');
    expect(translateWith('de-DE', dict, dict, 'items', { count: 1 })).toBe('Ein Eintrag');
    expect(translateWith('de-DE', dict, dict, 'items', { count: 3 })).toBe('3 Einträge');
  });

  it('falls back to the fallback dictionary, then to the key', () => {
    expect(translateWith('en-GB', {}, dict, 'greeting', { name: 'Ada' })).toBe('Hallo Ada');
    expect(translateWith('en-GB', {}, dict, 'missing.key')).toBe('missing.key');
  });
});

describe('negotiateLanguage', () => {
  it('honours quality weights and regional tags', () => {
    expect(negotiateLanguage('fr-FR,en-US;q=0.8,de;q=0.5')).toBe('en');
    expect(negotiateLanguage('de-AT')).toBe('de');
    expect(negotiateLanguage(['fr', 'en-GB'])).toBe('en');
    expect(negotiateLanguage('fr')).toBe('de');
    expect(negotiateLanguage(null)).toBe('de');
  });
});

describe('dictionaries', () => {
  it('registers every language exactly once', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes[0]).toBe('de');
  });

  it('keeps English complete: every German key exists in en.json and vice versa', () => {
    expect(leafKeys(en).sort()).toEqual(leafKeys(de).sort());
  });

  it('keeps the same placeholders in every translation', () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    const flat = (node: unknown, prefix = ''): [string, string][] =>
      typeof node === 'string'
        ? [[prefix, node]]
        : Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
            flat(v, prefix ? `${prefix}.${k}` : k),
          );
    const english = new Map(flat(en));
    for (const [key, text] of flat(de)) {
      if (!english.has(key)) continue;
      // Pluralformen dürfen `{count}` weglassen (z. B. „Ein Eintrag“).
      const strip = (list: string[]) => list.filter((p) => p !== '{count}');
      expect(strip(placeholders(english.get(key)!)), key).toEqual(strip(placeholders(text)));
    }
  });
});
