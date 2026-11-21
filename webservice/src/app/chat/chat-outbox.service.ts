import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { Subject, firstValueFrom, type Subscription } from 'rxjs';
import { ApiError } from '../api/api-client.service';
import type { ChatMessageDto, ConversationType } from '../api/api.types';
import { AuthService } from '../auth/auth.service';
import { LiveUpdatesService } from '../live/live-updates.service';
import { ChatApiService } from './chat-api.service';
import { CHAT_OUTBOX_STORAGE_KEY } from './chat-outbox-storage';

export { CHAT_OUTBOX_STORAGE_KEY, clearChatOutbox } from './chat-outbox-storage';


/** Wartezeiten vor erneuten Versuchen; danach bleibt es beim letzten Wert. */
export const CHAT_OUTBOX_RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

/** Nachrichten, die älter sind, verwirft die App beim Start (eine Woche). */
export const CHAT_OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * Eine Nachricht, die noch nicht beim Server angekommen ist.
 *
 * - `pending`: wartet auf Netz und wird automatisch gesendet (Uhr-Symbol)
 * - `failed`: der Server hat sie abgelehnt (z. B. Chat geschlossen); die
 *   Person kann sie erneut senden oder verwerfen
 */
export interface OutboxEntry {
  clientId: string;
  conversationId: string;
  type: ConversationType;
  /** Gruppe des Chats; Direktnachrichten gehören keiner Gruppe. */
  stammtischId: string | null;
  /** Konto, das die Nachricht geschrieben hat. */
  owner: string;
  message: string;
  /** Schon hochgeladene Fotos/Videos, die mit der Nachricht gehen. */
  mediaIds?: string[];
  createdAt: string;
  state: 'pending' | 'failed';
}

/** Eine Nachricht aus der Warteschlange ist angekommen. */
export interface OutboxDelivery {
  entry: OutboxEntry;
  message: ChatMessageDto;
}

/**
 * Offline-Versand für alle Chats: Jede Nachricht geht erst in diese
 * Warteschlange und von dort an den Server. Ohne Netz bleibt sie hier, auch
 * über ein Neuladen der App hinweg, und geht automatisch hinaus, sobald das
 * Netz zurück ist (Ereignis `online`, App wieder im Vordergrund, Live-
 * Verbindung wieder da oder nach kurzer Wartezeit).
 *
 * Jede Nachricht trägt eine eigene `clientId`. Kam eine Nachricht beim Server
 * an, aber die Antwort ging unterwegs verloren, erkennt der Server sie beim
 * erneuten Senden und legt sie nicht doppelt an. Nachrichten gehen der Reihe
 * nach hinaus.
 *
 * Gesendet wird nur, was das angemeldete Konto geschrieben hat; Gruppenchats
 * gehen mit ihrer Gruppe hinaus, auch wenn gerade eine andere gewählt ist. Die Warteschlange liegt
 * unverschlüsselt im Browser dieses Geräts und wird beim Abmelden geleert.
 */
@Injectable({ providedIn: 'root' })
export class ChatOutboxService implements OnDestroy {
  private readonly api = inject(ChatApiService);
  private readonly auth = inject(AuthService);
  private readonly live = inject(LiveUpdatesService);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Alle wartenden und abgelehnten Nachrichten des angemeldeten Kontos. */
  readonly entries = signal<OutboxEntry[]>([]);

  private readonly deliveredSubject = new Subject<OutboxDelivery>();
  /** Angekommene Nachrichten; der Verlauf ersetzt damit die wartende Blase. */
  readonly delivered$ = this.deliveredSubject.asObservable();

  private owner: string | null = null;
  private group: string | null = null;
  private started: Promise<void> | null = null;
  private flushing = false;
  private flushAgain = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryIndex = 0;
  private liveSub?: Subscription;

  private readonly onOnline = () => this.flushNow();
  private readonly onVisibility = () => {
    if (this.document.visibilityState === 'visible') this.flushNow();
  };

  /**
   * Lädt die Warteschlange des angemeldeten Kontos und beginnt zu senden.
   * Mehrfacher Aufruf schadet nicht; `refresh` liest die Session neu (nach
   * einem Gruppenwechsel).
   */
  start(refresh = false): Promise<void> {
    if (!this.browser) return Promise.resolve();
    if (this.started && !refresh) return this.started;
    this.started = this.auth.getSession().then((session) => {
      this.owner = session?.uid ?? null;
      this.group = session?.stammtisch?.id ?? null;
      this.entries.set(this.load());
      if (!this.liveSub) {
        globalThis.addEventListener?.('online', this.onOnline);
        this.document.addEventListener('visibilitychange', this.onVisibility);
        // Live-Verbindung wieder da oder App im Vordergrund: gleich senden.
        this.liveSub = this.live.on().subscribe(() => this.flushNow());
      }
      this.flushNow();
    });
    return this.started;
  }

