# Fachdomäne: Benutzerverwaltung & Authentifizierung

Die Benutzerverwaltung in **Vereint** verbindet das externe Identitätsmanagement (Keycloak OIDC) mit einer internen, vereinsbezogenen Profildatenbank in PostgreSQL. Sie regelt Mitglieder-Onboarding, Stammdatenpflege, Rollen- und Rechtevergabe sowie das administrative Sperren (*Disabling*) von Accounts.

---

## 🎯 Fachliche Sicht (Business Domain)

### Benutzer-Lebenszyklus & Onboarding
1. **Erstregistrierung / OIDC-Provisionierung**:
   - Wenn sich ein Benutzer erstmals über Keycloak anmeldet, wird anhand des OIDC-Subjekts (`keycloak_subject`) automatisch ein Vereinsbenutzerdatensatz angelegt (*Just-in-Time Provisioning*).
   - Standardmäßig erhält jedes neue Mitglied die Rolle `member` und wird als aktiv (`disabled = false`) geführt.
2. **Profilpflege**:
   - Mitglieder können ihren Anzeigenamen (`displayName`), ihre E-Mail-Adresse und Profilbild-Referenzen selbst verwalten.
3. **Rollen- & Funktionszuweisung (Vorstand/Admin)**:
   - Administratoren können Mitgliedern zusätzliche Rollen (`board`, `admin`, `tabletRecorder`) sowie Vorstandsfunktionen (`chair`, `treasurer`, `secretary`, `assessor`) zuweisen.
4. **Sperrung (Account Disablement)**:
   - Bei Austritt oder Beitragsrückstand kann ein Administrator einen Benutzer sperren (`disabled = true`).
   - Gesperrte Benutzer können keine Kassenbuchungen, Barcodekäufe oder Chat-Nachrichten mehr tätigen.

---

## ⚙️ Technische Sicht (Architecture & Implementation)

### 1. Relevante Komponenten & Klassen
- **Controller**: `de.maurer.baseservice.controller.UserController`
  - `GET /api/v1/users/me` – Eigenes Profil laden
  - `PATCH /api/v1/users/me` – Eigenes Profil aktualisieren (`UpdateProfileRequest`)
  - `GET /api/v1/users` – Mitgliederliste paginiert abrufen (`PagedResponse<UserSummaryDto>`, optional Filter `search`, `role`, `disabled`)
  - `GET /api/v1/users/{id}` – Details eines Mitglieds abrufen
  - `PATCH /api/v1/users/{id}` – Stammdaten durch Admin bearbeiten (`AdminUpdateUserRequest`)
  - `PUT /api/v1/users/{id}/roles` – Rollenzuweisung (`AssignRolesRequest`)
  - `PUT /api/v1/users/{id}/permissions` – Direkte Berechtigungszuweisung (`AssignPermissionsRequest`)
  - `PUT /api/v1/users/{id}/status` – Benutzer aktivieren/deaktivieren (`UpdateUserStatusRequest`)
- **Services**:
  - `UserService`: Geschäftslogik für Benutzerprofile, Rollenänderungen und Statusverwaltung.
  - `UserProvisioningService`: Synchronisation zwischen Keycloak JWT Claims und PostgreSQL `users`-Tabelle.
  - `UserPermissionCache`: Effizientes Caching der abgeleiteten Berechtigungen im Arbeitsspeicher.
- **Entitäten**: `UserEntity`, `UserRoleEntity`, `UserPermissionEntity` (in `UserEntities.kt`).

---

## 📋 Datenstrukturen & DTOs

```kotlin
data class UserProfileDto(
    val id: String,
    val keycloakSubject: String,
    val email: String?,
    val displayName: String,
    val disabled: Boolean,
    val drinkRecorder: Boolean,
    val boardRole: String?,
    val roles: Set<String>,
    val permissions: Set<String>,
    val createdAt: Instant,
    val updatedAt: Instant
)

data class UpdateProfileRequest(
    @field:Size(min = 2, max = 255)
    val displayName: String? = null,
    @field:Email
    val email: String? = null
)

data class AssignRolesRequest(
    @field:NotNull
    @field:AllowedValues(values = ["member", "board", "admin", "tabletRecorder"])
    val roles: Set<String>
)

data class UpdateUserStatusRequest(
    @field:NotNull
    val disabled: Boolean
)
```

---

## 🔄 Sequenzablauf: Just-in-Time Provisionierung

```mermaid
sequenceDiagram
    autonumber
    actor User as Vereinsmitglied
    participant BFF as Express BFF
    participant KC as Keycloak 26
    participant Spring as Spring Boot Backend
    participant DB as PostgreSQL (users)

    User->>BFF: OIDC Login abgeschlossen
    BFF->>Spring: GET /api/v1/users/me (Bearer JWT)
    Spring->>Spring: JwtAuthConverter extrahiert Claims (sub, email, preferred_username)
    Spring->>DB: SELECT * FROM users WHERE keycloak_subject = :sub
    alt Benutzer existiert noch nicht
        Spring->>DB: INSERT INTO users (id, keycloak_subject, display_name, email, disabled)
        Spring->>DB: INSERT INTO user_roles (user_id, 'member')
    end
    DB-->>Spring: UserEntity
    Spring-->>BFF: 200 OK (UserProfileDto)
    BFF-->>User: 200 OK (Dashboard & Profil)
```
