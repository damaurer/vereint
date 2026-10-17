# REST API-Referenz & Endpunktkatalog

Die **Vereint Backend API** (`baseservice`) folgt REST-Prinzipien, verwendet JSON als Austauschformat und nutzt Standard-HTTP-Statuscodes sowie RFC-7807-Fehlerantworten (`application/problem+json`). Die maschinenlesbare Beschreibung liefert springdoc direkt am Fachservice unter `/v3/api-docs` und `/swagger-ui.html`, wenn `API_DOCS_ENABLED=true` gesetzt ist (Standard: aus).

---

## 🔐 Authentifizierung & Header

- **Authorization**: `Bearer <Keycloak_OIDC_JWT>` (bei geschützten Endpunkten). Im Browser setzt der BFF den Header; das Token verlässt den Server nicht.
- **X-Stammtisch-Id**: gewählte Gruppe. Der BFF setzt ihn aus dem HttpOnly-Cookie `vereint.stammtisch`; Rollen und Berechtigungen gelten immer für diese Gruppe.
- **Idempotency-Key**: Pflicht bei allen Buchungen (Käufe, Rückgängig, Aufladungen, Auszahlungen, Korrekturen, Tablet-Buchungen), höchstens 128 Zeichen, bei Runde und Abend höchstens 80. Details: [Fehlerbehandlung & Idempotenz](error-handling-and-idempotency.md).
- **X-Guest-Token**: Gast-Token für die Gast-Endpunkte des Event-Chats (`/api/v1/events/{eventId}/chat/guest/**`).
- **X-Request-Id**: Korrelations-ID (wird in Problem Details als `traceId` zurückgegeben).

