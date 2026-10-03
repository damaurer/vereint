import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type {
  EventDetail,
  EventParticipant,
  EventSummary,
  LedgerEntry,
  MemberBalance,
  MemberProfile,
  MomentDetailDto,
  MomentMapGeoJsonDto,
  MomentResponseDto,
  MomentSessionDto,
  MomentSummaryDto,
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

  /** Fügt einen Teilnehmer hinzu (`POST /api/v1/events/{id}/participants`). */
  addParticipant(eventId: string, payload: { userId: string; role?: string }): Observable<EventParticipant> {
    return this.api.post<EventParticipant>(`/events/${encodeURIComponent(eventId)}/participants`, payload);
  }

  /** Entfernt einen Teilnehmer (`DELETE /api/v1/events/{id}/participants/{userId}`). */
  removeParticipant(eventId: string, userId: string): Observable<void> {
    return this.api.delete<void>(`/events/${encodeURIComponent(eventId)}/participants/${encodeURIComponent(userId)}`);
  }

  /** Eigenes Guthaben (`GET /api/v1/ledger/members/{memberId}/balance`). */
  getBalance(memberId: string): Observable<MemberBalance> {
    return this.api.get<MemberBalance>(`/ledger/members/${encodeURIComponent(memberId)}/balance`);
  }

  /** Eigener Kontoauszug (`GET /api/v1/ledger/members/{memberId}/entries`). */
  listEntries(memberId: string): Observable<LedgerEntry[]> {
    return this.api.get<LedgerEntry[]>(`/ledger/members/${encodeURIComponent(memberId)}/entries`);
  }

  /** Aktive Moments eines Events (`GET /api/v1/events/{eventId}/moments`). */
  listMoments(eventId: string): Observable<MomentSessionDto[]> {
    return this.api.get<MomentSessionDto[]>(`/events/${encodeURIComponent(eventId)}/moments`);
  }

  /** Details und Timeline-Beiträge eines Moments (`GET /api/v1/events/{eventId}/moments/{momentId}`). */
  getMomentDetail(eventId: string, momentId: string): Observable<MomentDetailDto> {
    return this.api.get<MomentDetailDto>(
      `/events/${encodeURIComponent(eventId)}/moments/${encodeURIComponent(momentId)}`,
    );
  }

  /** Startet einen neuen Gemeinschaftsmoment (`POST /api/v1/events/{eventId}/moments`). */
  startMoment(eventId: string, payload: StartMomentRequest): Observable<MomentSessionDto> {
    return this.api.post<MomentSessionDto>(`/events/${encodeURIComponent(eventId)}/moments`, payload);
  }

  /** Reicht einen Statusbeitrag/eine Reaktion zu einem Moment ein (`POST /api/v1/events/{eventId}/moments/{momentId}/responses`). */
  submitMomentResponse(
    eventId: string,
    momentId: string,
    payload: SubmitMomentResponseRequest,
  ): Observable<MomentResponseDto> {
    return this.api.post<MomentResponseDto>(
      `/events/${encodeURIComponent(eventId)}/moments/${encodeURIComponent(momentId)}/responses`,
      payload,
    );
  }

  /** GeoJSON Map FeatureCollection für Kartenansicht (`GET /api/v1/events/{eventId}/moments/{momentId}/map`). */
  getMomentMapGeoJson(eventId: string, momentId: string): Observable<MomentMapGeoJsonDto> {
    return this.api.get<MomentMapGeoJsonDto>(
      `/events/${encodeURIComponent(eventId)}/moments/${encodeURIComponent(momentId)}/map`,
    );
  }

  /** Schließt einen aktiven Moment ab (`POST /api/v1/events/{eventId}/moments/{momentId}/complete`). */
  completeMoment(eventId: string, momentId: string): Observable<MomentSummaryDto> {
    return this.api.post<MomentSummaryDto>(
      `/events/${encodeURIComponent(eventId)}/moments/${encodeURIComponent(momentId)}/complete`,
      {},
    );
  }

  /** Archivierte/abgeschlossene Moments eines Events (`GET /api/v1/events/{eventId}/moments/history`). */
  listMomentHistory(eventId: string): Observable<MomentSummaryDto[]> {
    return this.api.get<MomentSummaryDto[]>(`/events/${encodeURIComponent(eventId)}/moments/history`);
  }
}
