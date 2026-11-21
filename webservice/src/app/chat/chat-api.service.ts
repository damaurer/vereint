import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type {
  ChatMedia,
  ChatMessageDto,
  ConversationSummary,
  ConversationType,
  FriendContact,
  MemberProfile,
} from '../api/api.types';

/** Header, mit dem ein Gruppen- oder Event-Chat der Liste seine Gruppe nennt (siehe BFF). */
export const CHAT_GROUP_HEADER = 'X-Vereint-Chat-Group';

/** Abstand, in dem Konversationslisten und Chat-Badge aufgefrischt werden. */
export const CHAT_LIST_REFRESH_MS = 30_000;

/**
 * Datenzugriff der Chat-Oberflächen. Die gemeinsame Liste aller Chats liegt
 * unter `/api/v1/chats`. Gruppen- und Event-Chats liegen unter
 * `/api/v1/conversations...`: ohne `group` in der gewählten Gruppe, mit
 * `group` in dieser Gruppe (Header [CHAT_GROUP_HEADER]). Direktnachrichten
 * liegen gruppenübergreifend unter `/api/v1/direct-conversations...`.
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

  /**
   * Alle eigenen Chats in einer Liste: Gruppenchats und Event-Chats aller
   * eigenen Gruppen sowie Direktnachrichten, neueste Nachricht zuerst (`GET /chats`).
   */
  allChats(): Observable<ConversationSummary[]> {
    return this.api.get<ConversationSummary[]>('/chats');
  }

  /** Ungelesene Nachrichten über alle Chats der Liste (`GET /chats/unread-count`). */
  allUnreadCount(): Observable<{ unread: number }> {
    return this.api.get<{ unread: number }>('/chats/unread-count');
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
  messages(conversationId: string, type?: ConversationType, group?: string | null): Observable<ChatMessageDto[]> {
    return this.api.get<ChatMessageDto[]>(`${this.path(conversationId, type)}/messages`, this.headers(type, group));
  }

  /**
   * Sendet eine Nachricht. Mit `clientId` darf die App dieselbe Nachricht nach
   * einem Verbindungsabbruch erneut senden, ohne dass sie doppelt ankommt.
   */
  send(
    conversationId: string,
    message: string,
    type?: ConversationType,
    clientId?: string,
    group?: string | null,
    mediaIds?: string[],
  ): Observable<ChatMessageDto> {
    const body: { message: string; clientId?: string; mediaIds?: string[] } = { message };
    if (clientId) body.clientId = clientId;
    if (mediaIds?.length) body.mediaIds = mediaIds;
    return this.api.post<ChatMessageDto>(`${this.path(conversationId, type)}/messages`, body, this.headers(type, group));
  }

  /** „schreibt gerade…“ an die anderen im Gespräch (`POST …/typing`). */
  typing(conversationId: string, type?: ConversationType, group?: string | null): Observable<void> {
    return this.api.post<void>(`${this.path(conversationId, type)}/typing`, {}, this.headers(type, group));
  }

  /** Setzt den Lesestand auf jetzt. */
  markRead(conversationId: string, type?: ConversationType, group?: string | null): Observable<ConversationSummary> {
    return this.api.post<ConversationSummary>(`${this.path(conversationId, type)}/read`, {}, this.headers(type, group));
  }

  /** Schaltet die eigene Reaktion mit diesem Emoji um. */
  toggleReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
    type?: ConversationType,
    group?: string | null,
  ): Observable<ChatMessageDto> {
    return this.api.post<ChatMessageDto>(
      `${this.path(conversationId, type)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { emoji },
      this.headers(type, group),
    );
  }

  /**
   * Personen für neue Direktnachrichten: alle aus den eigenen Gruppen plus
   * Freunde (`GET /friends/contacts`).
   */
  contacts(): Observable<FriendContact[]> {
    return this.api.get<FriendContact[]>('/friends/contacts');
  }

  /**
   * Adresse eines Fotos/Videos für `<img>`/`<video>`. Bilder kennen keine
   * Header; die Gruppe steht deshalb als `?chatGroup=` dabei.
   */
  mediaUrl(media: ChatMedia, type?: ConversationType, group?: string | null): string {
    if (type === 'direct' || !group) return media.url;
    return `${media.url}?chatGroup=${encodeURIComponent(group)}`;
  }

  /** Pfad für den Upload eines Fotos/Videos (unter `/api/v1`) samt Gruppen-Header. */
  mediaUpload(conversationId: string, type?: ConversationType, group?: string | null) {
    return { path: `${this.path(conversationId, type)}/media`, headers: this.headers(type, group) ?? {} };
  }

  /** Gruppe eines Gruppen- oder Event-Chats aus der gemeinsamen Liste. */
  private headers(type?: ConversationType, group?: string | null): Record<string, string> | undefined {
    return type !== 'direct' && group ? { [CHAT_GROUP_HEADER]: group } : undefined;
  }

  private path(conversationId: string, type?: ConversationType): string {
    const base = type === 'direct' ? '/direct-conversations' : '/conversations';
    return `${base}/${encodeURIComponent(conversationId)}`;
  }
}
