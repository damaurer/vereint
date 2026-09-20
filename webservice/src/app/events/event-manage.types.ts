/**
 * Datenverträge der Event- und Gastoberflächen (TICKET-025), soweit sie über
 * die Mitglieder-PWA hinausgehen (Verwaltung, Eventgetränke, Einladungen und
 * Event-Chat). Die Formen entsprechen den Kotlin-DTOs des Spring-Fachservice;
 * Kennungen sind Zeichenketten (UUID), Zeitstempel ISO-8601 und Geldbeträge
 * dezimale Zeichenketten. Die Autorisierung verbleibt vollständig im
 * Fachservice (`deny by default`).
 */

import type { EventStatus } from '../api/api.types';

export type { EventStatus } from '../api/api.types';

/** Aktualisierung der Eventstammdaten und des Status (`PUT /events/{id}`). */
export interface UpdateEventPayload {
  title?: string;
  description?: string | null;
  location?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  status?: EventStatus;
}

/** Teilnehmerrolle innerhalb eines Events. */
export type ParticipantRole = 'participant' | 'coHost';

/** Hinzufügen eines Teilnehmers (`POST /events/{id}/participants`). */
export interface AddParticipantPayload {
  userId: string;
  role?: ParticipantRole;
}

/** Eventbezogene Getränkekopie (`GET /events/{id}/drinks`). */
export interface EventDrink {
  id: string;
  eventId: string;
  drinkId: string;
  drinkName: string;
  price: string;
  costPrice?: string | null;
  effectiveCostPrice?: string;
  currency: string;
  selfServiceEnabled: boolean;
  tabletEnabled: boolean;
  catalogVersion: number;
  imageSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Hinzufügen eines Eventgetränks (`POST /events/{id}/drinks`). */
export interface AddEventDrinkPayload {
  drinkId: string;
  price?: string;
  costPrice?: string;
  currency?: string;
  selfServiceEnabled?: boolean;
  tabletEnabled?: boolean;
}

/** Aktualisierung eines Eventgetränks (`PUT /events/{id}/drinks/{drinkId}`). */
export interface UpdateEventDrinkPayload {
  price?: string;
  costPrice?: string;
  currency?: string;
  selfServiceEnabled?: boolean;
  tabletEnabled?: boolean;
}

/** Eventbezogene Speise (`GET /events/{id}/food`). */
export interface EventFood {
  id: string;
  eventId: string;
  foodId: string;
  foodName: string;
  price: string | null;
  effectivePrice: string;
  costPrice: string | null;
  effectiveCostPrice: string;
  currency: string;
  selfServiceEnabled: boolean;
  tabletEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Hinzufügen einer Eventspeise (`POST /events/{id}/food`). */
export interface AddEventFoodPayload {
  foodId: string;
  price?: string | null;
  costPrice?: string | null;
  currency?: string;
  selfServiceEnabled?: boolean;
  tabletEnabled?: boolean;
}

/** Aktualisierung einer Eventspeise (`PUT /events/{id}/food/{eventFoodId}`). */
export interface UpdateEventFoodPayload {
  price?: string | null;
  costPrice?: string | null;
  currency?: string;
  selfServiceEnabled?: boolean;
  tabletEnabled?: boolean;
}

/** Zuweisung einer Sublist (`POST /events/{id}/drinks/assign-sublist`). */
export interface AssignSublistPayload {
  sublistId: string;
}

/** Einladung ohne Rohtoken (`GET /events/{id}/invites`). */
export interface Invite {
  id: string;
  eventId: string;
  role: string;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  revoked: boolean;
  active: boolean;
  createdById: string | null;
  createdAt: string;
}

/**
 * Antwort auf das Erzeugen einer Einladung. `token` und `acceptPath` werden
 * ausschließlich hier – also einmalig – ausgeliefert.
 */
export interface CreatedInvite {
  id: string;
  eventId: string;
  token: string;
  acceptPath: string;
  role: string;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

/** Erzeugen einer Einladung (`POST /events/{id}/invites`). */
export interface CreateInvitePayload {
  role?: 'guest';
  maxUses?: number;
  expiresInMinutes?: number;
}

/** Öffentliche Sicht auf eine Event-Konversation (`GET /events/{id}/chat`). */
export interface Conversation {
  id: string;
  type: string;
  eventId: string | null;
  title: string | null;
  memberCount: number;
}

/** Zulässiger Absendertyp einer Chat-Nachricht. */
export type ChatSenderType = 'member' | 'guest';

/** Öffentliche Sicht auf eine Chat-Nachricht. */
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: ChatSenderType;
  senderId: string | null;
  senderName: string;
  message: string;
  imageUrl: string | null;
  createdAt: string;
}

/** Senden einer Chat-Nachricht (`POST .../chat/messages`). */
export interface SendMessagePayload {
  message: string;
  imageUrl?: string;
}
