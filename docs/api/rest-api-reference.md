# REST API-Referenz & Endpunktkatalog

Die **Vereint Backend API** (`baseservice`) folgt strikten REST-Prinzipien, verwendet JSON als Austauschformat und nutzt Standard-HTTP-Statuscodes sowie standardisierte RFC-7807-Fehlerantworten (`application/problem+json`).

---

## 🔐 Authentifizierung & Header

- **Authorization**: `Bearer <Keycloak_OIDC_JWT>` (bei geschützten Endpunkten).
- **Idempotency-Key**: `UUIDv4` (Pflicht bei finanziellen Schreiboperationen: Käufe, Aufladungen, Auszahlungen, Korrekturen, Tablet-Buchungen).
- **X-Guest-Token**: Temporäres Gast-Session-Token für Gast-Endpunkte (`/api/v1/events/{eventId}/chat/guest/**`).
- **X-Request-Id**: Eindeutige Korrelations-ID (wird in Problem Details als `traceId` zurückgegeben).

---

## 📋 Endpunktkatalog nach Modulen

### 1. Authentifizierung & Zugangsauflösung (`AuthController`, `AccessResolverController`, `ApiInfoController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/auth/me` | Liefert Subject, Anzeigename, Rollen, Vorstandsrolle und Permissions des aktuellen Benutzers | Authentifiziert |
| `GET` | `/api/v1/auth/access` | Vollständige Zugriffsentscheidung mit Scopes und erlaubten App-Kontexten | Authentifiziert |
| `GET` | `/api/v1/auth/access/matrix` | Liefert die versionierte Rollen-Permission-Matrix (Single Source of Truth) | Authentifiziert |
| `POST` | `/api/v1/auth/access/check` | Prüft Berechtigung für spezifischen App-Kontext oder Event | Authentifiziert |
| `POST` | `/api/v1/auth/access/guest` | Validiert Gast-Token für ein Event (IP-ratenbegrenzt) | Öffentlich |
| `GET` | `/api/v1/info` | Liefert API-Metadaten und Versionsinformationen | Öffentlich |

### 2. Benutzerverwaltung (`UserController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/me` | Eigenes Benutzerprofil laden (`UserProfileDto`) | Authentifiziert |
| `PUT` | `/api/v1/users/me` | Eigenes Profil aktualisieren (`UpdateUserProfileRequest`) | Authentifiziert |
| `GET` | `/api/v1/users` | Paginierte Mitgliederliste abrufen (`page`, `size`, `search`, `role`) | `board`, `admin` |
| `GET` | `/api/v1/users/{id}` | Profildetails eines Mitglieds abrufen | `board`, `admin` |
| `PUT` | `/api/v1/users/{id}` | Stammdaten eines Mitglieds ändern (`AdminUpdateUserRequest`) | `admin` |
| `PUT` | `/api/v1/users/{id}/roles` | Rollen zuweisen (`AssignRolesRequest`) | `admin` |
| `PUT` | `/api/v1/users/{id}/permissions` | Direkte Berechtigungen zuweisen (`AssignPermissionsRequest`) | `admin` |
| `PUT` | `/api/v1/users/{id}/status` | Benutzer sperren oder aktivieren (`UpdateUserStatusRequest`) | `admin` |

### 3. Kassenbuch & Finanzen (`LedgerController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/ledger/members/{memberId}/balance` | Guthaben und Kennzahlen eines Mitglieds abrufen (`MemberBalanceDto`) | Eigenes / `board`, `admin` |
| `GET` | `/api/v1/ledger/members/{memberId}/entries` | Transaktionshistorie eines Mitglieds (`PagedResponse<LedgerEntryDto>`) | Eigenes / `board`, `admin` |
| `GET` | `/api/v1/ledger/events/{eventId}/summary` | Aggregierte Event-Kassenabrechnung (`EventLedgerSummaryDto`) | `board`, `admin` |
| `POST` | `/api/v1/ledger/purchases` | PWA Barcode-Kauf ausführen (`PurchaseRequest` + `Idempotency-Key`) | `purchase.self` |
| `POST` | `/api/v1/ledger/topups` | Guthaben aufladen (`TopupRequest` + `Idempotency-Key`) | `board`, `admin` |
| `POST` | `/api/v1/ledger/payouts` | Guthaben auszahlen (`PayoutRequest` + `Idempotency-Key`) | `board`, `admin` |
| `POST` | `/api/v1/ledger/corrections` | Buchung stornieren / Gegenbuchung (`CorrectionRequest` + `Idempotency-Key`) | `ledger.correct` |

