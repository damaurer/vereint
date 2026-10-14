import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type {
  ChatMessageDto,
  ConversationSummary,
  DirectoryMember,
  MemberProfile,
} from '../api/api.types';

/** Abstand, in dem Konversationslisten und Chat-Badge aufgefrischt werden. */
export const CHAT_LIST_REFRESH_MS = 30_000;

/**
 * Datenzugriff der Chat-Oberflächen (`/api/v1/conversations...`).
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

  /** Alle sichtbaren Konversationen, Vereinschat zuerst (`GET /conversations`). */
  conversations(): Observable<ConversationSummary[]> {
    return this.api.get<ConversationSummary[]>('/conversations');
  }

  /** Summe ungelesener Chat-Nachrichten (`GET /conversations/unread-count`). */
  unreadCount(): Observable<{ unread: number }> {
    return this.api.get<{ unread: number }>('/conversations/unread-count');
  }

  /** Legt einen Direktchat an oder liefert den bestehenden (`POST /conversations/direct`). */
  startDirect(userId: string): Observable<ConversationSummary> {
    return this.api.post<ConversationSummary>('/conversations/direct', { userId });
  }

  /** Nachrichten einer Konversation, älteste zuerst. */
  messages(conversationId: string): Observable<ChatMessageDto[]> {
    return this.api.get<ChatMessageDto[]>(`${this.path(conversationId)}/messages`);
  }

  /** Sendet eine Nachricht. */
  send(conversationId: string, message: string): Observable<ChatMessageDto> {
    return this.api.post<ChatMessageDto>(`${this.path(conversationId)}/messages`, { message });
  }

  /** Setzt den Lesestand auf jetzt. */
  markRead(conversationId: string): Observable<ConversationSummary> {
    return this.api.post<ConversationSummary>(`${this.path(conversationId)}/read`, {});
  }

  /** Schaltet die eigene Reaktion mit diesem Emoji um. */
  toggleReaction(conversationId: string, messageId: string, emoji: string): Observable<ChatMessageDto> {
    return this.api.post<ChatMessageDto>(
      `${this.path(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { emoji },
    );
  }

  /** Mitgliederverzeichnis für die Auswahl neuer Direktchats (`GET /users/directory`). */
  directory(): Observable<DirectoryMember[]> {
    return this.api.get<DirectoryMember[]>('/users/directory');
  }

  private path(conversationId: string): string {
    return `/conversations/${encodeURIComponent(conversationId)}`;
  }
}
