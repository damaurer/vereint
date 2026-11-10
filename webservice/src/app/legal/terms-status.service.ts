import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import type { TermsStatus } from '../api/api.types';

/** Adresse der Seite, auf der man der aktuellen AGB-Fassung zustimmt. */
export const TERMS_CONSENT_PATH = 'agb-zustimmen';

/**
 * Stand der AGB-Zustimmung des angemeldeten Kontos.
 *
 * Nach dem Login fragt die App den Fachservice (`GET /api/v1/users/me/terms`),
 * ob das Konto der gültigen Fassung zugestimmt hat. Fehlt die Zustimmung oder
 * ist sie älter, führen die Guards auf die Zustimmungsseite; vorher ist die App
 * nicht nutzbar. Das gilt für alle Konten, auch vom Admin angelegte und
 * bestehende.
 *
 * Der Wert steuert nur die Navigation. Die Sperre selbst sitzt im Fachservice
 * (`403 terms_required`). Ist der Stand nicht abrufbar (Netz, Wartung), lässt
 * der Guard deshalb passieren, statt Angemeldete auszusperren.
 */
@Injectable({ providedIn: 'root' })
export class TermsStatusService {
  private request: Promise<TermsStatus | null> | null = null;

  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  /** Stand vom Fachservice; je Sitzung einmal geladen, bis [clear] oder [accept]. */
  status(force = false): Promise<TermsStatus | null> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve(null);
    if (force || !this.request) {
      this.request = this.load().then((value) => {
        // Fehlschläge nicht merken: der nächste Seitenwechsel fragt erneut.
        if (value === null) this.request = null;
        return value;
      });
    }
    return this.request;
  }

  /** `false` nur, wenn der Fachservice eine fehlende Zustimmung meldet. */
  async isAccepted(): Promise<boolean> {
    const status = await this.status();
    return status === null ? true : status.accepted;
  }

  /** Stimmt der gültigen Fassung zu; `true`, wenn gespeichert. */
  async accept(): Promise<boolean> {
    try {
      const response = await fetch('/api/v1/users/me/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ acceptTerms: true }),
      });
      if (!response.ok) return false;
      const status = (await response.json()) as TermsStatus;
      this.request = Promise.resolve(status);
      return status.accepted === true;
    } catch {
      return false;
    }
  }

  /** Verwirft den gemerkten Stand, etwa nach dem Abmelden. */
  clear(): void {
    this.request = null;
  }

  private async load(): Promise<TermsStatus | null> {
    try {
      const response = await fetch('/api/v1/users/me/terms', { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      const body = (await response.json()) as Partial<TermsStatus> | null;
      return body && typeof body.accepted === 'boolean' ? (body as TermsStatus) : null;
    } catch {
      return null;
    }
  }
}