### 4. Tablet Strichlisten-Recorder (`TabletRecorderController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tablet/events` | Liste aktiver Events für Kioskauswahl | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{eventId}/members` | Aktive Mitgliederliste für Touch-Ansicht | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{eventId}/drinks` | Verfügbare Getränke für das Event | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{eventId}/food` | Verfügbare Speisen für das Event | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{eventId}/items` | Kombiniertes Angebot an Getränken und Speisen (`TabletItemsDto`) | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{eventId}/purchases` | 1-Tap Touch-Buchung für Getränk oder Speise (`TabletPurchaseRequest` + opt. `Idempotency-Key`) | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{eventId}/rounds` | Runden-Buchung für Gruppe (`TabletRevenuePurchaseRequest` + opt. `Idempotency-Key`) | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{eventId}/evening` | Abendabrechnung (`TabletRevenuePurchaseRequest` + opt. `Idempotency-Key`) | `purchase.tablet` |

**Kiosk-Modus (`KioskController`)**

| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/kiosk/sessions` | Kiosk-Modus auf einem Gerät starten (`{ "pin": "4–8 Ziffern", "label": "Gerätename" }`); die PIN wird nur als BCrypt-Hash gespeichert | `purchase.tablet`, `board`, `admin` |
| `GET` | `/api/v1/kiosk/sessions/{sessionId}` | Zustand der Sitzung (`KioskSessionDto`), damit das Gerät eine Fernentsperrung bemerkt | `purchase.tablet`, `board`, `admin` |
| `POST` | `/api/v1/kiosk/sessions/{sessionId}/unlock` | Mit der PIN des Geräts verlassen (`KioskUnlockResultDto`); nach 5 Fehlversuchen gesperrt (1, 5, 15, dann 60 Min.) | `purchase.tablet`, `board`, `admin` |
| `GET` | `/api/v1/kiosk/sessions` | Laufende Kiosk-Geräte | `board`, `admin` |
| `POST` | `/api/v1/kiosk/sessions/{sessionId}/end` | Gerät aus der Ferne entsperren, ohne PIN | `board`, `admin` |

### 5. Getränkekatalog & Sublisten (`DrinkCatalogController`, `DrinkSublistController`, `EventDrinkController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/drinks` | Globalen Getränkekatalog abrufen (Filter `status`, `category`) | `member` |
| `POST` | `/api/v1/drinks/propose` | Neues Getränk vorschlagen (`ProposeDrinkRequest` inkl. `costPrice`) | `catalog.propose` |
| `POST` | `/api/v1/drinks/{id}/approve` | Vorgeschlagenes Getränk freigeben | `catalog.approve` |
| `POST` | `/api/v1/drinks/{id}/reject` | Vorschlag ablehnen | `catalog.approve` |
| `POST` | `/api/v1/drinks/{id}/barcodes` | Barcode zuweisen (`AssignBarcodeRequest`) | `board`, `admin` |
| `DELETE` | `/api/v1/drinks/{id}/barcodes/{barcode}` | Barcode entfernen | `board`, `admin` |
| `GET` | `/api/v1/sublists` | Alle Sublisten abrufen | `member` |
| `GET` | `/api/v1/sublists/{id}` | Einzelne Subliste laden | `member` |
| `POST` | `/api/v1/sublists` | Neue Subliste anlegen (`CreateSublistRequest`) | `board`, `admin` |
| `PUT` | `/api/v1/sublists/{id}` | Subliste aktualisieren (`UpdateSublistRequest`) | `board`, `admin` |
| `DELETE` | `/api/v1/sublists/{id}` | Subliste löschen | `board`, `admin` |
| `POST` | `/api/v1/sublists/{id}/items` | Getränk zu Subliste mit optionalem `defaultPrice` hinzufügen | `board`, `admin` |
| `DELETE` | `/api/v1/sublists/{id}/items/{itemId}` | Sublisteneintrag entfernen | `board`, `admin` |
| `GET` | `/api/v1/events/{eventId}/drinks` | Event-Getränkeauswahl laden | `member` |
| `POST` | `/api/v1/events/{eventId}/drinks` | Einzelgetränk zu Event hinzufügen (`AddEventDrinkRequest` inkl. `price`, `costPrice`) | `event.manage` |
| `POST` | `/api/v1/events/{eventId}/drinks/assign-sublist` | Komplette Subliste einem Event zuweisen (`AssignSublistRequest`) | `event.manage` |
| `PUT` | `/api/v1/events/{eventId}/drinks/{eventDrinkId}` | Eventgetränk bearbeiten (`UpdateEventDrinkRequest`) | `event.manage` |
| `DELETE` | `/api/v1/events/{eventId}/drinks/{eventDrinkId}` | Eventgetränk entfernen | `event.manage` |

### 5.1. Speisenkatalog (`FoodCatalogController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/food` | Globalen Speisenkatalog auflisten (Filter `active`) | `member` (aktive) / `board`, `admin` (alle) |
| `GET` | `/api/v1/food/{id}` | Details einer Speise abrufen (`FoodDto`) | `member` |
| `POST` | `/api/v1/food` | Neue Speise im Katalog der Gruppe anlegen (`CreateFoodRequest`) | `board`, `admin` |
| `PUT` | `/api/v1/food/{id}` | Speise im Katalog der Gruppe aktualisieren (`UpdateFoodRequest`) | `board`, `admin` |

### 5.2. Eventspeisen (`EventFoodController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events/{eventId}/food` | Speisenangebot des Events abrufen (`List<EventFoodDto>`) | `member` / `purchase.tablet` |
| `POST` | `/api/v1/events/{eventId}/food` | Speise zum Event hinzufügen (`AddEventFoodRequest` mit `price`, `costPrice`, `tabletEnabled`) | `event.manage` / Owner |
| `PUT` | `/api/v1/events/{eventId}/food/{eventFoodId}` | Eventspeise bearbeiten (`UpdateEventFoodRequest`) | `event.manage` / Owner |
| `DELETE` | `/api/v1/events/{eventId}/food/{eventFoodId}` | Speise aus dem Event entfernen | `event.manage` / Owner |

### 5.3. Moments & Rituale (`MomentController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events/{eventId}/moments` | Aktive Moments für Event abrufen | `member` |
| `POST` | `/api/v1/events/{eventId}/moments` | Neuen Moment starten (`StartMomentRequest`) | `member` |
| `GET` | `/api/v1/events/{eventId}/moments/{momentId}` | Moment-Details mit Timeline und Responses abrufen | `member` |
| `POST` | `/api/v1/events/{eventId}/moments/{momentId}/responses` | Status-Update/Reaktion zu Moment einreichen (`SubmitMomentResponseRequest`) | `member` |
| `GET` | `/api/v1/events/{eventId}/moments/{momentId}/map` | GeoJSON FeatureCollection mit Teilnehmer-Standorten abrufen (RFC 7946) | `member` |
| `POST` | `/api/v1/events/{eventId}/moments/{momentId}/complete` | Moment abschließen und in Event-Kalender archivieren | `member` (Initiator) / `board`, `admin` |
| `GET` | `/api/v1/events/{eventId}/moments/history` | Abgeschlossene Moments mit Zusammenfassungen abrufen | `member` |
| `POST` | `/api/v1/events/{eventId}/moments/{momentId}/media` | Foto (JPEG/PNG/GIF, ≤ 10 MB) oder Video (MP4/MOV, ≤ 60 s, ≤ 100 MB) als rohen Request-Körper hochladen (`Content-Type`, `Content-Length` Pflicht) | `member` |
| `GET` | `/api/v1/events/{eventId}/moments/{momentId}/media/{mediaId}/content` | Datei entschlüsselt abrufen, mit HTTP-Range (`206`) | `member` mit Zugriff auf den Moment |
| `DELETE` | `/api/v1/events/{eventId}/moments/{momentId}/media/{mediaId}` | Datei entfernen | Eigentümer; `board`, `admin`, Gastgeber für fremde Beiträge |
| `GET` | `/api/v1/moment-config` | Typen, Reaktionen (inkl. ausgemusterter) und Upload-Grenzen | angemeldet |
| `POST` / `PUT` | `/api/v1/moment-config/types`, `/types/{id}` | Moment-Typ anlegen bzw. ändern oder ausmustern | `board`, `admin` |
| `POST` / `PUT` | `/api/v1/moment-config/reactions`, `/reactions/{id}` | Reaktion anlegen bzw. ändern oder ausmustern | `board`, `admin` |

### 6. Events & Gast-Einladungen (`EventController`, `InviteController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events` | Events auflisten (Filter `status`, `from`, `to`) | `member` |
| `POST` | `/api/v1/events` | Event anlegen (`CreateEventRequest`) | `event.create` |
| `GET` | `/api/v1/events/{id}` | Event-Details laden | `member` |
| `PUT` | `/api/v1/events/{id}` | Event bearbeiten / Status-Transition (`UpdateEventRequest`) | `event.manage` / Owner |
| `GET` | `/api/v1/events/{id}/participants` | Teilnehmerliste des Events abrufen | `member` |
| `POST` | `/api/v1/events/{id}/participants` | Teilnahme melden oder Teilnehmer hinzufügen (`AddParticipantRequest`) | `member` |
| `DELETE` | `/api/v1/events/{id}/participants/{userId}` | Teilnahme zurückziehen oder Teilnehmer entfernen | `member` |
| `GET` | `/api/v1/events/{eventId}/invites` | Einladungen eines Events auflisten | `event.invites.manage` |
| `POST` | `/api/v1/events/{eventId}/invites` | Neuen Gast-Einladungslink generieren (`CreateInviteRequest`) | `event.invites.manage` |
| `DELETE` | `/api/v1/events/{eventId}/invites/{inviteId}` | Einladungslink stornieren / widerrufen | `event.invites.manage` |
| `POST` | `/api/v1/invites/accept` | Gast-Einladung einlösen (`AcceptInviteRequest`) | Öffentlich |

### 7. Chat & Benachrichtigungen (`ChatController`, `NotificationController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events/{eventId}/chat` | Konversationsmetadaten für das Event laden | `chat.member` |
| `GET` | `/api/v1/events/{eventId}/chat/messages` | Nachrichten des Event-Chats abrufen | `chat.member` |
| `POST` | `/api/v1/events/{eventId}/chat/messages` | Nachricht im Event-Chat senden (`SendMessageRequest`) | `chat.member` |
| `GET` | `/api/v1/events/{eventId}/chat/guest/messages` | Nachrichten für Gäste abrufen (`X-Guest-Token`) | Gast (`X-Guest-Token`) |
| `POST` | `/api/v1/events/{eventId}/chat/guest/messages` | Nachricht als Gast senden (`SendMessageRequest` + `X-Guest-Token`) | Gast (`X-Guest-Token`) |
| `GET` | `/api/v1/notifications` | Benachrichtigungen des Benutzers abrufen | Authentifiziert |
| `GET` | `/api/v1/notifications/unread-count` | Anzahl ungelesener Benachrichtigungen | Authentifiziert |
| `POST` | `/api/v1/notifications/read-all` | Alle Benachrichtigungen als gelesen markieren | Authentifiziert |
| `POST` | `/api/v1/notifications/{id}/read` | Einzelne Benachrichtigung als gelesen markieren | Authentifiziert |
| `GET` | `/api/v1/notifications/vapid-public-key` | Öffentlichen VAPID-Schlüssel abfragen | Authentifiziert |
| `POST` | `/api/v1/notifications/subscriptions` | Web-Push-Abonnement anlegen (`PushSubscriptionCreateRequest`) | Authentifiziert |
| `POST` | `/api/v1/notifications` | Benachrichtigung / Broadcast versenden (`SendNotificationRequest`) | `board`, `admin` |

### 8. Bilder & Audit-Logs (`ImageController`, `AuditLogController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/images` | Bilder nach `purpose` und `targetId` filtern | Authentifiziert |
| `POST` | `/api/v1/images` | Bild hochladen (`multipart/form-data`, `purpose`, `targetId`); wird verschlüsselt gespeichert | Authentifiziert |
| `GET` | `/api/v1/images/{id}` | Bildmetadaten und URL der Bilddaten (zeigt auf `/content`, keine direkte S3-URL) | Authentifiziert |
| `GET` | `/api/v1/images/{id}/content` | Entschlüsselte Bilddaten für berechtigte Personen | Authentifiziert |
| `DELETE` | `/api/v1/images/{id}` | Bild löschen / als gelöscht markieren | Eigentümer / `board`, `admin` |
| `GET` | `/api/v1/audit-logs` | Revisionsprotokolle abrufen (`AuditLogDto`, Paging & Filter) | `audit.read` |

### 9. Gruppen, Tarife & Getränkedatenbank (`StammtischController`, `BillingController`, `DrinkLibraryController`)

Alle fachlichen Endpunkte oben gelten für die gewählte Gruppe. Der BFF setzt dafür
den Header `X-Stammtisch-Id` aus dem HttpOnly-Cookie `vereint.stammtisch`; fehlt
er bei mehreren Mitgliedschaften, antwortet der Fachservice mit
`409 stammtisch_required`, ohne Mitgliedschaft mit `403 stammtisch_access_denied`.
Fachlich: [Gruppen](../domains/stammtische.md), [Tarife & Abrechnung](../domains/abrechnung.md).

| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/stammtische` | Eigene Gruppen auflisten | Authentifiziert |
| `POST` | `/api/v1/stammtische` | Weitere eigene Gruppe eröffnen (höchstens `SIGNUP_MAX_OWNED`) | Authentifiziert |
| `POST` | `/api/v1/signup` | Gruppe und Konto in einem Schritt eröffnen (öffentlich, je IP begrenzt, `SIGNUP_ENABLED`) | Öffentlich |
| `GET` | `/api/v1/stammtisch` | Gewählte Gruppe mit Tarif und eigenen Rechten | Mitglied |
| `PUT` | `/api/v1/stammtisch` | Gruppe umbenennen | `stammtisch.manage` |
| `POST` | `/api/v1/stammtisch/leave` | Gruppe verlassen | Mitglied |
| `PUT` / `DELETE` | `/api/v1/stammtisch/image` | Bild der Gruppe setzen oder entfernen (PNG/JPEG/GIF bis 5 MB) | `stammtisch.manage` |
| `GET` | `/api/v1/stammtische/{id}/image` | Bild einer Gruppe | Mitglied dieser Gruppe |
| `GET` | `/api/v1/stammtisch/roles` | Rollen der Gruppe | `roles.manage` oder `members.read` |
| `POST` / `PUT` / `DELETE` | `/api/v1/stammtisch/roles`, `/api/v1/stammtisch/roles/{id}` | Eigene Rollen anlegen, ändern, löschen (Systemrollen nicht löschbar) | `roles.manage` |
| `POST` | `/api/v1/member-invites/join` | Mit bestehendem Konto per Einladungslink beitreten | Authentifiziert |
| `GET` | `/api/v1/stammtisch/billing` | Tarif, Status, Grenzen und Verbrauch | Mitglied |
| `POST` | `/api/v1/stammtisch/billing/checkout` | Stripe Checkout für Tarif und Zahlweise starten | `billing.manage` |
| `POST` | `/api/v1/stammtisch/billing/portal` | Stripe-Kundenportal öffnen | `billing.manage` |
| `POST` | `/api/v1/stammtisch/billing/supporter` | Förderbeitrag abschließen | Mitglied |
| `GET` | `/api/v1/stammtisch/export` | Alle Daten der Gruppe als JSON (ohne Bilder und Videos) | `stammtisch.manage` oder `billing.manage` |
| `POST` | `/api/v1/billing/stripe/webhook` | Stripe-Ereignisse (Signatur geprüft, Caddy leitet direkt weiter) | Stripe |
| `GET` | `/api/v1/drink-library` | Gemeinsame Getränkedatenbank durchsuchen (Name oder Barcode) | Authentifiziert |
| `GET` | `/api/v1/drink-library/{id}` | Eintrag der Getränkedatenbank | Authentifiziert |
| `PUT` / `DELETE` | `/api/v1/drink-library/{id}` | Eintrag ändern oder löschen | Plattform-Admin |
| `POST` | `/api/v1/drinks/{id}/share-to-library` | Eigenes freigegebenes Getränk in die Datenbank teilen | `catalog.approve` |
| `GET` / `POST` | `/api/v1/platform/stammtische` | Alle Gruppen auflisten, Gruppe anlegen | Plattform-Admin |
| `PUT` | `/api/v1/platform/stammtische/{id}` | Gruppe umbenennen, archivieren, Tarif von Hand vergeben | Plattform-Admin |
