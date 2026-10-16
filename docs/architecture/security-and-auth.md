# Sicherheit, Authentifizierung & Berechtigungsmodell

Die Sicherheitsarchitektur von **Vereint** basiert auf dem Prinzip der tief gestaffelten Verteidigung (*Defense-in-Depth*). Sie kombiniert modernes **OpenID Connect (OIDC)** mit **Proof Key for Code Exchange (PKCE)**, geschützte **HTTP-Only Session Cookies** im BFF, eine zustandslose **Spring Security 6 Resource Server**-Validierung und eine zentral versionierte **Rollen- und Berechtigungsmatrix**.

---

## 🔐 Authentifizierungsfluss: OIDC mit PKCE & BFF-Session

Das Browser-Frontend speichert aus Sicherheitsgründen niemals Access- oder Refresh-Tokens im `localStorage` oder `sessionStorage` (Schutz vor XSS-Token-Diebstahl). Stattdessen übernimmt der **Express BFF Server** die Authentifizierung über das OIDC Authorization Code Flow mit PKCE.

```mermaid
sequenceDiagram
    autonumber
    actor User as Benutzer / Browser
    participant BFF as Express BFF (/auth/*)
    participant KC as Keycloak (Port 8082)
    participant Spring as Spring Boot Backend

    User->>BFF: GET /auth/login (Initiierung)
    Note over BFF: Generiert code_verifier & code_challenge (SHA-256)
    BFF-->>User: 302 Redirect to Keycloak (/protocol/openid-connect/auth)
    User->>KC: Eingabe Anmeldedaten & Bestätigung
    KC-->>User: 302 Redirect to BFF (/auth/callback?code=...&state=...)
    User->>BFF: GET /auth/callback?code=...
    BFF->>KC: POST /protocol/openid-connect/token (Code + code_verifier)
    KC-->>BFF: 200 OK (Access Token JWT, Refresh Token, ID Token)
    Note over BFF: Verschlüsselt Session & setzt HTTP-Only, SameSite Cookies
    BFF-->>User: 302 Redirect to / (App Dashboard) + Set-Cookie: vereint_session

    Note over User, Spring: Nachfolgender API-Aufruf
    User->>BFF: GET /api/v1/users/me (Cookie)
    Note over BFF: Liest Token aus Session, validiert Ablauf (Refresh wenn nötig)
    BFF->>Spring: GET /api/v1/users/me (Header: Authorization: Bearer <JWT>)
    Note over Spring: Spring Security validiert Signatur & Claims gegen Keycloak JWKS
    Spring-->>BFF: 200 OK (UserProfileDto)
    BFF-->>User: 200 OK (JSON Payload)
```

---

## 🛡️ Rollen- & Berechtigungsmatrix (`RolePermissionMatrix.kt`)

Die Zuordnung von Systemrollen zu atomaren Berechtigungen ist im Backend in `RolePermissionMatrix` (Version `2`) zentral verankert.

### Rollen im System (`UserRole`)
- `member`: Reguläres Vereinsmitglied mit Basisrechten.
- `board`: Vorstandsmitglied mit erweiterten Verwaltungsrechten.
- `admin`: Administrator mit Vollzugriff auf das Gesamtsystem.
- `tabletRecorder`: Technische Rolle für Kiosksysteme an der Vereinstheke.

### Vorstands-Funktionsrollen (`BoardRole`)
Optionale Funktionsbezeichnung innerhalb des Vorstands:
- `chair` (1. / 2. Vorsitzender)
- `treasurer` (Kassier / Schatzmeister)
- `secretary` (Schriftführer)
- `assessor` (Beisitzer)

### Berechtigungs-Zuordnungstabelle

| Berechtigung (`Permission`) | `member` | `board` | `admin` | `tabletRecorder` | Beschreibung |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `profile.read.self` | ✅ | ✅ | ✅ | ❌ | Eigenes Benutzerprofil einsehen |
| `balance.read.self` | ✅ | ✅ | ✅ | ❌ | Eigenen Kassenstand und Buchungshistorie abfragen |
| `purchase.self` | ✅ | ✅ | ✅ | ❌ | Eigene Einkäufe via Barcode-Scan buchen |
| `purchase.tablet` | ❌ | ❌ | ✅ | ✅ | Getränkebuchungen für alle Mitglieder am Theken-Tablet durchführen |
| `event.create` | ✅ | ✅ | ✅ | ❌ | Neue Vereinsveranstaltungen anlegen |
| `event.manage` | ❌ | ✅ | ✅ | ❌ | Bestehende Events bearbeiten, absagen oder abschließen |
| `event.invites.manage` | ❌ | ✅ | ✅ | ❌ | Gästelisten und Einladungstoken generieren |
| `catalog.propose` | ❌ | ✅ | ✅ | ❌ | Neue Getränke zur Aufnahme in den Katalog vorschlagen |
| `catalog.approve` | ❌ | ✅ | ✅ | ❌ | Vorgeschlagene Getränke freigeben oder ablehnen |
| `ledger.read` | ❌ | ✅ | ✅ | ❌ | Vollständiges Vereins-Kassenbuch und Salden einsehen |
| `ledger.correct` | ❌ | ✅ | ✅ | ❌ | Fehlbuchungen stornieren und Korrekturbuchungen ausführen |
| `chat.member` | ✅ | ✅ | ✅ | ❌ | Am vereinsweiten Chat und Gruppenkanälen teilnehmen |
| `chat.event` | ✅ | ✅ | ✅ | ❌ | In Event-spezifischen Chaträumen schreiben |
| `audit.read` | ❌ | ✅ | ✅ | ❌ | Audit-Logs und administrative Änderungsprotokolle einsehen |

