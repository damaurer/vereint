/**
 * Präsentationsmodell der Chat-Oberflächen (TICKET-035).
 *
 * VEREINT besitzt clientseitig noch keine Chat-Datenschicht (die
 * Chat-Endpunkte aus TICKET-019 sind serverseitig noch nicht als
 * Angular-Service verfügbar). Diese Typen beschreiben deshalb ausschließlich
 * die Darstellung; die tatsächlichen Konversationen liefert später der
 * Fachservice über den Express-Auslieferungs-Proxy. Private Chats werden nie
 * ins SSR-HTML geschrieben und nicht gecacht (siehe `AGENTS.md`).
 */

/** Emoji-Reaktion auf eine Nachricht mit Zähler. */
export interface ChatReaction {
  emoji: string;
  count: number;
  /** Ob der aktuelle Nutzer bereits mit diesem Emoji reagiert hat. */
  reactedByMe: boolean;
}

/** Einzelne Chat-Nachricht (Gruppe oder Direktnachricht). */
export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  /** ISO-Zeitstempel der Nachricht. */
  createdAt: string;
  text: string;
  reactions: ChatReaction[];
}

/** Gepinnte Notiz des Schriftwarts oben im Gruppen-Chat. */
export interface PinnedNote {
  authorName: string;
  text: string;
}

/** Gruppen-Chat eines Stammtischs. */
export interface GroupChat {
  id: string;
  name: string;
  /** Anzahl aktuell anwesender Mitglieder (nur Anzeige). */
  membersOnline: number;
  pinned: PinnedNote | null;
  messages: ChatMessage[];
}

/** Direktnachrichten-Konversation mit einem einzelnen Mitglied. */
export interface DirectConversation {
  id: string;
  partnerId: string;
  partnerName: string;
  /** Vorschautext der letzten Nachricht. */
  lastText: string;
  /** Anzeigefertiges Zeitlabel (z. B. „20:01“, „Gestern“, „18. Nov“). */
  lastLabel: string;
  unreadCount: number;
  online: boolean;
  messages: ChatMessage[];
}

/** Gesamter Chat-Überblick des angemeldeten Mitglieds. */
export interface ChatOverview {
  currentUserId: string;
  group: GroupChat;
  conversations: DirectConversation[];
}

/** Bekannte Getränke-Emojis für den Composer-Schnellzugriff. */
export const DRINK_EMOJI = '🍺';
