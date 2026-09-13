import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { REMEMBERED_LOGIN_STORAGE_KEY, RememberedLogin, isEmailAddress } from './auth.types';

/**
 * Merkt sich für die „Angemeldet bleiben“-Funktion ausschließlich die
 * Emailadresse des letzten Logins. Passwörter, ID-Tokens oder andere
 * Anmeldegeheimnisse werden nie gespeichert.
 */
@Injectable({ providedIn: 'root' })
export class RememberedLoginService {
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  read(): RememberedLogin | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const email = this.normalize(this.readRaw());
    return email ? { email } : null;
  }

  remember(email: string): void {
    const normalized = this.normalize(email);
    if (!isPlatformBrowser(this.platformId) || !normalized) return;
    try {
      localStorage.setItem(REMEMBERED_LOGIN_STORAGE_KEY, normalized);
    } catch {
      // Privater Modus oder blockierter Storage: Merken bleibt optional.
    }
  }

  forget(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.removeItem(REMEMBERED_LOGIN_STORAGE_KEY);
    } catch {
      // Kein Storage verfügbar.
    }
  }

  private readRaw(): string | null {
    try {
      return localStorage.getItem(REMEMBERED_LOGIN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private normalize(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const candidate = value.trim().toLowerCase();
    return isEmailAddress(candidate) ? candidate : null;
  }
}
