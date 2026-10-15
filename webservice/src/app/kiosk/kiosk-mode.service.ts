import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

/** Einzige Seite, die im Kiosk-Modus erreichbar ist. */
export const KIOSK_HOME = '/tablet';

const STORAGE_KEY = 'vereint.kiosk';

interface StoredKiosk {
  active: true;
  eventId: string | null;
}

/**
 * Kiosk-Modus des Thekenterminals auf diesem Gerät.
 *
 * Der Zustand liegt im `localStorage` und übersteht damit Neuladen, Schließen
 * des Tabs oder der App und einen Neustart des Browsers. Solange er aktiv ist,
 * leitet der [kioskGuard] jede Navigation auf `/tablet` um, und die Shell blendet
 * Navigation und Abmelden aus. Beenden lässt sich der Modus nur über
 * [deactivate], das die Oberfläche erst nach einer vom Server bestätigten PIN
 * aufruft.
 *
 * Ist kein Speicher verfügbar (privates Fenster mit Sperre), gilt der Modus nur
 * für die laufende Sitzung.
 */
@Injectable({ providedIn: 'root' })
export class KioskModeService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = signal<StoredKiosk | null>(this.read());

  /** Ist der Kiosk-Modus auf diesem Gerät aktiv? */
  readonly active = computed(() => this.state() !== null);

  /** Zuletzt im Kiosk-Modus gewähltes Event, damit das Terminal dort weitermacht. */
  readonly eventId = computed(() => this.state()?.eventId ?? null);

  /** Soll der PIN-Dialog zum Verlassen gerade offen sein? */
  readonly unlockOpen = signal(false);

  requestUnlock(): void {
    if (this.active()) this.unlockOpen.set(true);
  }

  cancelUnlock(): void {
    this.unlockOpen.set(false);
  }

  activate(eventId: string | null): void {
    this.store({ active: true, eventId });
  }

  /** Merkt sich das gewählte Event, solange der Modus aktiv ist. */
  rememberEvent(eventId: string | null): void {
    const current = this.state();
    if (!current || current.eventId === eventId) return;
    this.store({ ...current, eventId });
  }

  /** Beendet den Modus. Nur nach erfolgreicher PIN-Prüfung aufrufen. */
  deactivate(): void {
    this.state.set(null);
    this.unlockOpen.set(false);
    if (!this.isBrowser) return;
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Ohne Speicher gab es nichts Dauerhaftes zu entfernen.
    }
  }

  private store(value: StoredKiosk): void {
    this.state.set(value);
    if (!this.isBrowser) return;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Ohne Speicher gilt der Modus nur für diese Sitzung.
    }
  }

  private read(): StoredKiosk | null {
    if (!this.isBrowser) return null;
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredKiosk> | null;
      // Ein beschädigter Eintrag hält das Gerät trotzdem gesperrt.
      const eventId = typeof parsed?.eventId === 'string' ? parsed.eventId : null;
      return { active: true, eventId };
    } catch {
      return null;
    }
  }
}
