import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';

/** Kiosk-Sitzung eines Geräts; die PIN liefert der Server nie aus. */
export interface KioskSession {
  id: string;
  label: string;
  startedByName: string | null;
  startedAt: string;
  active: boolean;
  /** `pin` (am Gerät entsperrt) oder `remote` (von Vorstand/Administration beendet). */
  endReason: 'pin' | 'remote' | null;
  lockedUntil: string | null;
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
export const KIOSK_PIN_PATTERN = new RegExp(`^[0-9]{${KIOSK_PIN_MIN_LENGTH},${KIOSK_PIN_MAX_LENGTH}}$`);

/**
 * Endpunkte der Kiosk-Sitzungen (`/api/v1/kiosk/sessions`). Die PIN geht nur im
 * Body an den Server, der sie als Hash speichert, Fehlversuche zählt und sperrt.
 */
@Injectable({ providedIn: 'root' })
export class KioskApiService {
  private readonly api = inject(ApiClient);

  private path(id: string): string {
    return `/kiosk/sessions/${encodeURIComponent(id)}`;
  }

  start(pin: string, label?: string): Observable<KioskSession> {
    return this.api.post<KioskSession>('/kiosk/sessions', { pin, label: label || undefined });
  }

  state(id: string): Observable<KioskSession> {
    return this.api.get<KioskSession>(this.path(id));
  }

  unlock(id: string, pin: string): Observable<KioskUnlockResult> {
    return this.api.post<KioskUnlockResult>(`${this.path(id)}/unlock`, { pin });
  }

  /** Laufende Sitzungen (nur Vorstand und Administration). */
  listActive(): Observable<KioskSession[]> {
    return this.api.get<KioskSession[]>('/kiosk/sessions');
  }

  /** Beendet eine Sitzung aus der Ferne, ohne PIN (nur Vorstand und Administration). */
  endRemotely(id: string): Observable<KioskSession> {
    return this.api.post<KioskSession>(`${this.path(id)}/end`, {});
  }
}
