# Vereint – Dokumentations-Hub & Wissensbasis

Herzlich willkommen in der zentralen Wissensbasis und Dokumentationssuite des Projekts **Vereint** (Vereinsmanagement- & Strichlisten-Plattform).

Dieses Dokumentationszentrum bietet eine lückenlose, hochdetaillierte fachliche (*Business Logic & User Stories*) und technische (*Architektur, Code & API-Design*) Referenz aller bereits implementierten Module und Systemkomponenten.

---

## 📘 Benutzerhandbuch

Das Handbuch für Mitglieder, Vorstand, Administration, Thekendienst und Gäste mit echten Screenshots liegt unter [`handbuch/`](handbuch/README.md).

## 🗺️ Dokumentationsübersicht & Verzeichnisstruktur

Die Dokumentation ist modular in acht Kernbereiche unterteilt:

```text
docs/
├── architecture/                         # Systemarchitektur, Sicherheit & Datenmodelle
│   ├── system-overview.md                # Multi-Tier Systemarchitektur & Tech-Stack
│   ├── security-and-auth.md              # OIDC, PKCE, Cookie-Session, Rollen & Berechtigungen
│   └── data-model.md                     # Entity-Relationship-Modell & PostgreSQL Schema
│
├── baseservice/                          # Spring Boot 4.1 Fachservice Technische Dokumentation
│   ├── README.md                         # Übersicht, Lernpfad, Gesamtarchitektur & Glossar
│   ├── 01-overview-and-setup.md          # Tech-Stack, Ordnerstruktur, Start & Umgebungsvariablen
│   ├── 02-architecture-and-layers.md     # Schichten, Request-Lifecycle, Konventionen & Paketkarte
│   ├── 03-security-and-authorization.md  # SecurityFilterChain, JWT, Matrix V2, AuthContext & CORS
│   ├── 04-persistence-and-migrations.md  # Entities, Repositories, Optimistic Locking & Liquibase
│   ├── 05-error-handling-and-observability.md # ApiException, ErrorCode, RFC 7807, Actuator & OpenAPI
│   ├── i18n.md                           # Mehrsprachige Fehler- und Validierungstexte
│   ├── 06-integrations.md                # Objektspeicher (S3/In-Memory), Web-Push (VAPID) & Chat
│   └── 07-extending-the-service.md       # How-Tos, Testing (MockMvc/Testcontainers), Troubleshooting & PR-Checkliste
│
├── backend-for-frontend/                 # Express 5 BFF Technische Dokumentation
│   ├── README.md                         # Übersicht, Lernpfad & Gesamtarchitektur
│   ├── 01-overview-and-setup.md          # Tech-Stack, Ordnerstruktur, Skripte & Env-Variablen
│   ├── 02-request-pipeline.md            # server.ts Pipeline, Helmet, Caching & TransferState
│   ├── 03-authentication-and-session.md  # OIDC, PKCE, Session-Verschlüsselung & Token-Refresh
│   ├── 04-authorization.md               # AppContexts, Entscheidungsbaum & Resilienz
│   ├── 05-api-proxy-and-invites.md       # API-Proxy (/api/v1), Header-Regeln & Invites
│   └── 06-extending-the-server.md        # How-Tos, Testing mit Vitest & Debugging
│
├── domains/                              # Fachliche & Technische Spezifikationen der Kernmodule
│   ├── auth-and-user-management.md       # Profile, Rollen, Deaktivierung & Provisionierung
│   ├── ledger-and-finance.md             # Kassenbuch, Buchungslogik, Einkaufspreise & Deckungsbeitrag
│   ├── drink-catalog-and-sublists.md     # Getränkekatalog & Event-Sublisten
│   ├── food-catalog-and-event-food.md    # Speisenkatalog & Eventspeisen
│   ├── moments-and-rituals.md            # Moments & Rituale, Multi-Status-Updates & Welt-Karten
│   ├── events-and-invites.md             # Event-Lebenszyklus, RSVPs & Gast-Einladungstoken
│   ├── tablet-strichliste-recorder.md    # Kiosk-Strichliste, 1-Tap-Buchung & Abendabrechnung
│   ├── chat-and-push-notifications.md    # Vereinschat, Direktnachrichten & VAPID Web Push
│   └── statistics-and-analytics.md       # Verbrauchs- & Eber-Statistiken, Auswertungen
│
├── frontend/                             # Client-Architektur & UI-Bibliothek
│   ├── angular-ssr-and-pwa.md            # Angular 22 SSR, Express BFF & PWA-Caching
│   ├── i18n.md                           # Mehrsprachigkeit: neue Sprache hinzufügen, Texte im Code
│   └── ui-components-and-design-system.md # Optimus Design Tokens & UI-Komponentenbibliothek
│
├── api/                                  # API-Referenz & Integrationsverträge
│   ├── rest-api-reference.md             # REST API Endpunktkatalog & DTO-Schemas
│   └── error-handling-and-idempotency.md # RFC 7807 Problem Details & Idempotenz-Muster
│
└── operations/                           # Betrieb, Deployment & Infrastruktur
    ├── local-setup-docker.md             # Lokale Entwicklung & Docker Compose Topology
    ├── keycloak-and-storage.md           # Keycloak Realms & MinIO S3 Objektspeicher
    └── database-migrations.md            # Liquibase Migrationen & Schema-Verwaltung
```

