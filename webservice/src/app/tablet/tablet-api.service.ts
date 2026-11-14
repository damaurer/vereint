import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type { EventDrink, EventFood } from '../events/event-manage.types';
import type {
  LedgerEntry,
  MemberProfile,
  TabletBoard,
  TabletEvent,
  TabletItems,
  TabletMember,
  TabletPurchasePayload,
} from '../api/api.types';

/** Header-Name für idempotente finanzielle Schreibvorgänge. */
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/**
 * Fachlicher Datenzugriff des Tablet-Kontexts / Drink-Recorders (TICKET-026).
 *
 * Bündelt die Endpunkte der manuellen Erfassung: aktive Events, deren Mitglieder
 * und tabletfähige Getränke sowie das Erfassen einzelner Käufe. Runden gibt
 * jede Person am eigenen Handy aus; das Terminal zeigt sie nur an. Preis, Währung, Modus und Herkunft bestimmt ausschließlich der
 * Fachservice; die Berechtigung `purchase.tablet` wird serverseitig geprüft
 * (`deny by default`). Der Service formuliert nur die Aufrufe an `/api/v1`.
 */
@Injectable({ providedIn: 'root' })
export class TabletApiService {
  private readonly api = inject(ApiClient);

  private eventPath(eventId: string): string {
    return `/tablet/events/${encodeURIComponent(eventId)}`;
  }

  private idempotency(key: string): Record<string, string> {
    return { [IDEMPOTENCY_HEADER]: key };
  }

  /** Eigenes Profil, um Berechtigung und Kontext anzuzeigen. */
  loadProfile(): Observable<MemberProfile> {
    return this.api.get<MemberProfile>('/users/me');
  }

  /** Aktive Events für die Tablet-Auswahl (`GET /tablet/events`). */
  listEvents(): Observable<TabletEvent[]> {
    return this.api.get<TabletEvent[]>('/tablet/events');
  }

  /** Freigegebene Eventmitglieder (`GET /tablet/events/{id}/members`). */
  listMembers(eventId: string): Observable<TabletMember[]> {
    return this.api.get<TabletMember[]>(`${this.eventPath(eventId)}/members`);
  }

  /** Strichliste nach Kategorien (`GET /tablet/events/{id}/board`). */
  loadBoard(eventId: string): Observable<TabletBoard> {
    return this.api.get<TabletBoard>(`${this.eventPath(eventId)}/board`);
  }

  /** Tabletfähige Eventgetränke (`GET /tablet/events/{id}/drinks`). */
  listDrinks(eventId: string): Observable<EventDrink[]> {
    return this.api.get<EventDrink[]>(`${this.eventPath(eventId)}/drinks`);
  }

  /** Tabletfähige Eventspeisen (`GET /tablet/events/{id}/food`). */
  listFood(eventId: string): Observable<EventFood[]> {
    return this.api.get<EventFood[]>(`${this.eventPath(eventId)}/food`);
  }

  /** Kombiniertes Angebot an Getränken und Speisen (`GET /tablet/events/{id}/items`). */
  listItems(eventId: string): Observable<TabletItems> {
    return this.api.get<TabletItems>(`${this.eventPath(eventId)}/items`);
  }

  /** Manuellen Strichlisten-Kauf erfassen (`POST /tablet/events/{id}/purchases`). */
  recordPurchase(
    eventId: string,
    payload: TabletPurchasePayload,
    idempotencyKey: string,
  ): Observable<LedgerEntry> {
    return this.api.post<LedgerEntry>(
      `${this.eventPath(eventId)}/purchases`,
      payload,
      this.idempotency(idempotencyKey),
    );
  }

  /**
   * Eben erfassten Strich zurücknehmen (`POST /tablet/events/{id}/purchases/{entryId}/undo`).
   * Der Server erlaubt das nur für eigene, frische Striche und bucht eine Gegenbuchung.
   */
  undoPurchase(eventId: string, entryId: string, idempotencyKey: string): Observable<LedgerEntry> {
    return this.api.post<LedgerEntry>(
      `${this.eventPath(eventId)}/purchases/${encodeURIComponent(entryId)}/undo`,
      {},
      this.idempotency(idempotencyKey),
    );
  }
}
