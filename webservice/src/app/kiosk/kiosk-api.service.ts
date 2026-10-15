import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';

/** Ob eine Kiosk-PIN gesetzt ist; die PIN selbst liefert der Server nie aus. */
export interface KioskStatus {
  pinConfigured: boolean;
  pinUpdatedAt: string | null;
  /** Nur für Vorstand und Administration befüllt. */
  pinUpdatedByName: string | null;
}

/** Ergebnis einer PIN-Prüfung am Gerät. */
export interface KioskUnlockResult {
  unlocked: boolean;
  remainingAttempts: number | null;
  lockedUntil: string | null;
}

/** Erlaubte PIN-Länge; der Fachservice prüft dieselben Grenzen. */
export const KIOSK_PIN_MIN_LENGTH = 4;
export const KIOSK_PIN_MAX_LENGTH = 8;

/**
 * Endpunkte der Kiosk-PIN (`/api/v1/kiosk`). Die PIN geht nur im Body an den
 * Server, der sie als Hash speichert, Fehlversuche zählt und sperrt.
 */
@Injectable({ providedIn: 'root' })
export class KioskApiService {
  private readonly api = inject(ApiClient);

  status(): Observable<KioskStatus> {
    return this.api.get<KioskStatus>('/kiosk/pin');
  }

  setPin(pin: string): Observable<KioskStatus> {
    return this.api.put<KioskStatus>('/kiosk/pin', { pin });
  }

  unlock(pin: string): Observable<KioskUnlockResult> {
    return this.api.post<KioskUnlockResult>('/kiosk/unlock', { pin });
  }
}