---

## ⚙️ Spring Security Filter Chain & Tokenverarbeitung

In `baseservice` wird jede eingehende Anfrage durch `SecurityConfig` und `JwtAuthConverter` geprüft:

1. **Öffentliche Endpunkte (`permitAll`)**:
   - `/actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness`, `/actuator/info` (Monitoring)
   - `/api/v1/health`, `/api/v1/info`
   - `/api/v1/auth/access/guest` (Gast-Zugangsprüfung)
   - `/api/v1/invites/accept` (Gäste-Einladung einlösen)
   - `/api/v1/member-invites/preview`, `/api/v1/member-invites/register` (Registrierung per Einladungslink)
   - `/api/v1/events/*/chat/guest/**` (Gast-Chat via temporärem Gasttoken im Header)
   - `/v3/api-docs/**`, `/swagger-ui/**` (OpenAPI Dokumentation, nur mit `API_DOCS_ENABLED=true`, in Produktion aus)
2. **Admin-Endpunkte**:
   - `/actuator/**` erfordert Rolle `ROLE_ADMIN`.
3. **Stateless JWT-Konvertierung (`JwtAuthConverter`)**:
   - Extrahiert `sub` (Keycloak Subject UUID), `preferred_username`, `email`, `roles` und benutzerdefinierte Claims.
   - Synchronisiert den Benutzerstatus bei Bedarf transparent in die lokale Datenbank (`UserProvisioningService`).
   - Erstellt ein `UserPrincipal`-Objekt im `SecurityContextHolder`.
4. **Method Security**:
   - Controller-Methoden können über `@PreAuthorize("hasAuthority('purchase.tablet')")` oder `@PreAuthorize("hasRole('admin')")` abgesichert werden.

---

## 🚀 SSR Delivery & TransferState Injection

Um beim serverseitigen Rendern (SSR) im Express BFF eine nahtlose Authentifizierung ohne Layout-Springen zu gewährleisten:

1. **`delivery.middleware.ts`**: Ermittelt aus dem Session-Cookie die Rollen und Berechtigungen des aktuellen Benutzers.
2. **`transfer-state.ts`**: Injiziert das `AuthStateDto` sowie die Instanzkonfiguration (`CLUB_CONFIG_KEY`) in den HTML-Renderbaum.
3. **Client-Hydration**: Die Angular-App liest beim Start im Browser den State aus dem DOM aus, initialisiert die Signals im `AuthService` synchron und verhindert Ladeverzögerungen oder unberechtigte Redirects.

---

## 🧱 Härtung im Überblick

| Maßnahme | Wo |
| :--- | :--- |
| **Zwei-Faktor-Anmeldung (freiwillig)**: Im Profil führt „Zwei-Faktor-Anmeldung einrichten“ zur Keycloak-Kontoverwaltung (`/kc/realms/vereint/account`). Wer eine Authenticator-App hinterlegt, wird beim Login nach dem Code gefragt. | Keycloak, Profil |
| **Passwortregeln**: 10 bis 128 Zeichen, nicht Benutzername oder E-Mail, nicht eines der letzten drei; nach 5 Fehlversuchen wachsende Sperre. | Keycloak-Realm |
| **Cross-Site-Schutz**: Der BFF lehnt schreibende Anfragen ab, die nicht von der eigenen Seite kommen (`Sec-Fetch-Site` bzw. `Origin`). | webservice |
| **Rate-Limits**: Einladungs- und Gast-Token-Endpunkte 30 Versuche je IP in 15 Minuten, Login-Start 120 je IP in 5 Minuten, übrige API 600 Anfragen je Sitzung und Minute. | webservice |
| **Pfad-Prüfung**: Der API-Proxy reicht nur `/api/v1` weiter und verwirft Pfade mit `..` oder kodierten Schrägstrichen. | webservice |
| **Keine API-Beschreibung in Produktion**: Swagger/OpenAPI nur mit `API_DOCS_ENABLED=true`. | baseservice |
| **Metadaten entfernen**: EXIF/XMP (GPS, Gerät, Zeit) aus Bildern, Orts- und Geräteangaben aus Videos, bevor sie verschlüsselt gespeichert werden. | baseservice |
| **Container**: ohne Root, ohne Linux-Capabilities, schreibgeschütztes Dateisystem für baseservice und webservice, Prozess- und Speicherlimits. | `deploy/compose.yaml` |
| **Caddy**: HTTPS mit HSTS, Anfragen bis 8 MB (Moment-Medien bis 110 MB), `Permissions-Policy` erlaubt Kamera (Barcode-Scan, Fotos) und Standort (Moments) nur für die eigene Seite. | `deploy/Caddyfile` |

Details und die einmaligen Einstellungen in GitHub und Keycloak: [deploy/README.md](../../deploy/README.md#sicherheit).