---

## 📖 Glossar & Fachbegriffe (Domain Glossary)

| Fachbegriff | Technische Repräsentation | Beschreibung |
| :--- | :--- | :--- |
| **Mitglied (Member)** | `UserEntity`, `UserProfileDto` | Reguläres Vereinsmitglied mit Zugriff auf Profil, Guthaben, Getränke und Events. |
| **Vorstand (Board)** | Rolle `board` | Vereinsführung mit Rechten zur Event-Erstellung, Kassenverwaltung und Broadcasts. |
| **Administrator (Admin)** | Rolle `admin` | System- und Vereinsadministrator mit Vollzugriff inkl. Rollenvergabe und Account-Deaktivierung. |
| **Strichlisten-Schreiber** | Rolle `tabletRecorder`, Berechtigung `purchase.tablet` | Berechtigung zur Bedienung des Tablet-Kiosks zur Getränkebuchung auf Events. |
| **Kassenbuch / Ledger** | `LedgerEntry`, `LedgerService` | Unveränderliches Transaktionsjournal (Double-Entry Prinzip) für `topup`, `purchase`, `payout` und `correction`. |
| **Guthaben (Balance)** | `MemberBalanceDto.creditBalance` | Aktueller Kontostand eines Mitglieds als `BigDecimal` (in EUR). |
| **Idempotenzschlüssel** | `Idempotency-Key` (UUIDv4) | Eindeutiger HTTP-Header zur Vermeidung von Doppelbuchungen bei Verbindungsabbrüchen. |
| **Subliste (Sublist)** | `DrinkSublistEntity`, `DrinkSublistItemEntity` | Eine für ein Event freigeschaltete Untermenge des globalen Getränkekatalogs. |
| **Speisenkatalog (Food Catalog)** | `FoodCatalogEntity`, `FoodCatalogService` | Globaler Vereinskatalog für Speisen und Verzehrartikel mit Standard- und Einkaufspreisen. |
| **Eventspeisen (Event Food)** | `EventFoodEntity`, `EventFoodService` | Veranstaltungsbezogenes Speisenangebot mit individueller Preisanpassung und Kiosk-Steuerung. |
| **Einkaufspreis & Deckungsbeitrag** | `costPrice`, `profit = unitPrice - costPrice` | Erfassung des Wareneinsatzes zur automatischen Ermittlung der Gewinnmarge im Beleg-Snapshot und Kassenbuch. |
| **Moments & Rituale** | `MomentSessionEntity`, `MomentResponseEntity` | Ereignisgesteuerte Kollaborationsfunktion für spontane Momente gemeinsamer Aktivität (Toasts, Gebete, Jubelrufe, Check-ins) mit Multi-Status-Updates, Welt-Karten und 24h-Linked-Chats. |
| **Gast-Einladungstoken** | `EventInviteEntity`, `token_hash` | Krypto-Token (SHA-256 gehasht) für passwortlose Registrierung externer Gäste zu Events. |
| **Abendabrechnung** | `POST /api/v1/tablet/events/{eventId}/evening` | Abschlussbuchung von Bareinnahmen oder pauschalen Event-Umsätzen (`revenueOnly`). |
| **Optimus Design System** | `styles.css`, CSS Custom Properties | Zentrales Design-Token-System für konsistente Abstände, Farben, Elevation und Typografie. |
| **BFF (Backend-for-Frontend)** | `webservice/src/server.ts` | Node.js / Express Server für SSR-Rendering, Cookie-Session-Verwaltung und API-Proxy. |

