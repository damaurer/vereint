import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, NgZone, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { Observable, Subject, filter } from 'rxjs';

/** Pfad der Live-Verbindung; der BFF reicht sie an den Fachservice durch. */
export const LIVE_URL = '/api/v1/live';

/** Ohne Lebenszeichen (der Server schickt alle 25 s eins) gilt die Verbindung als tot. */
export const LIVE_WATCHDOG_MS = 70_000;

/** Wartezeit vor einem neuen Versuch, wenn der Browser selbst aufgegeben hat; wächst bis zum Maximum. */
export const LIVE_RETRY_MIN_MS = 5_000;
export const LIVE_RETRY_MAX_MS = 5 * 60_000;

/**
 * Signal vom Server. Es trägt keinen Inhalt, nur was sich geändert hat; die
 * Seiten laden die betroffenen Daten dann selbst.
 *
 * - `chat`: Nachricht oder Reaktion in einem Gruppen-, Event- oder Moment-Chat
 * - `direct`: Nachricht oder Reaktion in einer Direktnachricht
 * - `read`: eigener Lesestand hat sich geändert (anderes Gerät)
 * - `notification`: neue Mitteilung
 * - `resync`: Verbindung kam zurück oder die App wieder in den Vordergrund;
 *   dazwischen kann etwas verpasst worden sein, also alles neu laden
 */
export type LiveEventType = 'chat' | 'direct' | 'read' | 'notification' | 'resync';

export interface LiveEvent {
  type: LiveEventType;
  stammtischId?: string | null;
  conversationId?: string | null;
}

const SERVER_EVENTS: LiveEventType[] = ['chat', 'direct', 'read', 'notification'];

/**
 * Live-Verbindung der App über Server-Sent Events.
 *
 * Solange [connected] gilt, kommen Änderungen sofort an und die Seiten können
 * ihre regelmäßige Abfrage auslassen. Fällt die Verbindung aus (Netz weg,
 * Proxy puffert, Server neu gestartet), bleibt [connected] `false` und die
 * Abfrage läuft wie bisher weiter. Läuft nur im Browser.
 */
@Injectable({ providedIn: 'root' })
export class LiveUpdatesService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  /** `true`, sobald der Server die Verbindung bestätigt hat. */
  readonly connected = signal(false);

  private readonly subject = new Subject<LiveEvent>();
  private source: EventSource | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = LIVE_RETRY_MIN_MS;
  private wanted = false;
  private everReady = false;

  private readonly onVisibility = () => {
    if (this.document.visibilityState !== 'visible' || !this.wanted) return;
    // Mobile Browser frieren Verbindungen im Hintergrund ein: neu aufbauen und abgleichen.
    if (!this.connected()) this.open();
    this.emit({ type: 'resync' });
  };

  /** Alle Signale, in der Angular-Zone. */
  readonly events$: Observable<LiveEvent> = this.subject.asObservable();

  /** Signale der genannten Arten; `resync` ist immer dabei. */
  on(...types: LiveEventType[]): Observable<LiveEvent> {
    return this.events$.pipe(filter((event) => event.type === 'resync' || types.includes(event.type)));
  }

  /** Baut die Verbindung auf (mehrfacher Aufruf schadet nicht). */
  start(): void {
    if (!isPlatformBrowser(this.platformId) || typeof EventSource === 'undefined' || this.wanted) return;
    this.wanted = true;
    this.document.addEventListener('visibilitychange', this.onVisibility);
    this.open();
  }

  /** Trennt die Verbindung, etwa nach dem Abmelden. */
  stop(): void {
    this.wanted = false;
    this.document.removeEventListener?.('visibilitychange', this.onVisibility);
    this.close();
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
  }

  ngOnDestroy(): void {
    this.stop();
    this.subject.complete();
  }

  private open(): void {
    this.close();
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    // Außerhalb der Zone: Lebenszeichen sollen keine Change Detection auslösen.
    this.zone.runOutsideAngular(() => {
      const source = new EventSource(LIVE_URL);
      this.source = source;
      source.addEventListener('ready', () => {
        this.retryDelay = LIVE_RETRY_MIN_MS;
        this.armWatchdog();
        this.zone.run(() => this.connected.set(true));
        // Nach einem Wiederaufbau kann etwas verpasst worden sein.
        if (this.everReady) this.emit({ type: 'resync' });
        this.everReady = true;
      });
      source.addEventListener('ping', () => this.armWatchdog());
      for (const type of SERVER_EVENTS) {
        source.addEventListener(type, (message) => {
          this.armWatchdog();
          this.emit(parse(type, (message as MessageEvent<string>).data));
        });
      }
      source.onerror = () => {
        if (this.source !== source) return;
        this.zone.run(() => this.connected.set(false));
        // CONNECTING: der Browser versucht es selbst erneut. CLOSED (z. B. 401,
        // falscher Inhaltstyp): selbst mit wachsendem Abstand neu versuchen.
        if (source.readyState === EventSource.CLOSED) this.scheduleRetry();
      };
    });
  }

  private close(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    this.source?.close();
    this.source = null;
    if (this.connected()) this.zone.run(() => this.connected.set(false));
  }

  private scheduleRetry(): void {
    this.close();
    if (!this.wanted) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, LIVE_RETRY_MAX_MS);
    this.retry = setTimeout(() => this.open(), delay);
  }

  private armWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.scheduleRetry(), LIVE_WATCHDOG_MS);
  }

  private emit(event: LiveEvent): void {
    this.zone.run(() => this.subject.next(event));
  }
}

function parse(type: LiveEventType, data: string | undefined): LiveEvent {
  try {
    const value = JSON.parse(data ?? '{}') as Partial<LiveEvent>;
    return { type, stammtischId: value.stammtischId ?? null, conversationId: value.conversationId ?? null };
  } catch {
    return { type };
  }
}
