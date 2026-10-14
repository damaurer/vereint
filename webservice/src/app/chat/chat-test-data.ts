import type { ChatMessageDto, ConversationSummary } from '../api/api.types';

/** Testdaten der Chat-Specs (keine echten Personendaten). */
export function summary(partial: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c-club',
    type: 'club',
    title: 'Vereinschat',
    eventId: null,
    partnerId: null,
    partnerName: null,
    lastMessage: null,
    unreadCount: 0,
    pinned: null,
    canWrite: true,
    ...partial,
  };
}

export function chatMessage(partial: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id: 'm-1',
    conversationId: 'c-club',
    senderType: 'member',
    senderId: 'u-anna',
    senderName: 'Anna Beispiel',
    message: 'Wer kommt heute?',
    imageUrl: null,
    createdAt: '2026-10-14T18:42:00Z',
    reactions: [],
    ...partial,
  };
}
