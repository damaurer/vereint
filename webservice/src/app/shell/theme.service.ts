import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

/** Darstellungswunsch: dem System folgen oder fest hell/dunkel. */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'vereint.theme';
const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/**
 * Hell-/Dunkelmodus der App.
 *
 * Setzt `data-theme` auf `<html>`; die Farb-Tokens dafür stehen in
 * `styles.css`. „System“ entfernt das Attribut, dann greift
 * `prefers-color-scheme`. Die Wahl liegt nur im Browser (localStorage) und ist
 * reine Komfortfunktion: ohne Speicher fällt sie still auf „System“ zurück.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly preference = signal<ThemePreference>('system');

  /** Liest die gespeicherte Wahl und wendet sie an (nur im Browser). */
  init(): void {
    if (!this.isBrowser) return;
    this.preference.set(this.read());
    this.apply(this.preference());
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    if (!this.isBrowser) return;
    this.write(preference);
    this.apply(preference);
  }

  private apply(preference: ThemePreference): void {
    const root = this.document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
  }

  private read(): ThemePreference {
    try {
      const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
      return PREFERENCES.includes(stored as ThemePreference) ? (stored as ThemePreference) : 'system';
    } catch {
      return 'system';
    }
  }

  private write(preference: ThemePreference): void {
    try {
      if (preference === 'system') globalThis.localStorage?.removeItem(STORAGE_KEY);
      else globalThis.localStorage?.setItem(STORAGE_KEY, preference);
    } catch {
      // Ohne Speicher gilt die Wahl nur für diese Sitzung.
    }
  }
}
