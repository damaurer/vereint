import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type {
  DirectoryMember,
  EventDetail,
  EventParticipant,
  FoodSummary,
  InviteMembersPayload,
  MemberProfile,
} from '../api/api.types';
import type { DrinkSummaryDto } from '../catalog/catalog-api.service';
import type { SublistSummaryDto } from '../sublists/sublists-api.service';
import type {
  AddEventDrinkPayload,
  AddEventFoodPayload,
  AddParticipantPayload,
  AssignSublistPayload,
  ChatMessage,
  Conversation,
  CreateInvitePayload,
  CreatedInvite,
  EventDrink,
  EventFood,
  Invite,
  SendMessagePayload,
  UpdateEventDrinkPayload,
  UpdateEventFoodPayload,
  UpdateEventPayload,
} from './event-manage.types';

/**
 * Fachlicher Datenzugriff der Eventverwaltung (TICKET-025).
 *
 * Bündelt die Owner-Aktionen eines Events: Stammdaten und Status, Teilnehmer,
 * Eventgetränke, Einladungen und den Event-Chat. Der Service formuliert
 * ausschließlich die Aufrufe an den Express-Auslieferungs-Proxy (`/api/v1`);
 * jede Berechtigungsprüfung erfolgt serverseitig im Spring-Fachservice
 * (`deny by default`), einschließlich der Owner-Bindung.
 */
@Injectable({ providedIn: 'root' })
export class EventManageService {
  private readonly api = inject(ApiClient);

  private eventPath(eventId: string): string {
    return `/events/${encodeURIComponent(eventId)}`;
  }

  /** Eigenes Profil, um Owner- bzw. Vorstands-/Adminkontext zu bestimmen. */
  loadProfile(): Observable<MemberProfile> {
    return this.api.get<MemberProfile>('/users/me');
  }

  /** Eventdetails (`GET /events/{id}`). */
  getEvent(eventId: string): Observable<EventDetail> {
    return this.api.get<EventDetail>(this.eventPath(eventId));
  }

  /** Aktualisiert Stammdaten und/oder Status (`PUT /events/{id}`). */
  updateEvent(eventId: string, payload: UpdateEventPayload): Observable<EventDetail> {
    return this.api.put<EventDetail>(this.eventPath(eventId), payload);
  }

  /** Teilnehmer (`GET /events/{id}/participants`). */
  listParticipants(eventId: string): Observable<EventParticipant[]> {
    return this.api.get<EventParticipant[]>(`${this.eventPath(eventId)}/participants`);
  }

  /** Fügt einen Teilnehmer hinzu (`POST /events/{id}/participants`). */
  addParticipant(eventId: string, payload: AddParticipantPayload): Observable<EventParticipant> {
    return this.api.post<EventParticipant>(`${this.eventPath(eventId)}/participants`, payload);
  }

  /** Lädt Mitglieder ein (`POST /events/{id}/invitations`). */
  inviteMembers(eventId: string, payload: InviteMembersPayload): Observable<EventParticipant[]> {
    return this.api.post<EventParticipant[]>(`${this.eventPath(eventId)}/invitations`, payload);
  }

  /** Mitgliederverzeichnis für die Auswahl per Name (`GET /users/directory`). */
  listDirectory(): Observable<DirectoryMember[]> {
    return this.api.get<DirectoryMember[]>('/users/directory');
  }

  /** Freigegebene Katalog-Getränke für die Auswahl per Name (`GET /drinks?status=approved`). */
  listCatalogDrinks(): Observable<DrinkSummaryDto[]> {
    return this.api.get<DrinkSummaryDto[]>('/drinks?status=approved');
  }

  /** Sublists für die Auswahl per Name (`GET /sublists`). */
  listSublists(): Observable<SublistSummaryDto[]> {
    return this.api.get<SublistSummaryDto[]>('/sublists');
  }

