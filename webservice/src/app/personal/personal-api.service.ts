import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type { CalendarResponse, FriendContact, FriendsOverview } from '../api/api.types';

/**
 * Datenzugriff der gruppenübergreifenden Bereiche: persönlicher Kalender
 * (`/api/v1/calendar`) und Freundesliste (`/api/v1/friends`). Beide laufen
 * ohne gewählte Gruppe; was sichtbar ist, entscheidet der Fachservice.
 */
@Injectable({ providedIn: 'root' })
export class PersonalApiService {
  private readonly api = inject(ApiClient);

  /** Events und Moments aller eigenen Gruppen im Zeitraum [from, to). */
  calendar(from: Date, to: Date): Observable<CalendarResponse> {
    const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    return this.api.get<CalendarResponse>(`/calendar?${query.toString()}`);
  }

  friends(): Observable<FriendsOverview> {
    return this.api.get<FriendsOverview>('/friends');
  }

  /** Personen aus den eigenen Gruppen und Freunde. */
  contacts(): Observable<FriendContact[]> {
    return this.api.get<FriendContact[]>('/friends/contacts');
  }

  /** Anfrage senden; eine Gegenanfrage gilt sofort als angenommen. */
  request(userId: string): Observable<FriendContact> {
    return this.api.post<FriendContact>('/friends/requests', { userId });
  }

  accept(userId: string): Observable<FriendContact> {
    return this.api.post<FriendContact>(
      `/friends/requests/${encodeURIComponent(userId)}/accept`,
      {},
    );
  }

  /** Anfrage ablehnen oder zurückziehen bzw. Freundschaft beenden. */
  remove(userId: string): Observable<void> {
    return this.api.delete<void>(`/friends/${encodeURIComponent(userId)}`);
  }
}
