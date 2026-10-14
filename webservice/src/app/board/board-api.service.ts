import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type { PagedResponse, UserSummary } from '../auth/auth.types';
import type {
  AuditLogEntry,
  BroadcastPayload,
  BroadcastResult,
  ConversationSummary,
  DirectoryMember,
  MemberBalanceOverview,
  CorrectionPayload,
  EventLedgerSummary,
  EventSummary,
  LedgerEntry,
  MemberBalance,
  MemberProfile,
  NotificationMessage,
  PayoutPayload,
  SendNotificationPayload,
  TopupPayload,
} from '../api/api.types';

/** Header-Name für idempotente finanzielle Schreibvorgänge. */
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/**
 * Fachlicher Datenzugriff der Vorstands-, Kassen- und Kommunikationskontexte
 * (TICKET-026).
 *
 * Bündelt die für Vorstand/Admin freigegebenen Endpunkte: Eventmoderation,
 * Eventabrechnung und Kassenbuchungen (Ledger), Mitteilungen (Notifications)
 * sowie das Audit-Protokoll. Der Service formuliert ausschließlich die Aufrufe
 * an den Express-Auslieferungs-Proxy (`/api/v1`); jede Berechtigungsprüfung
 * erfolgt serverseitig im Spring-Fachservice (`deny by default`).
 */
@Injectable({ providedIn: 'root' })
export class BoardApiService {
  private readonly api = inject(ApiClient);

  private idempotency(key: string): Record<string, string> {
    return { [IDEMPOTENCY_HEADER]: key };
  }

  /** Eigenes Profil, um Vorstands-/Adminkontext und Unterrolle zu bestimmen. */
  loadProfile(): Observable<MemberProfile> {
    return this.api.get<MemberProfile>('/users/me');
  }

  /** Für den Aufrufer sichtbare Events zur Moderation (`GET /events`). */
  listEvents(): Observable<EventSummary[]> {
    return this.api.get<EventSummary[]>('/events');
  }

  /** Aggregierte Eventabrechnung (`GET /ledger/events/{id}/summary`). */
  getEventSummary(eventId: string): Observable<EventLedgerSummary> {
    return this.api.get<EventLedgerSummary>(
      `/ledger/events/${encodeURIComponent(eventId)}/summary`,
    );
  }

  /** Guthabenübersicht aller Mitglieder (`GET /ledger/balances`). */
  listBalances(): Observable<MemberBalanceOverview[]> {
    return this.api.get<MemberBalanceOverview[]>('/ledger/balances');
  }

  /** Guthaben einer beliebigen Person (`GET /ledger/members/{id}/balance`). */
  getBalance(memberId: string): Observable<MemberBalance> {
    return this.api.get<MemberBalance>(
      `/ledger/members/${encodeURIComponent(memberId)}/balance`,
    );
  }

  /** Kontoauszug einer beliebigen Person (`GET /ledger/members/{id}/entries`). */
  listEntries(memberId: string): Observable<LedgerEntry[]> {
    return this.api.get<LedgerEntry[]>(
      `/ledger/members/${encodeURIComponent(memberId)}/entries`,
    );
  }

  /** Guthaben aufladen (`POST /ledger/topups`). Verlangt einen Idempotency-Key. */
  topup(payload: TopupPayload, idempotencyKey: string): Observable<LedgerEntry> {
    return this.api.post<LedgerEntry>('/ledger/topups', payload, this.idempotency(idempotencyKey));
  }

  /** Guthaben auszahlen (`POST /ledger/payouts`). Verlangt einen Idempotency-Key. */
  payout(payload: PayoutPayload, idempotencyKey: string): Observable<LedgerEntry> {
    return this.api.post<LedgerEntry>('/ledger/payouts', payload, this.idempotency(idempotencyKey));
  }

  /** Buchung korrigieren (`POST /ledger/corrections`). Verlangt einen Idempotency-Key. */
  correct(payload: CorrectionPayload, idempotencyKey: string): Observable<LedgerEntry> {
    return this.api.post<LedgerEntry>(
      '/ledger/corrections',
      payload,
      this.idempotency(idempotencyKey),
    );
  }

  /** Mitglieder zur Empfängerauswahl (`GET /users?search=`). */
  listUsers(search?: string): Observable<PagedResponse<UserSummary>> {
    const trimmed = (search ?? '').trim();
    const path = trimmed ? `/users?search=${encodeURIComponent(trimmed)}` : '/users';
    return this.api.get<PagedResponse<UserSummary>>(path);
  }

  /** Aktive Mitglieder zur Empfängerauswahl (`GET /users/directory`). */
  listDirectory(): Observable<DirectoryMember[]> {
    return this.api.get<DirectoryMember[]>('/users/directory');
  }

  /** Rundbrief an ausgewählte oder alle Mitglieder (`POST /notifications/broadcast`). */
  broadcast(payload: BroadcastPayload): Observable<BroadcastResult> {
    return this.api.post<BroadcastResult>('/notifications/broadcast', payload);
  }

  /** Vereinschat inkl. angepinnter Infotafel (`GET /conversations/club`). */
  getClubConversation(): Observable<ConversationSummary> {
    return this.api.get<ConversationSummary>('/conversations/club');
  }

  /** Infotafel des Vereinschats setzen oder mit `null` entfernen (`PUT /conversations/club/pin`). */
  pinClubNotice(text: string | null): Observable<ConversationSummary> {
    return this.api.put<ConversationSummary>('/conversations/club/pin', { text });
  }

  /** Benachrichtigung an ein Mitglied senden (`POST /notifications`). */
  sendNotification(payload: SendNotificationPayload): Observable<NotificationMessage> {
    return this.api.post<NotificationMessage>('/notifications', payload);
  }

  /**
   * Audit-Protokoll (`GET /audit-logs`), optional auf eine Zielart gefiltert.
   * Die sichtbaren Bereiche begrenzt der Fachservice je Vorstands-Unterrolle.
   */
  listAuditLogs(targetEntity?: string): Observable<PagedResponse<AuditLogEntry>> {
    const path = targetEntity
      ? `/audit-logs?targetEntity=${encodeURIComponent(targetEntity)}`
      : '/audit-logs';
    return this.api.get<PagedResponse<AuditLogEntry>>(path);
  }
}
