# Vereint – Dokumentations-Hub & Wissensbasis

Herzlich willkommen in der zentralen Wissensbasis und Dokumentationssuite des Projekts **Vereint** (Vereinsmanagement- & Strichlisten-Plattform).

Dieses Dokumentationszentrum bietet eine lückenlose, hochdetaillierte fachliche (*Business Logic & User Stories*) und technische (*Architektur, Code & API-Design*) Referenz aller bereits implementierten Module und Systemkomponenten.

---

## 🗺️ Dokumentationsübersicht & Verzeichnisstruktur

Die Dokumentation ist modular in sechs Kernbereiche unterteilt:

```text
docs/
├── architecture/                         # Systemarchitektur, Sicherheit & Datenmodelle
│   ├── system-overview.md                # Multi-Tier Systemarchitektur & Tech-Stack
│   ├── security-and-auth.md              # OIDC, PKCE, Cookie-Session, Rollen & Berechtigungen
│   └── data-model.md                     # Entity-Relationship-Modell & PostgreSQL Schema
│
├── domains/                              # Fachliche & Technische Spezifikationen der Kernmodule
│   ├── auth-and-user-management.md       # Profile, Rollen, Deaktivierung & Provisionierung
│   ├── ledger-and-finance.md             # Kassenbuch, Buchungslogik & Idempotenz
│   ├── drink-catalog-and-sublists.md     # Getränkekatalog, Event-Sublisten & "Drink With Me"
│   ├── events-and-invites.md             # Event-Lebenszyklus, RSVPs & Gast-Einladungstoken
│   ├── tablet-strichliste-recorder.md    # Kiosk-Strichliste, 1-Tap-Buchung & Abendabrechnung
│   ├── chat-and-push-notifications.md    # Vereinschat, Direktnachrichten & VAPID Web Push
│   └── statistics-and-analytics.md       # Verbrauchs- & Eber-Statistiken, Auswertungen
│
├── frontend/                             # Client-Architektur & UI-Bibliothek
│   ├── angular-ssr-and-pwa.md            # Angular 22 SSR, Express BFF & PWA-Caching
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
| **Kassenbuch / Ledger** | `LedgerEntry`, `LedgerService` | Unveränderliches Transaktionsjournal (Double-Entry Prinzip) für Einzahlungen, Käufe und Runden. |
| **Guthaben (Balance)** | `aggregated sum(amount_cents)` | Aktueller Kontostand eines Mitglieds in Cents (positiv = Guthaben, negativ = Schulden). |
| **Idempotenzschlüssel** | `Idempotency-Key` (UUIDv4) | Eindeutiger HTTP-Header zur Vermeidung von Doppelbuchungen bei Verbindungsabbrüchen. |
| **Subliste (Sublist)** | `DrinkSublistEntity`, `DrinkSublistMapping` | Eine für ein Event freigeschaltete Untermenge des globalen Getränkekatalogs. |
| **Trink mit mir (Drink With Me)** | `DrinkWithMeEntity` | Kollaboratives Feature, bei dem Mitglieder virtuelle Runden anbieten oder beitreten. |
| **Gast-Einladungstoken** | `GuestInviteTokenEntity` | Krypto-Token (SHA-256 gehasht) für passwortlose Registrierung externer Gäste zu Events. |
| **Abendabrechnung** | `POST /api/v1/tablet/events/{id}/evening` | Abschlussbuchung von Bareinnahmen oder pauschalen Event-Umsätzen ohne Personenzuordnung. |
| **Optimus Design System** | `styles.css`, CSS Custom Properties | Zentrales Design-Token-System für konsistente Abstände, Farben, Elevation und Typografie. |
| **BFF (Backend-for-Frontend)** | `webservice/src/server/server.ts` | Node.js / Express Server für SSR-Rendering, Cookie-Session-Verwaltung und API-Proxy. |

---

## 🎯 Navigationsleitfaden nach Rollen & Personas

- **Für Entwickler (Onboarding & Codebase)**:
  1. Starte mit dem [System-Überblick](architecture/system-overview.md) für Architektur und Datenflüsse.
  2. Richte die Umgebung über das [Docker Setup](operations/local-setup-docker.md) ein.
  3. Lies die Spezifikationen in [REST API Reference](api/rest-api-reference.md) und [Error Handling](api/error-handling-and-idempotency.md).
- **Für Frontend- & UI-Entwickler**:
  1. Siehe [Angular SSR & PWA](frontend/angular-ssr-and-pwa.md) bezüglich TransferState und Service Worker.
  2. Siehe [UI-Komponenten & Design System](frontend/ui-components-and-design-system.md) für wiederverwendbare Komponenten.
- **Für Vorstände & Vereinsverwalter**:
  1. Siehe [Kassenbuch & Finanzen](domains/ledger-and-finance.md) für das Buchungs- und Guthabensystem.
  2. Siehe [Benutzerverwaltung](domains/auth-and-user-management.md) und [Events & Einladungen](domains/events-and-invites.md).
- **Für Event-Betreiber & Thekenteams**:
  1. Siehe [Tablet Strichlisten-Recorder](domains/tablet-strichliste-recorder.md) für Kiosk-Abläufe und 1-Tap-Touch-Buchungen.
