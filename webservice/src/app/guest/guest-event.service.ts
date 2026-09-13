import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type { ChatMessage, SendMessagePayload } from '../events/event-manage.types';

/** Header, in dem das eventgebundene Gast-Token übertragen wird. */
export const GUEST_TOKEN_HEADER = 'X-Guest-Token';

/**
 * Fachlicher Datenzugriff eines Gastes (TICKET-025).
 *
 * Ein Gast besitzt keine Keycloak-Identität, sondern ausschließlich ein
 * zeitlich begrenztes, eventgebundenes Gast-Token. Dieses wird als Geheimnis im
 * Header `X-Guest-Token` mitgesendet; die vollständige Autorisierung (gültig,
 * nicht widerrufen, nicht abgelaufen) trifft der Spring-Fachservice
 * (`deny by default`). Ein Gast erreicht ausschließlich den zugewiesenen
 * Event-Chat.
 */
@Injectable({ providedIn: 'root' })
export class GuestEventService {
  private readonly api = inject(ApiClient);

  private guestPath(eventId: string): string {
    return `/events/${encodeURIComponent(eventId)}/chat/guest/messages`;
  }

  private headers(guestToken: string): Record<string, string> {
    return { [GUEST_TOKEN_HEADER]: guestToken };
  }

  /** Nachrichten des zugewiesenen Event-Chats (`GET .../chat/guest/messages`). */
  listMessages(eventId: string, guestToken: string): Observable<ChatMessage[]> {
    return this.api.get<ChatMessage[]>(this.guestPath(eventId), this.headers(guestToken));
  }

  /** Sendet eine Nachricht als Gast (`POST .../chat/guest/messages`). */
  sendMessage(
    eventId: string,
    guestToken: string,
    payload: SendMessagePayload,
  ): Observable<ChatMessage> {
    return this.api.post<ChatMessage>(this.guestPath(eventId), payload, this.headers(guestToken));
  }
}
