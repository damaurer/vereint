import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type {
  ChatMessageDto,
  ConversationSummary,
  ConversationType,
  FriendContact,
  MemberProfile,
} from '../api/api.types';

/** Abstand, in dem Konversationslisten und Chat-Badge aufgefrischt werden. */
export const CHAT_LIST_REFRESH_MS = 30_000;

/**
 * Datenzugriff der Chat-Oberflächen. Gruppen- und Event-Chats liegen unter
 * `/api/v1/conversations...` (gewählte Gruppe), Direktnachrichten
 * gruppenübergreifend unter `/api/v1/direct-conversations...`.
 *
 * Formuliert ausschließlich die Aufrufe; welche Konversationen sichtbar und
 * beschreibbar sind, entscheidet der Fachservice (`deny by default`). Private
 * Chats werden nicht gecacht.
 */
@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly api = inject(ApiClient);

  /** Eigenes Profil (`GET /users/me`), u. a. für die eigene Benutzer-ID. */
  me(): Observable<MemberProfile> {
    return this.api.get<MemberProfile>('/users/me');
  }

  /** Gruppenchat und Event-Chats der gewählten Gruppe, Gruppenchat zuerst (`GET /conversations`). */
  conversations(): Observable<ConversationSummary[]> {
    return this.api.get<ConversationSummary[]>('/conversations');
  }

  /** Ungelesene Nachrichten der Gruppe plus aller Direktnachrichten (`GET /conversations/unread-count`). */
  unreadCount(): Observable<{ unread: number }> {
    return this.api.get<{ unread: number }>('/conversations/unread-count');
  }

  /** Eigene Direktnachrichten über alle Gruppen, neueste zuerst (`GET /direct-conversations`). */
  directConversations(): Observable<ConversationSummary[]> {
    return this.api.get<ConversationSummary[]>('/direct-conversations');
  }

  /** Legt ein Direktgespräch an oder liefert das bestehende (`POST /direct-conversations`). */
  startDirect(userId: string): Observable<ConversationSummary> {
    return this.api.post<ConversationSummary>('/direct-conversations', { userId });
  }

  /** Nachrichten einer Konversation, älteste zuerst. */
  messages(conversationId: string, type?: ConversationType): Observable<ChatMessageDto[]> {
    return this.api.get<ChatMessageDto[]>(`${this.path(conversationId, type)}/messages`);
  }

  /** Sendet eine Nachricht. */
  send(conversationId: string, message: string, type?: ConversationType): Observable<ChatMessageDto> {
    return this.api.post<ChatMessageDto>(`${this.path(conversationId, type)}/messages`, { message });
  }

  /** Setzt den Lesestand auf jetzt. */
  markRead(conversationId: string, type?: ConversationType): Observable<ConversationSummary> {
    return this.api.post<ConversationSummary>(`${this.path(conversationId, type)}/read`, {});
  }

  /** Schaltet die eigene Reaktion mit diesem Emoji um. */
  toggleReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
    type?: ConversationType,
  ): Observable<ChatMessageDto> {
    return this.api.post<ChatMessageDto>(
      `${this.path(conversationId, type)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { emoji },
    );
  }

  /**
   * Personen für neue Direktnachrichten: alle aus den eigenen Gruppen plus
   * Freunde (`GET /friends/contacts`).
   */
  contacts(): Observable<FriendContact[]> {
    return this.api.get<FriendContact[]>('/friends/contacts');
  }

  private path(conversationId: string, type?: ConversationType): string {
    const base = type === 'direct' ? '/direct-conversations' : '/conversations';
    return `${base}/${encodeURIComponent(conversationId)}`;
  }
}
