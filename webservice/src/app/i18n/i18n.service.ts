import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, REQUEST, computed, inject, signal } from '@angular/core';
import de from './locales/de.json';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  type Dictionary,
  type LanguageDefinition,
  findLanguage,
  negotiateLanguage,
} from './languages';
import { type TranslationParams, translateWith } from './translate';

/** Cookie mit der gewählten Sprache; lesen SSR, BFF (Keycloak-Login) und Browser. */
export const LANGUAGE_COOKIE = 'vereint.lang';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const FALLBACK: Dictionary = de as Dictionary;

/** Zuletzt initialisierte Instanz; Grundlage für {@link translate} außerhalb von DI. */
let active: I18nService | undefined;

/**
 * Laufzeit-Übersetzung der App.
 *
 * Ein Wörterbuch je Sprache (`locales/<code>.json`), gewechselt wird ohne Neuladen
 * und ohne eigenen Build je Sprache. Ermittlung der Sprache:
 * 1. Cookie `vereint.lang` (ausdrückliche Wahl im Profil),
 * 2. Browsersprache (`navigator.languages` bzw. `Accept-Language` beim SSR),
 * 3. Deutsch.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly request = inject(REQUEST, { optional: true });

  private readonly dictionary = signal<Dictionary>(FALLBACK);

  readonly languages: readonly LanguageDefinition[] = LANGUAGES;
  readonly language = signal(DEFAULT_LANGUAGE);
  /** BCP-47-Locale der aktuellen Sprache für `Intl`-Formate. */
  readonly locale = computed(() => findLanguage(this.language())?.locale ?? 'de-DE');

  constructor() {
    active = this;
  }

  /** Ermittelt die Startsprache und lädt deren Wörterbuch (App-Initializer). */
  async init(): Promise<void> {
    await this.apply(this.detect());
  }

  /** Wechselt die Sprache und merkt sie sich im Cookie. */
  async use(code: string): Promise<void> {
    const language = findLanguage(code);
    if (!language) return;
    await this.apply(language.code);
    this.persist(language.code);
  }

  t(key: string, params?: TranslationParams): string {
    return translateWith(this.locale(), this.dictionary(), FALLBACK, key, params);
  }

  private detect(): string {
    const stored = findLanguage(readCookie(this.cookieHeader(), LANGUAGE_COOKIE));
    if (stored) return stored.code;
    if (this.isBrowser) return negotiateLanguage(globalThis.navigator?.languages ?? []);
    return negotiateLanguage(this.request?.headers.get('accept-language'));
  }

  private async apply(code: string): Promise<void> {
    const language = findLanguage(code) ?? findLanguage(DEFAULT_LANGUAGE)!;
    try {
      const dictionary =
        language.code === DEFAULT_LANGUAGE ? FALLBACK : ((await language.load()).default as Dictionary);
      this.dictionary.set(dictionary);
      this.language.set(language.code);
    } catch {
      // Wörterbuch nicht ladbar (z. B. offline): bei der bisherigen Sprache bleiben.
    }
    this.document.documentElement.lang = this.language();
  }

  private cookieHeader(): string {
    if (this.isBrowser) return this.document.cookie ?? '';
    return this.request?.headers.get('cookie') ?? '';
  }

  private persist(code: string): void {
    if (!this.isBrowser) return;
    const secure = globalThis.location?.protocol === 'https:' ? '; Secure' : '';
    this.document.cookie =
      `${LANGUAGE_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
  }
}

/**
 * Übersetzt außerhalb von Komponenten (Formatierungshelfer, Services ohne DI).
 * In Komponenten-Templates stattdessen die Pipe `| t` verwenden.
 */
export function translate(key: string, params?: TranslationParams): string {
  if (active) return active.t(key, params);
  return translateWith('de-DE', FALLBACK, FALLBACK, key, params);
}

/** BCP-47-Locale der aktiven Sprache für `Intl`-Formate außerhalb von DI. */
export function activeLocale(): string {
  return active?.locale() ?? 'de-DE';
}

export function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}