  ngOnDestroy(): void {
    this.liveSub?.unsubscribe();
    globalThis.removeEventListener?.('online', this.onOnline);
    this.document.removeEventListener?.('visibilitychange', this.onVisibility);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  /** Wartende und abgelehnte Nachrichten eines Gesprächs, älteste zuerst. */
  forConversation(conversationId: string): OutboxEntry[] {
    return this.entries().filter((entry) => entry.conversationId === conversationId);
  }

  /** Nimmt eine Nachricht auf und versucht sofort, sie zu senden. */
  async enqueue(
    conversationId: string,
    type: ConversationType,
    message: string,
    stammtischId?: string | null,
    mediaIds?: string[],
  ): Promise<OutboxEntry> {
    await this.start();
    const entry: OutboxEntry = {
      clientId: newClientId(),
      conversationId,
      type,
      stammtischId: type === 'direct' ? null : (stammtischId ?? this.group),
      owner: this.owner ?? '',
      message,
      ...(mediaIds?.length ? { mediaIds } : {}),
      createdAt: new Date().toISOString(),
      state: 'pending',
    };
    this.update((list) => [...list, entry]);
    this.flushNow();
    return entry;
  }

  /** Sendet eine abgelehnte Nachricht erneut. */
  retry(clientId: string): void {
    this.update((list) => list.map((entry) => (entry.clientId === clientId ? { ...entry, state: 'pending' } : entry)));
    this.flushNow();
  }

  /** Verwirft eine wartende oder abgelehnte Nachricht. */
  discard(clientId: string): void {
    this.update((list) => list.filter((entry) => entry.clientId !== clientId));
  }

  /** Sendet alle wartenden Nachrichten der Reihe nach. */
  flushNow(): void {
    if (!this.browser) return;
    if (this.flushing) {
      this.flushAgain = true;
      return;
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void this.flush();
  }

  private async flush(): Promise<void> {
    this.flushing = true;
    let offline = false;
    try {
      await this.syncSession();
      for (const entry of this.sendable()) {
        // Ohne Netz gar nicht erst versuchen.
        if (globalThis.navigator?.onLine === false) {
          offline = true;
          break;
        }
        // Verworfen, während eine frühere Nachricht unterwegs war?
        if (!this.entries().some((current) => current.clientId === entry.clientId && current.state === 'pending')) continue;
        try {
          const message = await firstValueFrom(
            this.api.send(
              entry.conversationId,
              entry.message,
              entry.type,
              entry.clientId,
              entry.stammtischId,
              entry.mediaIds,
            ),
          );
          this.update((list) => list.filter((current) => current.clientId !== entry.clientId));
          this.retryIndex = 0;
          this.deliveredSubject.next({ entry, message });
        } catch (error) {
          if (isTemporary(error)) {
            // Netz weg, Server kurz nicht da oder Anmeldung abgelaufen: später weiter.
            offline = true;
            break;
          }
          this.update((list) =>
            list.map((current) => (current.clientId === entry.clientId ? { ...current, state: 'failed' } : current)),
          );
        }
      }
    } finally {
      this.flushing = false;
    }
    const again = this.flushAgain;
    this.flushAgain = false;
    // Ohne Netz nicht sofort wieder versuchen, sondern nach der Wartezeit.
    if (offline) this.scheduleRetry();
    else if (again) this.flushNow();
  }

  /**
   * Konto und Gruppe können sich seit dem Start geändert haben (Gruppenwechsel,
   * neue Anmeldung). Die Session ist zwischengespeichert; nach einem Wechsel
   * fragt [AuthService] sie neu ab.
   */
  private async syncSession(): Promise<void> {
    await this.start();
    const session = await this.auth.getSession().catch(() => null);
    const owner = session?.uid ?? null;
    this.group = session?.stammtisch?.id ?? null;
    if (owner !== this.owner) {
      this.owner = owner;
      this.entries.set(this.load());
    }
  }

  /**
   * Was jetzt gesendet werden darf: eigenes Konto. Gruppenchats gehen mit ihrer
   * Gruppe hinaus, unabhängig von der gewählten; ohne bekannte Gruppe nur in
   * der gewählten.
   */
  private sendable(): OutboxEntry[] {
    return this.entries().filter(
      (entry) =>
        entry.state === 'pending' &&
        entry.owner === (this.owner ?? '') &&
        (entry.type === 'direct' || !!entry.stammtischId || this.group === null),
    );
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.sendable().length === 0) return;
    const delay = CHAT_OUTBOX_RETRY_MS[Math.min(this.retryIndex, CHAT_OUTBOX_RETRY_MS.length - 1)];
    this.retryIndex++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flushNow();
    }, delay);
  }

  private update(change: (list: OutboxEntry[]) => OutboxEntry[]): void {
    this.entries.update(change);
    this.save();
  }

  /** Nur Einträge des angemeldeten Kontos; Einträge anderer Konten auf dem Gerät bleiben liegen. */
  private load(): OutboxEntry[] {
    const all = this.readAll();
    const cutoff = Date.now() - CHAT_OUTBOX_MAX_AGE_MS;
    return all.filter((entry) => entry.owner === (this.owner ?? '') && Date.parse(entry.createdAt) >= cutoff);
  }

  private save(): void {
    const mine = this.entries();
    const others = this.readAll().filter((entry) => entry.owner !== (this.owner ?? ''));
    try {
      const all = [...others, ...mine];
      if (all.length === 0) globalThis.localStorage?.removeItem(CHAT_OUTBOX_STORAGE_KEY);
      else globalThis.localStorage?.setItem(CHAT_OUTBOX_STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Kein Speicher: die Warteschlange hält dann nur, solange die App offen ist.
    }
  }

  private readAll(): OutboxEntry[] {
    try {
      const raw = globalThis.localStorage?.getItem(CHAT_OUTBOX_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
      return [];
    }
  }
}

/** Netz weg, Zeitüberschreitung, Server überlastet oder Anmeldung abgelaufen. */
function isTemporary(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 401 || error.status === 408 || error.status === 429 || error.status >= 500;
}

function isEntry(value: unknown): value is OutboxEntry {
  const entry = value as Partial<OutboxEntry> | null;
  return (
    !!entry &&
    typeof entry.clientId === 'string' &&
    typeof entry.conversationId === 'string' &&
    typeof entry.message === 'string' &&
    typeof entry.owner === 'string' &&
    typeof entry.createdAt === 'string' &&
    (entry.state === 'pending' || entry.state === 'failed')
  );
}

function newClientId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
