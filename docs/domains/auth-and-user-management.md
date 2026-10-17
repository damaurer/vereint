# Fachdomäne: Benutzerverwaltung & Authentifizierung

Die Benutzerverwaltung in **Vereint** verbindet das externe Identitätsmanagement (Keycloak OIDC) mit einer internen, gruppenbezogenen Profildatenbank in PostgreSQL. Sie regelt Konten, Profilpflege, Rollen- und Rechtevergabe je Gruppe sowie das Sperren von Mitgliedern.

---

## 🎯 Fachliche Sicht (Business Domain)

### Benutzer-Lebenszyklus & Onboarding
1. **Konto beim ersten Login**:
   - Meldet sich jemand erstmals über Keycloak an, legt der Fachservice anhand des OIDC-Subjekts (`keycloak_subject`) ein Konto in `users` an (*Just-in-Time Provisioning*, `UserProvisioningService`).
   - Ein neues Konto gehört zu keiner Gruppe und hat keine Rollen; Rollen aus dem Token werden nicht übernommen.
   - In eine Gruppe kommt man über einen [Einladungslink](member-invites.md) (neues oder bestehendes Konto), durch Eröffnen einer eigenen [Gruppe](stammtische.md) oder durch die Plattform-Administration. Per Einladung erhält man die Rolle `member`; wer eine Gruppe eröffnet, erhält dort `member` und `admin`.
   - In Produktion gibt es keine offene Registrierung und kein „Passwort vergessen“ auf der Keycloak-Seite.
2. **Profilpflege**:
   - Mitglieder ändern Anzeigenamen (`displayName`) und E-Mail-Adresse selbst (`PUT /api/v1/users/me`); das Profilbild läuft über die Bilder-API.
   - **Zwei-Faktor-Anmeldung (freiwillig)**: „Zwei-Faktor-Anmeldung einrichten“ im Profil öffnet die Keycloak-Kontoverwaltung (`/kc/realms/vereint/account/account-security/signing-in`). Wer dort eine Authenticator-App hinterlegt, wird beim Login nach dem Code gefragt. Pflicht ist sie für niemanden.
