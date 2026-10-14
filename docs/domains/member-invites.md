# Fachdomäne: Mitglieder per Einladungslink

Vorstand und Administration laden neue Personen mit einem Link ein. Die Person
öffnet den Link, legt Vorname, Nachname, E-Mail und Passwort fest und ist danach
normales Mitglied (Rolle `member`). Eine offene Selbstregistrierung gibt es nicht.

## Ablauf

1. **Link erstellen** – Vorstand (Seite *Vorstand* → *Mitglied einladen*) oder
   Administration (*Administration* → *+ Mitglied einladen*). Wählbar sind eine
   Bezeichnung zum Wiedererkennen (z. B. der Name), die Gültigkeit (1, 7 oder 30
   Tage, Standard 7) und wie viele Personen den Link nutzen dürfen (1–50,
   Standard 1).
2. **Link verschicken** – Der Dialog zeigt den Link genau einmal und bietet
   *Link kopieren* bzw. *Teilen*. Gespeichert wird nur der SHA-256-Hash, der Link
   lässt sich später also nicht erneut anzeigen; bei Verlust einfach einen neuen
   erstellen und den alten zurückziehen.
3. **Registrieren** – `https://<domain>/register#<token>`. Die Seite prüft den
   Link, nimmt die Daten entgegen und legt das Konto an.
4. **Anmelden** – Danach meldet sich die Person ganz normal mit E-Mail und
   Passwort an.

In der Liste im Dialog stehen alle Links mit Status (*Offen*, *Verwendet*,
*Abgelaufen*, *Zurückgezogen*) und den Namen der Personen, die sich damit
registriert haben. Offene Links lassen sich zurückziehen.

## Sicherheit

- Token: 32 Byte aus `SecureRandom` (base64url). In der Datenbank liegt nur der
  Hash (`member_invites.token_hash`).
- Das Token steht im **URL-Fragment** (`#…`). Browser schicken Fragmente nie an
  den Server, das Token landet also weder in Caddy-Zugriffslogs noch im
  `Referer`. Die Seite entfernt es nach dem Lesen aus der Adresszeile und
  schickt es nur im Request-Body.
- Registrierung ist nur mit gültigem, nicht widerrufenem, nicht abgelaufenem und
  nicht aufgebrauchtem Link möglich. Die Einladung wird dabei per
  `SELECT … FOR UPDATE` gesperrt; `ck_member_invites_uses` erzwingt zusätzlich
  `uses_count <= max_uses`.
- Das neue Konto erhält **ausschließlich** `member`: Der Request kennt kein
  Rollenfeld, der Fachservice legt Profil und Rolle selbst an, und Keycloak
  vergibt nur die Standardrollen des Realms (`default-roles-vereint`).
  Weitere Rollen vergibt die Administration wie bisher.
- Das Konto entsteht über die Keycloak-Admin-API mit dem vertraulichen Client
  `vereint-registration`. Dessen Service-Account hat nur
  `realm-management/manage-users`; das Secret
  (`KEYCLOAK_REGISTRATION_CLIENT_SECRET`) kennt nur der Fachservice. Der Aufruf
  geht im Container-Netz direkt an `http://keycloak:8080/kc`, weil Caddy
  `/kc/admin` von außen sperrt.
- Schlägt nach dem Anlegen in Keycloak etwas fehl (z. B. Datenbank), löscht der
  Fachservice das Keycloak-Konto wieder; der Link bleibt unverbraucht.
- Passwort: 10 bis 128 Zeichen. Es wird nie gespeichert oder geloggt
  (`toString()` der DTOs blendet es aus) und geht nur an Keycloak.
- Jede Registrierung landet im Audit-Protokoll (`USER_REGISTERED_BY_INVITE`,
  Akteur = Ersteller des Links).

## API

| Methode | Pfad | Zugriff |
| :--- | :--- | :--- |
| `POST` | `/api/v1/member-invites` | Vorstand, Admin |
| `GET` | `/api/v1/member-invites` | Vorstand, Admin |
| `DELETE` | `/api/v1/member-invites/{id}` | Vorstand, Admin |
| `POST` | `/api/v1/member-invites/preview` | öffentlich, Token im Body |
| `POST` | `/api/v1/member-invites/register` | öffentlich, Token im Body |

Fehlercodes: `not_found` (unbekannter Link), `invitation_expired`,
`invitation_revoked`, `invitation_used_up`, `email_already_registered`,
`password_rejected`, `registration_unavailable` (503, Keycloak nicht erreichbar
oder Registrierung nicht konfiguriert).

## Konfiguration

| Variable | Bedeutung |
| :--- | :--- |
| `REGISTRATION_ENABLED` | `true` schaltet die Kontoanlage ein |
| `KEYCLOAK_ADMIN_BASE_URL` | interne Keycloak-URL, Produktion `http://keycloak:8080/kc`, lokal `http://localhost:8082` |
| `KEYCLOAK_REGISTRATION_CLIENT_SECRET` | Secret des Clients `vereint-registration`; Terraform erzeugt es im SSM Parameter Store |
