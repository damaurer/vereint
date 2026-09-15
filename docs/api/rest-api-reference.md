# REST API-Referenz & Endpunktkatalog

Die **Vereint Backend API** (`baseservice`) folgt REST-Prinzipien, verwendet JSON als Austauschformat und nutzt Standard-HTTP-Statuscodes sowie standardisierte RFC-7807-Fehlerantworten.

---

## 🔐 Authentifizierung & Header

- **Authorization**: `Bearer <Keycloak_OIDC_JWT>` (bei allen geschützten Endpunkten).
- **Idempotency-Key**: `UUIDv4` (Pflicht bei finanziellen Schreiboperationen: Käufe, Aufladungen, Stornos, Kiosk-Buchungen).
- **X-Request-Id**: Automatisch generierte oder durchgereichte Korrelations-ID für Traceability.

---

## 📋 Endpunktkatalog nach Modulen

### 1. Authentifizierung & Zugangsauflösung (`AuthController`, `AccessResolverController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/auth/access/current` | Liefert Rollen, Permissions und Kontext des aktuellen Benutzers | Authentifiziert |
| `POST` | `/api/v1/auth/access/guest` | Validiert temporären Gastzugang für ein Event | Öffentlich |
| `GET` | `/api/v1/access/resolve` | Ermittelt effektive Berechtigungen für angefragte Kontexte | Authentifiziert |

### 2. Benutzerverwaltung (`UserController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/me` | Eigenes Benutzerprofil laden | `profile.read.self` |
| `PATCH` | `/api/v1/users/me` | Eigenes Profil aktualisieren (`UpdateProfileRequest`) | `profile.read.self` |
| `GET` | `/api/v1/users` | Paginierte Mitgliederliste abrufen (`page`, `size`, `search`, `role`) | `board`, `admin` |
| `GET` | `/api/v1/users/{id}` | Profildetails eines Mitglieds abrufen | `board`, `admin` |
| `PATCH` | `/api/v1/users/{id}` | Stammdaten eines Mitglieds ändern (`AdminUpdateUserRequest`) | `admin` |
| `PUT` | `/api/v1/users/{id}/roles` | Rollen zuweisen (`AssignRolesRequest`) | `admin` |
| `PUT` | `/api/v1/users/{id}/permissions` | Direkte Berechtigungen zuweisen (`AssignPermissionsRequest`) | `admin` |
| `PUT` | `/api/v1/users/{id}/status` | Benutzer sperren oder aktivieren (`UpdateUserStatusRequest`) | `admin` |

### 3. Kassenbuch & Finanzen (`LedgerController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/ledger/members/{memberId}/balance` | Guthaben und Kennzahlen eines Mitglieds abrufen | Eigenes / `board`, `admin` |
| `GET` | `/api/v1/ledger/members/{memberId}/entries` | Transaktionshistorie eines Mitglieds abrufen | Eigenes / `board`, `admin` |
| `GET` | `/api/v1/ledger/events/{eventId}/summary` | Aggregierte Event-Kassenabrechnung | `board`, `admin` |
| `POST` | `/api/v1/ledger/purchases` | PWA Barcode-Kauf ausführen (`PurchaseRequest` + `Idempotency-Key`) | `purchase.self` |
| `POST` | `/api/v1/ledger/topups` | Guthaben aufladen (`TopupRequest` + `Idempotency-Key`) | `board`, `admin` |
| `POST` | `/api/v1/ledger/payouts` | Guthaben auszahlen (`PayoutRequest` + `Idempotency-Key`) | `board`, `admin` |
| `POST` | `/api/v1/ledger/corrections` | Buchung stornieren (`CorrectionRequest` + `Idempotency-Key`) | `ledger.correct` |

### 4. Tablet Strichlisten-Recorder (`TabletRecorderController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tablet/events` | Liste aktiver Events für Kioskauswahl | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{id}/members` | Aktive Mitgliederliste für Touch-Ansicht | `purchase.tablet` |
| `GET` | `/api/v1/tablet/events/{id}/drinks` | Verfügbare Getränke für das Event | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{id}/purchases` | 1-Tap Touch-Buchung (`TabletPurchaseRequest`) | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{id}/rounds` | Runden-Buchung für Gruppe (`TabletRevenuePurchaseRequest`) | `purchase.tablet` |
| `POST` | `/api/v1/tablet/events/{id}/evening` | Abendabrechnung / Pauschale | `purchase.tablet` |