3. **Rollen & Vorstandsfunktion**:
   - Rollen gelten je Gruppe (`stammtisch_roles`); neben den Systemrollen `member`, `board`, `admin` und `tabletRecorder` kann jede Gruppe eigene Rollen anlegen. Keycloak-Realmrollen zählen nicht, außer `admin` für die Plattform-Administration. Siehe [Gruppen](stammtische.md#rollen-je-gruppe).
   - Wer `roles.manage` hat, weist im Bearbeiten-Formular eines Mitglieds alle Rollen der Gruppe zu, auch eigene Rollen.
   - Die Vorstandsfunktion (`chair`, `treasurer`, `secretary`, `assessor`) setzt man mit `members.manage`; sie steuert u. a., welche Bereiche des Audit-Logs sichtbar sind.
   - Eigene Rollen, Berechtigungen und den eigenen Status kann niemand selbst ändern. Die letzte Person mit `members.manage` oder `roles.manage` einer Gruppe bleibt geschützt.
4. **Sperren**:
   - Mit `members.manage` lässt sich ein Mitglied sperren. Das beendet die Mitgliedschaft in dieser Gruppe und entfernt seine Rollen dort; Buchungen und Verläufe bleiben erhalten. In anderen Gruppen bleibt die Person Mitglied.
   - Entsperren nimmt die Person wieder mit der Rolle `member` auf (zählt gegen die Mitgliedergrenze des Tarifs).
   - Gesperrte Mitglieder sehen die Gruppe nicht mehr und können dort weder buchen noch schreiben.
   - Daneben gibt es ein kontoweites Sperrkennzeichen (`users.disabled`, Antwort `403 account_disabled`); die App setzt es derzeit nicht.

---

## ⚙️ Technische Sicht (Architecture & Implementation)

### 1. Relevante Komponenten & Klassen
- **Controller**: `de.maurer.baseservice.controller.UserController`
  - `GET /api/v1/users/me`: eigenes Profil (`UserProfileDto`)
  - `PUT /api/v1/users/me`: eigenes Profil ändern (`UpdateProfileRequest`)
  - `GET /api/v1/users`: Mitgliederliste mit Paging und Filtern `search`, `role`, `disabled` (`PagedResponse<UserSummaryDto>`, `members.read`)
  - `GET /api/v1/users/directory`: aktive Mitglieder für Auswahllisten, ohne E-Mail (alle Mitglieder)
  - `GET /api/v1/users/{id}`: Profil eines Mitglieds (`members.manage`)
  - `PUT /api/v1/users/{id}`: Mitglied bearbeiten (`AdminUpdateUserRequest`, `members.manage`; Rollen darin mit `roles.manage`; Name und E-Mail nur Plattform-Administration)
  - `PUT /api/v1/users/{id}/roles`: Rollen zuweisen (`AssignRolesRequest`, `roles.manage`)
  - `PUT /api/v1/users/{id}/permissions`: einzelne Berechtigungen zuweisen (`AssignPermissionsRequest`, `roles.manage`)
  - `PUT /api/v1/users/{id}/status`: sperren oder entsperren (`UpdateUserStatusRequest`, `members.manage`)
- **Services**:
  - `UserService`: Profile, Rollen, Vorstandsfunktion und Status.
  - `UserProvisioningService`: legt das Konto beim ersten Aufruf in eigener Transaktion an.
  - `MembershipService`: Mitgliedschaft in der gewählten Gruppe aufnehmen oder beenden.
  - `StammtischManagers`: schützt die letzte Person mit `members.manage` oder `roles.manage`.
  - `StammtischAccess`: prüft Permissions der gewählten Gruppe.
- **Entitäten**: `UserEntity`, `UserRoleEntity`, `UserPermissionEntity` (in `UserEntities.kt`), `StammtischMemberEntity`, `StammtischRoleEntity`.

---

## 📋 Datenstrukturen & DTOs

```kotlin
data class UserProfileDto(
    val id: String,
    val keycloakSubject: String,
    val displayName: String,
    val email: String?,
    val disabled: Boolean,        // Konto gesperrt oder keine aktive Mitgliedschaft
    val drinkRecorder: Boolean,   // hat die Rolle tabletRecorder
    val boardRole: String?,
    val roles: Set<String>,       // Rollen in der gewählten Gruppe
    val permissions: Set<String>,
    val createdAt: Instant,
    val updatedAt: Instant
)

data class UpdateProfileRequest(
    @field:Size(min = 1, max = 255) val displayName: String? = null,
    @field:Email @field:Size(max = 255) val email: String? = null
)

data class AdminUpdateUserRequest(
    val displayName: String? = null,
    val email: String? = null,
    val disabled: Boolean? = null,
    val drinkRecorder: Boolean? = null,
    val boardRole: String? = null,      // chair, treasurer, secretary, assessor
    val roles: Set<String>? = null,     // höchstens 32
    val permissions: Set<String>? = null // höchstens 64
)

data class AssignRolesRequest(val roles: Set<String> = emptySet())
data class AssignPermissionsRequest(val permissions: Set<String> = emptySet())
data class UpdateUserStatusRequest(val disabled: Boolean)
```

---

## 🔄 Sequenzablauf: Just-in-Time Provisionierung

```mermaid
sequenceDiagram
    autonumber
    actor User as Person
    participant BFF as Express BFF
    participant Spring as Spring Boot Backend
    participant DB as PostgreSQL (users)

    User->>BFF: OIDC Login abgeschlossen
    BFF->>Spring: GET /api/v1/users/me (Bearer JWT)
    Spring->>DB: SELECT * FROM users WHERE keycloak_subject = :sub
    alt Konto existiert noch nicht
        Spring->>DB: INSERT INTO users (id, keycloak_subject, display_name, email)
        Note over Spring,DB: keine Gruppe, keine Rollen
    end
    DB-->>Spring: UserEntity
    Spring-->>BFF: 200 OK (UserProfileDto)
    BFF-->>User: Ohne Gruppe: Auswahl /gruppen bzw. Einladung oder Gruppe eröffnen
```
