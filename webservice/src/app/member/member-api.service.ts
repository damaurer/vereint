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

  /** Eigenes Guthaben (`GET /api/v1/ledger/members/{memberId}/balance`). */
  getBalance(memberId: string): Observable<MemberBalance> {
    return this.api.get<MemberBalance>(`/ledger/members/${encodeURIComponent(memberId)}/balance`);
  }

  /** Eigener Kontoauszug (`GET /api/v1/ledger/members/{memberId}/entries`). */
  listEntries(memberId: string): Observable<LedgerEntry[]> {
    return this.api.get<LedgerEntry[]>(`/ledger/members/${encodeURIComponent(memberId)}/entries`);
  }
}