### 5. Getränkekatalog, Sublisten & Runden (`DrinkCatalogController`, `DrinkSublistController`, `DrinkWithMeController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/drinks` | Globalen Getränkekatalog abrufen (Filter `status`, `category`) | `member` |
| `POST` | `/api/v1/drinks/propose` | Neues Getränk vorschlagen (`ProposeDrinkRequest`) | `catalog.propose` |
| `POST` | `/api/v1/drinks/{id}/approve` | Vorgeschlagenes Getränk freigeben | `catalog.approve` |
| `POST` | `/api/v1/drinks/{id}/reject` | Vorschlag ablehnen | `catalog.approve` |
| `POST` | `/api/v1/drinks/{id}/barcodes` | Barcode zuweisen | `board`, `admin` |
| `GET` | `/api/v1/sublists` | Alle Sublisten abrufen | `member` |
| `POST` | `/api/v1/sublists` | Neue Subliste anlegen (`CreateSublistRequest`) | `board`, `admin` |
| `POST` | `/api/v1/sublists/{id}/items` | Getränk zu Subliste mit optionalem Preisoverride hinzufügen | `board`, `admin` |
| `GET` | `/api/v1/drink-with-me` | Aktive Runden auflisten | `member` |
| `POST` | `/api/v1/drink-with-me` | Neue Runde eröffnen (`CreateDrinkWithMeRequest`) | `member` |
| `POST` | `/api/v1/drink-with-me/{id}/join` | Einer Runde beitreten | `member` |
| `POST` | `/api/v1/drink-with-me/{id}/complete`| Runde abschließen und abrechnen | Runden-Initiator |

### 6. Events & Gast-Einladungen (`EventController`, `InviteController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events` | Events auflisten (Filter `status`, `from`, `to`) | `member` |
| `POST` | `/api/v1/events` | Event anlegen (`CreateEventRequest`) | `event.create` |
| `GET` | `/api/v1/events/{id}` | Event-Details mit RSVP-Zusammenfassung | `member` |
| `POST` | `/api/v1/events/{id}/publish` | Event veröffentlichen | `event.manage` |
| `POST` | `/api/v1/events/{id}/activate` | Event starten / Theke öffnen | `event.manage` |
| `POST` | `/api/v1/events/{id}/complete` | Event abschließen | `event.manage` |
| `POST` | `/api/v1/events/{id}/cancel` | Event absagen | `event.manage` |
| `POST` | `/api/v1/events/{id}/rsvp` | Teilnahme melden (`RsvpRequest`: `attending`, `declined`, `maybe`) | `member` |
| `POST` | `/api/v1/invites` | Einladungslink generieren (`CreateEventInviteRequest`) | `event.invites.manage` |
| `POST` | `/api/v1/invites/accept` | Gast-Einladung einlösen (`AcceptInviteRequest`) | Öffentlich |

### 7. Chat & Benachrichtigungen (`ChatController`, `NotificationController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/chat/conversations` | Eigene Konversationen abrufen | `chat.member` |
| `GET` | `/api/v1/chat/conversations/{id}/messages` | Nachrichten einer Konversation laden | `chat.member` |
| `POST` | `/api/v1/chat/conversations/{id}/messages` | Nachricht senden (`SendMessageRequest`) | `chat.member` |
| `GET` | `/api/v1/notifications` | Benachrichtigungen des Benutzers | Authentifiziert |
| `GET` | `/api/v1/notifications/unread-count` | Anzahl ungelesener Benachrichtigungen | Authentifiziert |
| `POST` | `/api/v1/notifications/{id}/read` | Benachrichtigung als gelesen markieren | Authentifiziert |
| `GET` | `/api/v1/notifications/vapid-public-key` | Öffentlichen VAPID-Schlüssel abfragen | Authentifiziert |
| `POST` | `/api/v1/notifications/push-subscriptions` | Web-Push-Abonnement anlegen | Authentifiziert |
| `POST` | `/api/v1/notifications/send` | Vorstands-Broadcast versenden (`SendNotificationRequest`) | `board`, `admin` |

### 8. Bilder & Audit-Logs (`ImageController`, `AuditLogController`)
| Methode | Pfad | Beschreibung | Berechtigung / Rolle |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/images/upload` | Bild im S3-Objektspeicher hochladen (`multipart/form-data`) | Authentifiziert |
| `GET` | `/api/v1/images/{id}` | Bildmetadaten oder Streaming-URL abrufen | Authentifiziert |
| `GET` | `/api/v1/audit-logs` | Revisionsprotokolle abrufen (`AuditLogDto`) | `audit.read` |
