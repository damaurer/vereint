import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type {
  RecurrencePayload,
  RecurrencePreview,
  ChatMessageDto,
  ConversationSummary,
  CreateEventPayload,
  DirectoryMember,
  EventDetail,
  EventParticipant,
  EventSummary,
  LedgerEntry,
  MemberBalance,
  MemberProfile,
  MomentConfigDto,
  MomentDetailDto,
  MomentMapGeoJsonDto,
  MomentReactionDto,
  MomentResponseDto,
  MomentSessionDto,
  MomentSummaryDto,
  MomentTypeDto,
  MomentWorldMapPinDto,
  PurchasePreview,
  PurchasableDrink,
  DrinkRef,
  ForeignDrink,
  RsvpStatus,
  SaveMomentReactionRequest,
  SaveMomentTypeRequest,
  StartMomentRequest,
  SubmitMomentResponseRequest,
  UpdateProfilePayload,
} from '../api/api.types';

/**
 * Fachlicher Datenzugriff der Mitglieder-PWA (TICKET-024).
 *
 * Bündelt die vom Mitglied genutzten Endpunkte für Profil, Events, Guthaben und
 * Käufe. Die eigentliche Autorisierung erfolgt serverseitig im Spring-Service;
 * dieser Service formuliert ausschließlich die Aufrufe.
 */
@Injectable({ providedIn: 'root' })
export class MemberApiService {
  private readonly api = inject(ApiClient);

  /** Eigenes Profil (`GET /api/v1/users/me`). */
  loadProfile(): Observable<MemberProfile> {
    return this.api.get<MemberProfile>('/users/me');
  }

  /** Aktualisiert Anzeigename und/oder E-Mail (`PUT /api/v1/users/me`). */
  updateProfile(payload: UpdateProfilePayload): Observable<MemberProfile> {
    return this.api.put<MemberProfile>('/users/me', payload);
  }

  /** Für das Mitglied sichtbare Events (`GET /api/v1/events`). */
  listEvents(): Observable<EventSummary[]> {
    return this.api.get<EventSummary[]>('/events');
  }

  /** Eventdetails (`GET /api/v1/events/{id}`). */
  getEvent(eventId: string): Observable<EventDetail> {
    return this.api.get<EventDetail>(`/events/${encodeURIComponent(eventId)}`);
  }

  /** Teilnehmer eines Events (`GET /api/v1/events/{id}/participants`). */
  listParticipants(eventId: string): Observable<EventParticipant[]> {
    return this.api.get<EventParticipant[]>(`/events/${encodeURIComponent(eventId)}/participants`);
  }

  /** Legt ein Event an (`POST /api/v1/events`); jedes Mitglied darf das. */
  createEvent(payload: CreateEventPayload): Observable<EventDetail> {
    return this.api.post<EventDetail>('/events', payload);
  }

  /** Nächste Termine einer Wiederholung (`POST /api/v1/events/recurrence-preview`). */
  previewRecurrence(startsAt: string, recurrence: RecurrencePayload, limit = 8): Observable<RecurrencePreview> {
    return this.api.post<RecurrencePreview>('/events/recurrence-preview', { startsAt, recurrence, limit });
  }

  /** Eigene Antwort auf eine Einladung (`PUT /api/v1/events/{id}/rsvp`). */
  respondToEvent(eventId: string, status: RsvpAnswer): Observable<EventDetail> {
    return this.api.put<EventDetail>(`/events/${encodeURIComponent(eventId)}/rsvp`, { status });
  }

  /** Mitgliederverzeichnis zur Auswahl per Name (`GET /api/v1/users/directory`). */
  listDirectory(): Observable<DirectoryMember[]> {
    return this.api.get<DirectoryMember[]>('/users/directory');
  }

  /** Konversation des Event-Chats (`GET /api/v1/events/{id}/chat`). */
  getEventConversation(eventId: string): Observable<Pick<ConversationSummary, 'id'>> {
    return this.api.get<Pick<ConversationSummary, 'id'>>(
      `/events/${encodeURIComponent(eventId)}/chat`,
    );
  }

  /** Nachrichten einer Konversation (`GET /api/v1/conversations/{id}/messages`). */
  listConversationMessages(conversationId: string): Observable<ChatMessageDto[]> {
    return this.api.get<ChatMessageDto[]>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
  }