  /** Entfernt einen Teilnehmer (`DELETE /events/{id}/participants/{userId}`). */
  removeParticipant(eventId: string, userId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.eventPath(eventId)}/participants/${encodeURIComponent(userId)}`,
    );
  }

  /** Eventgetränke (`GET /events/{id}/drinks`). */
  listDrinks(eventId: string): Observable<EventDrink[]> {
    return this.api.get<EventDrink[]>(`${this.eventPath(eventId)}/drinks`);
  }

  /** Fügt ein Eventgetränk hinzu (`POST /events/{id}/drinks`). */
  addDrink(eventId: string, payload: AddEventDrinkPayload): Observable<EventDrink> {
    return this.api.post<EventDrink>(`${this.eventPath(eventId)}/drinks`, payload);
  }

  /** Aktualisiert ein Eventgetränk (`PUT /events/{id}/drinks/{drinkId}`). */
  updateDrink(
    eventId: string,
    eventDrinkId: string,
    payload: UpdateEventDrinkPayload,
  ): Observable<EventDrink> {
    return this.api.put<EventDrink>(
      `${this.eventPath(eventId)}/drinks/${encodeURIComponent(eventDrinkId)}`,
      payload,
    );
  }

  /** Entfernt ein Eventgetränk (`DELETE /events/{id}/drinks/{drinkId}`). */
  removeDrink(eventId: string, eventDrinkId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.eventPath(eventId)}/drinks/${encodeURIComponent(eventDrinkId)}`,
    );
  }

  /** Weist eine Sublist zu (`POST /events/{id}/drinks/assign-sublist`). */
  assignSublist(eventId: string, payload: AssignSublistPayload): Observable<EventDrink[]> {
    return this.api.post<EventDrink[]>(`${this.eventPath(eventId)}/drinks/assign-sublist`, payload);
  }

  /** Globaler Speisenkatalog (`GET /food`). */
  listClubFood(): Observable<FoodSummary[]> {
    return this.api.get<FoodSummary[]>('/food');
  }

  /** Eventspeisen (`GET /events/{id}/food`). */
  listEventFood(eventId: string): Observable<EventFood[]> {
    return this.api.get<EventFood[]>(`${this.eventPath(eventId)}/food`);
  }

  /** Fügt eine Eventspeise hinzu (`POST /events/{id}/food`). */
  addFood(eventId: string, payload: AddEventFoodPayload): Observable<EventFood> {
    return this.api.post<EventFood>(`${this.eventPath(eventId)}/food`, payload);
  }

  /** Aktualisiert eine Eventspeise (`PUT /events/{id}/food/{eventFoodId}`). */
  updateFood(
    eventId: string,
    eventFoodId: string,
    payload: UpdateEventFoodPayload
  ): Observable<EventFood> {
    return this.api.put<EventFood>(
      `${this.eventPath(eventId)}/food/${encodeURIComponent(eventFoodId)}`,
      payload
    );
  }

  /** Entfernt eine Eventspeise (`DELETE /events/{id}/food/{eventFoodId}`). */
  removeFood(eventId: string, eventFoodId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.eventPath(eventId)}/food/${encodeURIComponent(eventFoodId)}`
    );
  }

  /** Einladungen (`GET /events/{id}/invites`). */
  listInvites(eventId: string): Observable<Invite[]> {
    return this.api.get<Invite[]>(`${this.eventPath(eventId)}/invites`);
  }

  /** Erzeugt eine Einladung (`POST /events/{id}/invites`). */
  createInvite(eventId: string, payload: CreateInvitePayload): Observable<CreatedInvite> {
    return this.api.post<CreatedInvite>(`${this.eventPath(eventId)}/invites`, payload);
  }

  /** Widerruft eine Einladung (`DELETE /events/{id}/invites/{inviteId}`). */
  revokeInvite(eventId: string, inviteId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.eventPath(eventId)}/invites/${encodeURIComponent(inviteId)}`,
    );
  }

  /** Event-Konversation (`GET /events/{id}/chat`). */
  getConversation(eventId: string): Observable<Conversation> {
    return this.api.get<Conversation>(`${this.eventPath(eventId)}/chat`);
  }

  /** Chat-Nachrichten (`GET /events/{id}/chat/messages`). */
  listMessages(eventId: string): Observable<ChatMessage[]> {
    return this.api.get<ChatMessage[]>(`${this.eventPath(eventId)}/chat/messages`);
  }

  /** Sendet eine Chat-Nachricht (`POST /events/{id}/chat/messages`). */
  sendMessage(eventId: string, payload: SendMessagePayload): Observable<ChatMessage> {
    return this.api.post<ChatMessage>(`${this.eventPath(eventId)}/chat/messages`, payload);
  }
}
