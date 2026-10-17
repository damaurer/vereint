# Fachdomäne: Mitglieder per Einladungslink

Wer `members.invite` hat (Startwerte: Vorstand und Admin), lädt Personen mit
einem Link in die Gruppe ein. Neue Personen legen über den Link Vorname,
Nachname, E-Mail und Passwort fest; wer schon ein Vereint-Konto hat, tritt mit
diesem Konto bei. Danach ist die Person normales Mitglied der Gruppe (Rolle
`member`). Eine offene Selbstregistrierung gibt es nicht.

## Ablauf

1. **Link erstellen**: auf der Seite *Vorstand* oder in der *Administration*
   über *Mitglied einladen*. Wählbar sind eine Bezeichnung zum Wiedererkennen
   (z. B. der Name), die Gültigkeit (1, 7 oder 30 Tage, Standard 7) und wie
   viele Personen den Link nutzen dürfen (1 bis 50, Standard 1).
2. **Link verschicken**: Der Dialog zeigt den Link genau einmal und bietet
   *Link kopieren* bzw. *Teilen*. Gespeichert wird nur der SHA-256-Hash, der Link
   lässt sich später also nicht erneut anzeigen; bei Verlust einfach einen neuen
   erstellen und den alten zurückziehen.
3. **Öffnen**: `https://<domain>/register#<token>`. Die Seite prüft den Link
   und zeigt den Namen der Gruppe.
   - **Neues Konto**: Formular mit Vorname, Nachname, E-Mail, Passwort und
     Zustimmung zu den AGB; der Fachservice legt das Konto an. Danach meldet sich
     die Person ganz normal mit E-Mail und Passwort an.
   - **Bestehendes Konto**: Ist die Person angemeldet, zeigt die Seite statt des
     Formulars *Gruppe beitreten*; ein Klick nimmt sie mit ihrem Konto auf. Wer
     schon Mitglied ist, verbraucht den Link nicht. Wer nicht angemeldet ist,
     meldet sich zuerst an und öffnet den Link danach erneut.
4. Die Mitgliedergrenze des Tarifs gilt auch hier (`409 plan_limit_members`).

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
- Registrierung und Beitritt sind nur mit gültigem, nicht widerrufenem, nicht
  abgelaufenem und nicht aufgebrauchtem Link möglich. Die Einladung wird dabei per
  `SELECT … FOR UPDATE` gesperrt; `ck_member_invites_uses` erzwingt zusätzlich
  `uses_count <= max_uses`.
- Wer per Link kommt, erhält **ausschließlich** `member`: Der Request kennt kein
  Rollenfeld, der Fachservice legt Mitgliedschaft und Rolle selbst an, und
  Keycloak vergibt nur die Standardrollen des Realms (`default-roles-vereint`).
  Weitere Rollen weist zu, wer `roles.manage` hat (Bearbeiten-Formular des
  Mitglieds in der Administration).
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
- Die Zustimmung zu den AGB wird mit Fassung und Zeitpunkt am Konto gespeichert
  (`users.terms_version`, `users.terms_accepted_at`); ohne sie antwortet der
  Fachservice mit `400 terms_not_accepted`.
- Jede Registrierung und jeder Beitritt landet im Audit-Protokoll
  (`USER_REGISTERED_BY_INVITE` bzw. `MEMBER_JOINED_BY_INVITE`, Akteur = Ersteller
  des Links).

## API

| Methode | Pfad | Zugriff |
| :--- | :--- | :--- |
| `POST` | `/api/v1/member-invites` | `members.invite` |
| `GET` | `/api/v1/member-invites` | `members.invite` |
| `DELETE` | `/api/v1/member-invites/{id}` | `members.invite` |
| `POST` | `/api/v1/member-invites/preview` | öffentlich, Token im Body |
| `POST` | `/api/v1/member-invites/register` | öffentlich, Token im Body |
| `POST` | `/api/v1/member-invites/join` | angemeldet, Token im Body |

Fehlercodes: `not_found` (unbekannter Link), `invitation_expired`,
`invitation_revoked`, `invitation_used_up`, `email_already_registered`,
`password_rejected`, `terms_not_accepted`, `plan_limit_members`,
`registration_unavailable` (503, Keycloak nicht erreichbar oder Registrierung
nicht konfiguriert).

## Konfiguration

| Variable | Bedeutung |
| :--- | :--- |
| `REGISTRATION_ENABLED` | `true` schaltet die Kontoanlage ein |
| `KEYCLOAK_ADMIN_BASE_URL` | interne Keycloak-URL, Produktion `http://keycloak:8080/kc`, lokal `http://localhost:8082` |
| `KEYCLOAK_REGISTRATION_CLIENT_SECRET` | Secret des Clients `vereint-registration`; Terraform erzeugt es im SSM Parameter Store |