---

## 🎯 Navigationsleitfaden nach Rollen & Personas

- **Für Entwickler (Onboarding & Codebase)**:
  1. Starte mit dem [System-Überblick](architecture/system-overview.md) für Architektur und Datenflüsse.
  2. Richte die Umgebung über das [Docker Setup](operations/local-setup-docker.md) ein.
  3. Lies die Spezifikationen in [REST API Reference](api/rest-api-reference.md) und [Error Handling](api/error-handling-and-idempotency.md).
- **Für Spring-Boot-Backend-Entwickler**:
  1. Starte im [baseservice Dokumentations-Hub](baseservice/README.md) und [Übersicht & Setup](baseservice/01-overview-and-setup.md).
  2. Vertiefe die [Architektur & Schichten](baseservice/02-architecture-and-layers.md), [Sicherheit & Autorisierung](baseservice/03-security-and-authorization.md) und [Persistenz & Migrationen](baseservice/04-persistence-and-migrations.md).
  3. Siehe [Fehlerbehandlung & Observability](baseservice/05-error-handling-and-observability.md) und [Integrationen](baseservice/06-integrations.md).
  4. Nutze [Service erweitern & Rezepte](baseservice/07-extending-the-service.md) für How-Tos, Testing-Konventionen und die PR-Checkliste.
- **Für Backend-for-Frontend & Express-Entwickler**:
  1. Starte im [BFF Dokumentations-Hub](backend-for-frontend/README.md) und [Übersicht & Setup](backend-for-frontend/01-overview-and-setup.md).
  2. Vertiefe die [Request-Pipeline](backend-for-frontend/02-request-pipeline.md), [Authentifizierung & Session](backend-for-frontend/03-authentication-and-session.md) und [Autorisierung](backend-for-frontend/04-authorization.md).
  3. Siehe [Server erweitern & How-Tos](backend-for-frontend/06-extending-the-server.md) für Rezepte und Vitest-Testing.
- **Für Frontend- & UI-Entwickler**:
  1. Siehe [Angular SSR & PWA](frontend/angular-ssr-and-pwa.md) bezüglich TransferState und Service Worker.
  2. Siehe [UI-Komponenten & Design System](frontend/ui-components-and-design-system.md) für wiederverwendbare Komponenten.
- **Für Vorstände & Vereinsverwalter**:
  1. Siehe [Kassenbuch & Finanzen](domains/ledger-and-finance.md) für das Buchungs- und Guthabensystem sowie Deckungsbeitragsanalysen.
  2. Siehe [Getränkekatalog](domains/drink-catalog-and-sublists.md) und [Speisenkatalog & Eventspeisen](domains/food-catalog-and-event-food.md) für die Sortimentspflege und Einkaufspreise.
  3. Siehe [Benutzerverwaltung](domains/auth-and-user-management.md), [Mitglieder per Einladungslink](domains/member-invites.md) und [Events & Einladungen](domains/events-and-invites.md).
- **Für Event-Betreiber & Thekenteams**:
  1. Siehe [Tablet Strichlisten-Recorder](domains/tablet-strichliste-recorder.md) für Kiosk-Abläufe, Speisen-/Getränkeauswahl und 1-Tap-Touch-Buchungen.
