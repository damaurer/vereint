import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import type { ChatMessage, ChatOverview } from './chat.model';

/**
 * Clientseitige Datenschicht der Chat-Oberflächen (TICKET-035).
 *
 * Abweichung: Für Chats existiert noch kein Angular-seitiger Fachservice; die
 * Chat-Endpunkte aus TICKET-019 sind serverseitig noch nicht über den
 * Express-Auslieferungs-Proxy angebunden. Dieser Service kapselt den Zugriff
 * deshalb hinter einer stabilen Schnittstelle und liefert vorerst
 * Beispielkonversationen im Client. Sobald der Fachservice bereitsteht, ruft
 * hier ausschließlich der Express-Proxy (`/api/v1`) auf; die Berechtigung
 * prüft weiterhin allein der Spring-Fachservice (`deny by default`). Private
 * Chats werden nicht gecacht und nicht ins SSR-HTML geschrieben.
 */
@Injectable({ providedIn: 'root' })
export class ChatDataService {
  /** Aktueller Nutzer der Beispieldaten. */
  private static readonly CURRENT_USER = 'me';

  /** Lädt den Chat-Überblick (Gruppe + Direktnachrichten). */
  loadOverview(): Observable<ChatOverview> {
    return of(this.seed());
  }

  /**
   * Sendet eine Nachricht in eine Konversation. Ohne echten Endpunkt wird die
   * Nachricht clientseitig erzeugt; die Signatur bleibt für die spätere
   * Anbindung an den Fachservice stabil.
   */
  sendMessage(_conversationId: string, text: string): Observable<ChatMessage> {
    const message: ChatMessage = {
      id: `local-${Date.now()}`,
      authorId: ChatDataService.CURRENT_USER,
      authorName: 'Du',
      createdAt: new Date().toISOString(),
      text,
      reactions: [],
    };
    return of(message);
  }

  /** Erzeugt die Beispieldaten (nur Anzeige, keine echten Personendaten). */
  private seed(): ChatOverview {
    return {
      currentUserId: ChatDataService.CURRENT_USER,
      group: {
        id: 'group-eber',
        name: 'Die Durstigen Eber',
        membersOnline: 8,
        pinned: {
          authorName: 'Lisa',
          text: 'Stammtisch #47 startet heute pünktlich im goldenen Hirschen. Tisch auf Eber reserviert!',
        },
        messages: [
          {
            id: 'g-1',
            authorId: 'max',
            authorName: 'Max Mustermann',
            createdAt: '2026-09-09T18:42:00Z',
            text: 'Bringt jemand heute Karten für Schafkopf mit?',
            reactions: [{ emoji: '🍺', count: 2, reactedByMe: false }],
          },
          {
            id: 'g-2',
            authorId: 'lisa',
            authorName: 'Lisa Schmidt',
            createdAt: '2026-09-09T18:45:00Z',
            text: 'Ich hab ein Deck im Rucksack, kein Stress!',
            reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }],
          },
          {
            id: 'g-3',
            authorId: 'sebastian',
            authorName: 'Sebastian Müller',
            createdAt: '2026-09-09T18:50:00Z',
            text: 'Klasse! Bin in 15 Min da. Kaltes Helles wartet schon.',
            reactions: [{ emoji: '🍻', count: 3, reactedByMe: false }],
          },
        ],
      },
      conversations: [
        {
          id: 'dm-max',
          partnerId: 'max',
          partnerName: 'Max Mustermann',
          lastText: 'Ja, ich bringe Schafkopf-Karten mit!',
          lastLabel: '20:01',
          unreadCount: 2,
          online: true,
          messages: [
            {
              id: 'dm-max-1',
              authorId: 'max',
              authorName: 'Max Mustermann',
              createdAt: '2026-09-09T20:01:00Z',
              text: 'Ja, ich bringe Schafkopf-Karten mit!',
              reactions: [],
            },
          ],
        },
        {
          id: 'dm-lisa',
          partnerId: 'lisa',
          partnerName: 'Lisa Schmidt',
          lastText: 'Klar, danke fürs ausrichten!',
          lastLabel: 'Gestern',
          unreadCount: 0,
          online: true,
          messages: [
            {
              id: 'dm-lisa-1',
              authorId: 'lisa',
              authorName: 'Lisa Schmidt',
              createdAt: '2026-09-08T21:10:00Z',
              text: 'Klar, danke fürs ausrichten!',
              reactions: [],
            },
          ],
        },
        {
          id: 'dm-tobias',
          partnerId: 'tobias',
          partnerName: 'Tobias Wagner',
          lastText: 'Wie viel Guthaben habe ich noch?',
          lastLabel: '18. Nov',
          unreadCount: 0,
          online: false,
          messages: [
            {
              id: 'dm-tobias-1',
              authorId: 'tobias',
              authorName: 'Tobias Wagner',
              createdAt: '2025-11-18T09:30:00Z',
              text: 'Wie viel Guthaben habe ich noch?',
              reactions: [],
            },
          ],
        },
        {
          id: 'dm-marie',
          partnerId: 'marie',
          partnerName: 'Marie Kellermann',
          lastText: 'Kann heute leider nicht kommen :(',
          lastLabel: '10. Nov',
          unreadCount: 0,
          online: false,
          messages: [
            {
              id: 'dm-marie-1',
              authorId: 'marie',
              authorName: 'Marie Kellermann',
              createdAt: '2025-11-10T17:00:00Z',
              text: 'Kann heute leider nicht kommen :(',
              reactions: [],
            },
          ],
        },
      ],
    };
  }
}