Die Spalte „Berechtigung“ nennt die Permission, die der Fachservice in der gewählten Gruppe prüft (Startwerte je Rolle: [Rollen & Berechtigungen](../architecture/security-and-auth.md#startwerte-der-systemrollen)). „Mitglied“ heißt: aktives Mitglied der gewählten Gruppe.

---

## 📋 Endpunktkatalog nach Modulen

### 1. Authentifizierung & Zugangsauflösung (`AuthController`, `AccessResolverController`, `ApiInfoController`, `HealthController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/auth/me` | Subject, Anzeigename, Rollen, Vorstandsrolle und Permissions in der gewählten Gruppe (`AuthContextDto`) | Angemeldet |
| `GET` | `/api/v1/auth/access` | Vollständige Zugriffsentscheidung mit Gruppen, Permissions und erlaubten App-Kontexten | Angemeldet |
| `GET` | `/api/v1/auth/access/matrix` | Rollen der gewählten Gruppe mit ihren Permissions (ohne Gruppe die Startwerte), Matrix-Version und bekannte Permissions | Angemeldet |
| `POST` | `/api/v1/auth/access/check` | Prüft einen App-Kontext oder ein Event | Angemeldet |
| `POST` | `/api/v1/auth/access/guest` | Prüft ein Gast-Token für ein Event (je IP begrenzt) | Öffentlich |
| `GET` | `/api/v1/info` | API-Metadaten und Version | Öffentlich |
| `GET` | `/api/v1/health` | Einfacher Gesundheitsstatus | Öffentlich |

### 2. Mitglieder (`UserController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/me` | Eigenes Profil (`UserProfileDto`) | Angemeldet |
| `PUT` | `/api/v1/users/me` | Eigenes Profil ändern (`UpdateProfileRequest`) | Angemeldet |
| `GET` | `/api/v1/users` | Mitgliederliste mit Paging (`page`, `size`, `sort`) und Filtern `role`, `disabled`, `search` | `members.read` |
| `GET` | `/api/v1/users/directory` | Aktive Mitglieder für Auswahllisten | Mitglied |
| `GET` | `/api/v1/users/{id}` | Profil eines Mitglieds | eigenes Profil oder `members.manage` |
| `PUT` | `/api/v1/users/{id}` | Mitglied bearbeiten (`AdminUpdateUserRequest`); Rollen und Berechtigungen darin brauchen zusätzlich `roles.manage`, Name und E-Mail ändert nur die Plattform-Administration | `members.manage` |
| `PUT` | `/api/v1/users/{id}/roles` | Rollen der Gruppe zuweisen (`AssignRolesRequest`) | `roles.manage` |
| `PUT` | `/api/v1/users/{id}/permissions` | Einzelne Berechtigungen zuweisen (`AssignPermissionsRequest`) | `roles.manage` |
| `PUT` | `/api/v1/users/{id}/status` | Mitglied sperren oder entsperren (`UpdateUserStatusRequest`) | `members.manage` |

Für die eigene Person lehnt der Fachservice Rollen-, Berechtigungs- und Statusänderungen mit `403 self_privilege_change_denied` ab. Eine Änderung, die der Gruppe die letzte Person mit `members.manage` oder `roles.manage` nähme, endet mit `403 last_role_manager_protected`.

### 3. Kassenbuch & Finanzen (`LedgerController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/ledger/balances` | Guthaben aller Mitglieder | `ledger.read` |
| `GET` | `/api/v1/ledger/members/{memberId}/balance` | Guthaben und Kennzahlen eines Mitglieds (`MemberBalanceDto`) | eigenes Konto oder `ledger.read` |
| `GET` | `/api/v1/ledger/members/{memberId}/entries` | Buchungen eines Mitglieds (`List<LedgerEntryDto>`) | eigenes Konto oder `ledger.read` |
| `GET` | `/api/v1/ledger/events/{eventId}/summary` | Abrechnung eines Events (`EventLedgerSummaryDto`) | `ledger.read` oder `event.manage` |
| `POST` | `/api/v1/ledger/purchases/preview` | Preis und Event zu einem Barcode vorab ermitteln | `purchase.self` |
| `POST` | `/api/v1/ledger/purchases` | Barcode-Kauf ausführen (`PurchaseRequest` + `Idempotency-Key`) | `purchase.self` |
| `POST` | `/api/v1/ledger/purchases/{entryId}/undo` | Eigenen Barcode-Kauf innerhalb von 10 Minuten zurücknehmen (+ `Idempotency-Key`) | `purchase.self` |
| `POST` | `/api/v1/ledger/topups` | Guthaben aufladen (`TopupRequest` + `Idempotency-Key`) | `ledger.correct` |
| `POST` | `/api/v1/ledger/payouts` | Guthaben auszahlen (`PayoutRequest` + `Idempotency-Key`) | `ledger.correct` |
| `POST` | `/api/v1/ledger/corrections` | Gegenbuchung zu einer Buchung (`CorrectionRequest` + `Idempotency-Key`) | `ledger.correct` |

### 4. Tablet-Strichliste (`TabletRecorderController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tablet/events` | Aktive Events für die Auswahl | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{eventId}/members` | Teilnehmende für die Touch-Ansicht | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{eventId}/drinks` | Getränke des Events | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{eventId}/food` | Speisen des Events | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{eventId}/items` | Getränke und Speisen zusammen (`TabletItemsDto`) | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{eventId}/purchases` | Buchung für Getränk oder Speise (`TabletPurchaseRequest` + `Idempotency-Key`) | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{eventId}/purchases/{entryId}/undo` | Tablet-Buchung innerhalb von 10 Minuten zurücknehmen (+ `Idempotency-Key`) | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{eventId}/rounds` | Runde (`TabletRevenuePurchaseRequest` + `Idempotency-Key`) | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{eventId}/evening` | Abendabrechnung (`TabletRevenuePurchaseRequest` + `Idempotency-Key`) | `purchase.tablet` |

**Kiosk-Modus (`KioskController`)**

| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/kiosk/sessions` | Kiosk-Modus auf einem Gerät starten (`{ "pin": "4 bis 8 Ziffern", "label": "Gerätename" }`); die PIN wird nur als BCrypt-Hash gespeichert | `purchase.tablet` oder `kiosk.manage` |
| `GET` | `/api/v1/kiosk/sessions/{sessionId}` | Zustand der Sitzung (`KioskSessionDto`), damit das Gerät eine Fernentsperrung bemerkt | `purchase.tablet` oder `kiosk.manage` |
| `POST` | `/api/v1/kiosk/sessions/{sessionId}/unlock` | Mit der PIN verlassen (`KioskUnlockResultDto`); nach 5 Fehlversuchen gesperrt (1, 5, 15, dann 60 Min.) | `purchase.tablet` oder `kiosk.manage` |
| `GET` | `/api/v1/kiosk/sessions` | Laufende Kiosk-Geräte | `kiosk.manage` |
| `POST` | `/api/v1/kiosk/sessions/{sessionId}/end` | Gerät aus der Ferne entsperren, ohne PIN | `kiosk.manage` |

### 5. Getränkekatalog & Sublisten (`DrinkCatalogController`, `DrinkSublistController`, `EventDrinkController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/drinks` | Getränke der Gruppe (Filter `status`); ohne `catalog.approve` nur freigegebene und eigene Vorschläge | Mitglied |
| `GET` | `/api/v1/drinks/{id}` | Ein Getränk | Mitglied |
| `GET` | `/api/v1/drinks/barcode/{barcode}` | Getränk zu einem Barcode | Mitglied |
| `POST` | `/api/v1/drinks` | Getränk vorschlagen (`ProposeDrinkRequest`); mit `catalog.approve` sofort freigegeben | `catalog.propose` |
| `PUT` | `/api/v1/drinks/{id}` | Getränk ändern (`UpdateDrinkRequest`) | `catalog.approve` oder eigener Vorschlag |
| `POST` | `/api/v1/drinks/{id}/approve` | Vorschlag freigeben | `catalog.approve` |
| `POST` | `/api/v1/drinks/{id}/reject` | Vorschlag ablehnen | `catalog.approve` |
| `POST` | `/api/v1/drinks/{id}/barcodes` | Barcode zuweisen (`AddBarcodeRequest`) | `catalog.approve` oder eigener Vorschlag |
| `DELETE` | `/api/v1/drinks/{id}/barcodes/{barcodeId}` | Barcode entfernen | `catalog.approve` oder eigener Vorschlag |
| `GET` | `/api/v1/sublists` | Sublisten | Mitglied |
| `GET` | `/api/v1/sublists/{id}` | Eine Subliste | Mitglied |
| `POST` | `/api/v1/sublists` | Subliste anlegen (`CreateSublistRequest`) | Mitglied |
| `PUT` | `/api/v1/sublists/{id}` | Subliste ändern (`UpdateSublistRequest`) | `catalog.approve` oder Ersteller |
| `DELETE` | `/api/v1/sublists/{id}` | Subliste löschen | `catalog.approve` oder Ersteller |
| `POST` | `/api/v1/sublists/{id}/items` | Getränk mit optionalem `defaultPrice` hinzufügen | `catalog.approve` oder Ersteller |
| `DELETE` | `/api/v1/sublists/{id}/items/{itemId}` | Eintrag entfernen | `catalog.approve` oder Ersteller |
| `GET` | `/api/v1/events/{eventId}/drinks` | Getränke des Events | Teilnehmende, Veranstalter, `event.manage` |
| `POST` | `/api/v1/events/{eventId}/drinks` | Getränk zum Event hinzufügen (`AddEventDrinkRequest` mit `price`, `costPrice`) | `event.manage` oder Veranstalter |
| `POST` | `/api/v1/events/{eventId}/drinks/assign-sublist` | Subliste dem Event zuweisen (`AssignSublistRequest`) | `event.manage` oder Veranstalter |
| `PUT` | `/api/v1/events/{eventId}/drinks/{eventDrinkId}` | Eventgetränk ändern (`UpdateEventDrinkRequest`) | `event.manage` oder Veranstalter |
| `DELETE` | `/api/v1/events/{eventId}/drinks/{eventDrinkId}` | Eventgetränk entfernen | `event.manage` oder Veranstalter |

### 5.1. Speisenkatalog (`FoodCatalogController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/food` | Speisen der Gruppe (Filter `active`); ohne `catalog.approve` nur aktive | Mitglied |
| `GET` | `/api/v1/food/{id}` | Eine Speise (`FoodDto`) | Mitglied |
| `POST` | `/api/v1/food` | Speise anlegen (`CreateFoodRequest`) | `catalog.approve` |
| `PUT` | `/api/v1/food/{id}` | Speise ändern (`UpdateFoodRequest`) | `catalog.approve` |

### 5.2. Eventspeisen (`EventFoodController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events/{eventId}/food` | Speisen des Events (`List<EventFoodDto>`) | Teilnehmende, Veranstalter, `event.manage` |
| `POST` | `/api/v1/events/{eventId}/food` | Speise zum Event hinzufügen (`AddEventFoodRequest` mit `price`, `costPrice`, `tabletEnabled`) | `event.manage` oder Veranstalter |
| `PUT` | `/api/v1/events/{eventId}/food/{eventFoodId}` | Eventspeise ändern (`UpdateEventFoodRequest`) | `event.manage` oder Veranstalter |
| `DELETE` | `/api/v1/events/{eventId}/food/{eventFoodId}` | Speise aus dem Event entfernen | `event.manage` oder Veranstalter |

### 5.3. Moments & Rituale (`MomentController`, `MomentConfigController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events/{eventId}/moments` | Laufende Moments des Events | Teilnehmende, Veranstalter, `event.manage` |
| `POST` | `/api/v1/events/{eventId}/moments` | Moment starten (`StartMomentRequest`) | wie oben |
| `GET` | `/api/v1/events/{eventId}/moments/{momentId}` | Moment mit Antworten | wie oben |
| `POST` | `/api/v1/events/{eventId}/moments/{momentId}/responses` | Antwort oder Reaktion abgeben (`SubmitMomentResponseRequest`) | wie oben |
| `GET` | `/api/v1/events/{eventId}/moments/{momentId}/map` | GeoJSON FeatureCollection mit freigegebenen Standorten (RFC 7946) | wie oben |
| `POST` | `/api/v1/events/{eventId}/moments/{momentId}/complete` | Moment abschließen | Ersteller, Veranstalter, `event.manage` |
| `GET` | `/api/v1/events/{eventId}/moments/history` | Abgeschlossene Moments | Teilnehmende, Veranstalter, `event.manage` |
| `POST` | `/api/v1/events/{eventId}/moments/{momentId}/media` | Foto (JPEG/PNG/GIF, bis 10 MB) oder Video (MP4/MOV, bis 60 s, bis 100 MB) als rohen Request-Körper hochladen (`Content-Type`, `Content-Length` Pflicht); Videos nur in Tarifen mit Videos | wie oben |
| `GET` | `/api/v1/events/{eventId}/moments/{momentId}/media/{mediaId}/content` | Datei entschlüsselt abrufen, mit HTTP-Range (`206`) | wie oben |
| `DELETE` | `/api/v1/events/{eventId}/moments/{momentId}/media/{mediaId}` | Datei entfernen | Eigentümer; fremde Beiträge Veranstalter oder `event.manage` |
| `GET` | `/api/v1/moment-config` | Typen, Reaktionen (inkl. ausgemusterter) und Upload-Grenzen | Mitglied |
| `POST` / `PUT` | `/api/v1/moment-config/types`, `/types/{id}` | Moment-Typ anlegen bzw. ändern oder ausmustern | `moments.manage` |
| `POST` / `PUT` | `/api/v1/moment-config/reactions`, `/reactions/{id}` | Reaktion anlegen bzw. ändern oder ausmustern | `moments.manage` |

### 6. Events & Gast-Einladungen (`EventController`, `InviteController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events` | Eigene und eingeladene Events mit eigener Zusage; mit `event.manage` alle Events der Gruppe | Mitglied |
| `POST` | `/api/v1/events` | Event anlegen (`CreateEventRequest`) | `event.create` |
| `GET` | `/api/v1/events/{id}` | Event-Details | Teilnehmende, Veranstalter, `event.manage` |
| `PUT` | `/api/v1/events/{id}` | Event ändern, Statuswechsel (`UpdateEventRequest`) | `event.manage` oder Veranstalter |
| `GET` | `/api/v1/events/{id}/participants` | Teilnehmerliste | Teilnehmende, Veranstalter, `event.manage` |
| `POST` | `/api/v1/events/{id}/participants` | Teilnehmer hinzufügen (`AddParticipantRequest`) | `event.manage` oder Veranstalter |
| `POST` | `/api/v1/events/{id}/invitations` | Mitglieder einladen (`InviteMembersRequest`: `userIds` oder `allMembers`) | `event.manage` oder Veranstalter |
| `PUT` | `/api/v1/events/{id}/rsvp` | Eigene Antwort `accepted`, `maybe` oder `declined` (`RsvpRequest`) | Eingeladene |
| `DELETE` | `/api/v1/events/{id}/participants/{userId}` | Teilnehmer entfernen | `event.manage` oder Veranstalter |
| `GET` | `/api/v1/events/{eventId}/invites` | Gast-Einladungen des Events | `event.invites.manage` oder Veranstalter |
| `POST` | `/api/v1/events/{eventId}/invites` | Gast-Einladungslink erzeugen (`CreateInviteRequest`) | `event.invites.manage` oder Veranstalter |
| `DELETE` | `/api/v1/events/{eventId}/invites/{inviteId}` | Gast-Einladung widerrufen | `event.invites.manage` oder Veranstalter |
| `POST` | `/api/v1/invites/accept` | Gast-Einladung einlösen (`AcceptInviteRequest`) | Öffentlich |

### 6.1. Einladungslinks in die Gruppe (`MemberInviteController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/member-invites` | Einladungslink erzeugen (`CreateMemberInviteRequest`) | `members.invite` |
| `GET` | `/api/v1/member-invites` | Einladungslinks der Gruppe | `members.invite` |
| `DELETE` | `/api/v1/member-invites/{inviteId}` | Einladungslink widerrufen | `members.invite` |
| `POST` | `/api/v1/member-invites/preview` | Gruppe und Gültigkeit eines Links prüfen | Öffentlich |
| `POST` | `/api/v1/member-invites/register` | Neues Konto anlegen und beitreten (mit AGB-Zustimmung) | Öffentlich |
| `POST` | `/api/v1/member-invites/join` | Mit bestehendem Konto beitreten | Angemeldet |

Fachlich: [Einladungslinks](../domains/member-invites.md).

### 7. Chat & Benachrichtigungen (`ChatController`, `ConversationController`, `NotificationController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events/{eventId}/chat` | Event-Chat (`ConversationDto`) | Teilnehmende, Veranstalter, `event.manage`, `chat.moderate` |
| `GET` / `POST` | `/api/v1/events/{eventId}/chat/messages` | Nachrichten lesen bzw. senden (`SendMessageRequest`) | wie oben |
| `GET` | `/api/v1/events/{eventId}/chat/conversations/{conversationId}` | Einzelne Unterhaltung des Events | wie oben |
| `GET` / `POST` | `/api/v1/events/{eventId}/chat/conversations/{conversationId}/messages` | Nachrichten dieser Unterhaltung | wie oben |
| `GET` / `POST` | `/api/v1/events/{eventId}/chat/guest/messages` | Nachrichten als Gast lesen bzw. senden | Gast (`X-Guest-Token`) |
| `GET` | `/api/v1/conversations` | Eigene Unterhaltungen (Gruppenchat, Direktnachrichten, Event-Chats) | Mitglied |
| `GET` | `/api/v1/conversations/unread-count` | Ungelesene Nachrichten | Mitglied |
| `GET` | `/api/v1/conversations/club` | Gruppenchat | Mitglied |
| `PUT` | `/api/v1/conversations/club/pin` | Infotafel im Gruppenchat setzen (`PinNoteRequest`) | `chat.moderate` oder `event.manage` |
| `POST` | `/api/v1/conversations/direct` | Direktnachricht beginnen (`StartDirectConversationRequest`) | Mitglied |
| `GET` / `POST` | `/api/v1/conversations/{conversationId}/messages` | Nachrichten lesen bzw. senden | Mitglied der Unterhaltung |
| `POST` | `/api/v1/conversations/{conversationId}/read` | Als gelesen markieren | Mitglied der Unterhaltung |
| `POST` | `/api/v1/conversations/{conversationId}/messages/{messageId}/reactions` | Reaktion setzen oder entfernen | Mitglied der Unterhaltung |
| `GET` | `/api/v1/notifications` | Eigene Mitteilungen | Angemeldet |
| `GET` | `/api/v1/notifications/unread-count` | Anzahl ungelesener Mitteilungen | Angemeldet |
| `POST` | `/api/v1/notifications/read-all` | Alle als gelesen markieren | Angemeldet |
| `POST` | `/api/v1/notifications/{notificationId}/read` | Eine Mitteilung als gelesen markieren | Angemeldet |
| `GET` | `/api/v1/notifications/vapid-public-key` | Öffentlicher VAPID-Schlüssel | Angemeldet |
| `GET` / `POST` | `/api/v1/notifications/subscriptions` | Eigene Web-Push-Abos lesen bzw. anlegen | Angemeldet |
| `DELETE` | `/api/v1/notifications/subscriptions/{subscriptionId}` | Web-Push-Abo entfernen | Angemeldet |
| `POST` | `/api/v1/notifications` | Mitteilung an ein Mitglied senden (`SendNotificationRequest`) | `notifications.broadcast` |
| `POST` | `/api/v1/notifications/broadcast` | Mitteilung an alle Mitglieder der Gruppe (`BroadcastNotificationRequest`) | `notifications.broadcast` |

Neue Nachrichten holt die App per Polling; einen WebSocket-Endpunkt gibt es nicht.

### 8. Bilder, Statistik & Audit-Logs (`ImageController`, `StatisticsController`, `AuditLogController`)
| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/images` | Bilder nach `purpose` und `targetId` | Mitglied |
| `POST` | `/api/v1/images` | Bild hochladen (`multipart/form-data`, `purpose`, `targetId`); wird verschlüsselt gespeichert | Mitglied |
| `GET` | `/api/v1/images/{id}` | Bildmetadaten; die URL zeigt auf `/content`, nicht direkt auf S3 | Mitglied |
| `GET` | `/api/v1/images/{id}/content` | Entschlüsselte Bilddaten | Mitglied |
| `DELETE` | `/api/v1/images/{id}` | Bild löschen | Eigentümer, `event.manage` oder `catalog.approve` |
| `GET` | `/api/v1/statistics` | Kennzahlen der Gruppe für die letzten 90 Tage, eigene Platzierung | Mitglied |
| `GET` | `/api/v1/audit-logs` | Revisionsprotokoll mit Filtern `targetEntity`, `action`, `actorId`, `targetId`; sichtbare Bereiche hängen von `audit.read`, `audit.read.all` und der Vorstandsrolle ab | `audit.read` |

### 9. Gruppen, Tarife & Getränkedatenbank (`StammtischController`, `BillingController`, `DrinkLibraryController`)

Alle fachlichen Endpunkte oben gelten für die gewählte Gruppe. Der BFF setzt dafür
den Header `X-Stammtisch-Id` aus dem HttpOnly-Cookie `vereint.stammtisch`; fehlt
er bei mehreren Mitgliedschaften, antwortet der Fachservice mit
`409 stammtisch_required`, ohne Mitgliedschaft mit `403 stammtisch_access_denied`.
Fachlich: [Gruppen](../domains/stammtische.md), [Tarife & Abrechnung](../domains/abrechnung.md).

| Methode | Pfad | Beschreibung | Berechtigung |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/stammtische` | Eigene Gruppen auflisten | Angemeldet |
| `POST` | `/api/v1/stammtische` | Weitere eigene Gruppe eröffnen (höchstens `SIGNUP_MAX_OWNED`) | Angemeldet |
| `POST` | `/api/v1/signup` | Gruppe und Konto in einem Schritt eröffnen (öffentlich, je IP begrenzt, `SIGNUP_ENABLED`) | Öffentlich |
| `GET` | `/api/v1/stammtisch` | Gewählte Gruppe mit Tarif und eigenen Rechten | Mitglied |
| `PUT` | `/api/v1/stammtisch` | Gruppe umbenennen | `stammtisch.manage` |
| `POST` | `/api/v1/stammtisch/leave` | Gruppe verlassen | Mitglied |
| `PUT` / `DELETE` | `/api/v1/stammtisch/image` | Bild der Gruppe setzen oder entfernen (PNG/JPEG/GIF bis 5 MB) | `stammtisch.manage` |
| `GET` | `/api/v1/stammtische/{id}/image` | Bild einer Gruppe | Mitglied dieser Gruppe |
| `GET` | `/api/v1/stammtisch/roles` | Rollen der Gruppe | `roles.manage` oder `members.read` |
| `POST` / `PUT` / `DELETE` | `/api/v1/stammtisch/roles`, `/api/v1/stammtisch/roles/{id}` | Eigene Rollen anlegen, ändern, löschen (Systemrollen nicht löschbar) | `roles.manage` |
| `GET` | `/api/v1/stammtisch/billing` | Tarif, Status, Grenzen und Verbrauch | Mitglied |
| `POST` | `/api/v1/stammtisch/billing/checkout` | Stripe Checkout für Tarif und Zahlweise starten | `billing.manage` |
| `POST` | `/api/v1/stammtisch/billing/portal` | Stripe-Kundenportal öffnen | `billing.manage` |
| `POST` | `/api/v1/stammtisch/billing/supporter` | Förderbeitrag abschließen | Mitglied |
| `GET` | `/api/v1/stammtisch/export` | Alle Daten der Gruppe als JSON (ohne Bilder und Videos) | `stammtisch.manage` oder `billing.manage` |
| `POST` | `/api/v1/billing/stripe/webhook` | Stripe-Ereignisse (Signatur geprüft, Caddy leitet direkt weiter) | Stripe |
| `GET` | `/api/v1/drink-library` | Gemeinsame Getränkedatenbank durchsuchen (Name oder Barcode) | Angemeldet |
| `GET` | `/api/v1/drink-library/{id}` | Eintrag der Getränkedatenbank | Angemeldet |
| `PUT` / `DELETE` | `/api/v1/drink-library/{id}` | Eintrag ändern oder löschen | Plattform-Admin |
| `POST` | `/api/v1/drinks/{id}/share-to-library` | Eigenes freigegebenes Getränk in die Datenbank teilen | `catalog.approve` |
| `GET` / `POST` | `/api/v1/platform/stammtische` | Alle Gruppen auflisten, Gruppe anlegen | Plattform-Admin |
| `PUT` | `/api/v1/platform/stammtische/{id}` | Gruppe umbenennen, archivieren, Tarif von Hand vergeben | Plattform-Admin |
