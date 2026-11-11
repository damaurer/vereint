import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type { CreateRoundPayload, Round, RoundOptions } from '../api/api.types';

/**
 * Runden am eigenen Handy (Issue #81): ausgeben, ansehen und beenden. Wer
 * zahlt, was gilt und wann abgebucht wird, entscheidet der Fachservice.
 */
@Injectable({ providedIn: 'root' })
export class RoundApiService {
  private readonly api = inject(ApiClient);

  private path(eventId: string): string {
    return `/events/${encodeURIComponent(eventId)}/rounds`;
  }

  /** Alle Runden des Events (`GET /events/{id}/rounds`). */
  list(eventId: string): Observable<Round[]> {
    return this.api.get<Round[]>(this.path(eventId));
  }

  /** Guthaben, Getränke und Personen für das Formular (`GET /events/{id}/rounds/options`). */
  options(eventId: string): Observable<RoundOptions> {
    return this.api.get<RoundOptions>(`${this.path(eventId)}/options`);
  }

  /** Runde ausgeben (`POST /events/{id}/rounds`). */
  create(eventId: string, payload: CreateRoundPayload): Observable<Round> {
    return this.api.post<Round>(this.path(eventId), payload);
  }

  /** Eigene Runde vorzeitig beenden (`POST /events/{id}/rounds/{roundId}/end`). */
  end(eventId: string, roundId: string): Observable<Round> {
    return this.api.post<Round>(`${this.path(eventId)}/${encodeURIComponent(roundId)}/end`, {});
  }
}