  /** Sendet eine Nachricht (`POST /api/v1/conversations/{id}/messages`). */
  sendConversationMessage(conversationId: string, message: string): Observable<ChatMessageDto> {
    return this.api.post<ChatMessageDto>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      { message },
    );
  }

  /** Setzt den Lesestand auf jetzt (`POST /api/v1/conversations/{id}/read`). */
  markConversationRead(conversationId: string): Observable<ConversationSummary> {
    return this.api.post<ConversationSummary>(
      `/conversations/${encodeURIComponent(conversationId)}/read`,
      {},
    );
  }

  /** Eigenes Guthaben (`GET /api/v1/ledger/members/{memberId}/balance`). */
  getBalance(memberId: string): Observable<MemberBalance> {
    return this.api.get<MemberBalance>(`/ledger/members/${encodeURIComponent(memberId)}/balance`);
  }

  /** Eigener Kontoauszug (`GET /api/v1/ledger/members/{memberId}/entries`). */
  listEntries(memberId: string): Observable<LedgerEntry[]> {
    return this.api.get<LedgerEntry[]>(`/ledger/members/${encodeURIComponent(memberId)}/entries`);
  }

  /**
   * Getränke des Gruppenkatalogs, die man statt zu scannen wählen und bezahlen
   * kann (`GET /api/v1/ledger/purchases/catalog`, Issue #122).
   */
  listPayableDrinks(): Observable<PurchasableDrink[]> {
    return this.api.get<PurchasableDrink[]>('/ledger/purchases/catalog');
  }

  /**
   * Getränk, Preis und Guthaben zu einem gescannten Strichcode oder einem aus dem
   * Katalog gewählten Getränk (`POST /api/v1/ledger/purchases/preview`).
   */
  previewPurchase(drink: DrinkRef, eventId?: string): Observable<PurchasePreview> {
    return this.api.post<PurchasePreview>(
      '/ledger/purchases/preview',
      eventId ? { ...drinkBody(drink), eventId } : drinkBody(drink),
    );
  }

  /** Bezahlt ein gescanntes oder gewähltes Getränk am Event mit Guthaben (`POST /api/v1/ledger/purchases`). */
  purchaseByBarcode(
    eventId: string,
    drink: DrinkRef,
    idempotencyKey: string,
  ): Observable<LedgerEntry> {
    return this.api.post<LedgerEntry>(
      '/ledger/purchases',
      { eventId, ...drinkBody(drink) },
      { 'Idempotency-Key': idempotencyKey },
    );
  }

  /**
   * Bezahlt ein gescanntes oder gewähltes Getränk ohne Event mit Guthaben zum Katalogpreis
   * (`POST /api/v1/ledger/purchases/credit`); mit `recordStatistics = false` ohne Statistikeintrag.
   */
  purchaseWithCredit(
    drink: DrinkRef,
    recordStatistics: boolean,
    idempotencyKey: string,
  ): Observable<LedgerEntry> {
    return this.api.post<LedgerEntry>(
      '/ledger/purchases/credit',
      { ...drinkBody(drink), recordStatistics },
      { 'Idempotency-Key': idempotencyKey },
    );
  }

  /** Erfasst ein gescanntes oder gewähltes Getränk nur für die Statistik (`POST /api/v1/statistics/foreign-drinks`). */
  recordForeignDrink(drink: DrinkRef, idempotencyKey: string): Observable<ForeignDrink> {
    return this.api.post<ForeignDrink>(
      '/statistics/foreign-drinks',
      drinkBody(drink),
      { 'Idempotency-Key': idempotencyKey },
    );
  }

  /** Entfernt ein eben erfasstes eigenes Fremdgetränk (`DELETE /api/v1/statistics/foreign-drinks/{id}`). */
  removeForeignDrink(id: string): Observable<void> {
    return this.api.delete<void>(`/statistics/foreign-drinks/${encodeURIComponent(id)}`);
  }

  /** Nimmt einen eben bezahlten eigenen Kauf zurück (`POST /api/v1/ledger/purchases/{id}/undo`). */
  undoPurchase(entryId: string, idempotencyKey: string): Observable<LedgerEntry> {
    return this.api.post<LedgerEntry>(
      `/ledger/purchases/${encodeURIComponent(entryId)}/undo`,
      {},
      { 'Idempotency-Key': idempotencyKey },
    );
  }

  /** Laufende Moments, die das Mitglied sehen darf; mit `eventId` nur die eines Events (`GET /api/v1/moments`). */
  listMoments(eventId?: string | null): Observable<MomentSessionDto[]> {
    return this.api.get<MomentSessionDto[]>(`/moments${eventQuery(eventId)}`);
  }

  /** Details und Timeline-Beiträge eines Moments (`GET /api/v1/moments/{momentId}`). */
  getMomentDetail(momentId: string): Observable<MomentDetailDto> {
    return this.api.get<MomentDetailDto>(`/moments/${encodeURIComponent(momentId)}`);
  }

  /** Startet einen neuen Gemeinschaftsmoment, optional mit Event (`POST /api/v1/moments`). */
  startMoment(payload: StartMomentRequest): Observable<MomentSessionDto> {
    return this.api.post<MomentSessionDto>('/moments', payload);
  }

  /** Reicht einen Statusbeitrag/eine Reaktion zu einem Moment ein (`POST /api/v1/moments/{momentId}/responses`). */
  submitMomentResponse(momentId: string, payload: SubmitMomentResponseRequest): Observable<MomentResponseDto> {
    return this.api.post<MomentResponseDto>(`/moments/${encodeURIComponent(momentId)}/responses`, payload);
  }

  /** GeoJSON Map FeatureCollection für Kartenansicht (`GET /api/v1/moments/{momentId}/map`). */
  getMomentMapGeoJson(momentId: string): Observable<MomentMapGeoJsonDto> {
    return this.api.get<MomentMapGeoJsonDto>(`/moments/${encodeURIComponent(momentId)}/map`);
  }

  /** Weltkarte: ein Pin je sichtbarem Moment mit Standort; mit `eventId` nur die eines Events (`GET /api/v1/moments/map`). */
  getMomentsWorldMap(eventId?: string | null): Observable<MomentWorldMapPinDto[]> {
    return this.api.get<MomentWorldMapPinDto[]>(`/moments/map${eventQuery(eventId)}`);
  }

  /** Schließt einen aktiven Moment ab (`POST /api/v1/moments/{momentId}/complete`). */
  completeMoment(momentId: string): Observable<MomentSummaryDto> {
    return this.api.post<MomentSummaryDto>(`/moments/${encodeURIComponent(momentId)}/complete`, {});
  }

  /** Abgeschlossene Moments; mit `eventId` nur die eines Events (`GET /api/v1/moments/history`). */
  listMomentHistory(eventId?: string | null): Observable<MomentSummaryDto[]> {
    return this.api.get<MomentSummaryDto[]>(`/moments/history${eventQuery(eventId)}`);
  }

  /** Entfernt ein Bild oder Video (`DELETE /api/v1/moments/{momentId}/media/{mediaId}`). */
  deleteMomentMedia(momentId: string, mediaId: string): Observable<null> {
    return this.api.delete<null>(
      `/moments/${encodeURIComponent(momentId)}/media/${encodeURIComponent(mediaId)}`,
    );
  }

  /** Moment-Typen, Reaktionen und Upload-Grenzen (`GET /api/v1/moment-config`). */
  getMomentConfig(): Observable<MomentConfigDto> {
    return this.api.get<MomentConfigDto>('/moment-config');
  }

  /** Legt einen Moment-Typ an oder ändert ihn (nur Vorstand/Admin). */
  saveMomentType(id: string | null, payload: SaveMomentTypeRequest): Observable<MomentTypeDto> {
    return id
      ? this.api.put<MomentTypeDto>(`/moment-config/types/${encodeURIComponent(id)}`, payload)
      : this.api.post<MomentTypeDto>('/moment-config/types', payload);
  }

  /** Legt eine Reaktion an oder ändert sie (nur Vorstand/Admin). */
  saveMomentReaction(id: string | null, payload: SaveMomentReactionRequest): Observable<MomentReactionDto> {
    return id
      ? this.api.put<MomentReactionDto>(`/moment-config/reactions/${encodeURIComponent(id)}`, payload)
      : this.api.post<MomentReactionDto>('/moment-config/reactions', payload);
  }
}

/** Anfragekörper: Strichcode als Text oder Katalog-ID eines gewählten Getränks. */
function drinkBody(drink: DrinkRef): { barcode: string } | { drinkId: string } {
  return typeof drink === 'string' ? { barcode: drink } : { drinkId: drink.drinkId };
}

/** `?eventId=…` für Moment-Listen, die auf ein Event gefiltert werden. */
function eventQuery(eventId?: string | null): string {
  return eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
}

/** Antwort, die ein Eingeladener selbst geben kann. */
export type RsvpAnswer = Exclude<RsvpStatus, 'invited'>;

/** Übersetzungsschlüssel des RSVP-Status (Chips, Teilnehmerliste). */
export function rsvpLabelKey(status: RsvpStatus): string {
  return `member.rsvp.status.${status}`;
}

/** Farbton des RSVP-Chips. */
export function rsvpTone(status: RsvpStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'accepted':
      return 'success';
    case 'maybe':
      return 'warning';
    case 'declined':
      return 'danger';
    default:
      return 'neutral';
  }
}
