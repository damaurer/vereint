# Gruppen (mehrere Stammtische)

In der App heißen sie **Gruppen**; im Code, in API-Pfaden und Tabellen heißen
sie weiterhin `stammtisch`. Eine Vereint-Installation trägt beliebig viele
Gruppen, ähnlich wie Server bei Discord. Eine Person hat ein Konto (Keycloak) und kann Mitglied in mehreren
Stammtischen sein. Alles Fachliche gehört genau einem Stammtisch: Events, Chat,
Direktnachrichten, Guthaben und Buchungen, Katalog und Sublisten, Moments,
Benachrichtigungen, Einladungen, Kiosk-Geräte, Audit-Log und Statistik.

Übergreifend sind nur:

- das Konto selbst (Name, E-Mail, Sprache, Push-Abos),
- die Liste der Stammtische und die Mitgliedschaften,
- die gemeinsame **Getränkedatenbank** (Stammdaten ohne Preise).

## Trennung

Die Trennung ist doppelt abgesichert, damit ein einzelner Programmierfehler
keine Daten eines anderen Stammtischs zeigt.

1. **In der Anwendung (Hibernate `@TenantId`).** Jede fachliche Entität erbt von
   `StammtischScoped`. Hibernate hängt an jede Abfrage `stammtisch_id = ?` an und
   setzt die Spalte beim Speichern selbst. Der Wert kommt aus dem
   `TenantContext` der Anfrage.
2. **In der Datenbank (PostgreSQL Row-Level-Security).** Alle 33 fachlichen
   Tabellen haben die Policy `stammtisch_isolation` mit `FORCE ROW LEVEL SECURITY`.
   `TenantAwareDataSource` setzt bei jeder Verbindung `vereint.stammtisch_id`;
   Zeilen eines anderen Stammtischs sind damit weder lesbar noch schreibbar,
   auch nicht über native SQL-Abfragen.

Ausnahmen laufen bewusst im System-Kontext (`vereint.rls_bypass`): die Auswahl
des Stammtischs vor einer Anfrage, Hintergrundjobs je Stammtisch
(`StammtischJobs.forEachStammtisch`) und das Auflösen von Gast- und
Einladungslinks, die erst den Stammtisch ihres Events finden müssen.

Die Tests `StammtischSeparationIntegrationTest` (H2) und
`RowLevelSecurityIntegrationTest` (echtes PostgreSQL mit Testcontainers) prüfen
die Trennung.

## Welcher Stammtisch gilt?

- Die App merkt sich den gewählten Stammtisch im HttpOnly-Cookie
  `vereint.stammtisch`. Der BFF reicht ihn als Header `X-Stammtisch-Id` an den
  Fachservice weiter; einen vom Browser gesendeten Header verwirft er.
- `StammtischContextFilter` prüft bei jeder Anfrage die Mitgliedschaft
  (`403 stammtisch_access_denied` sonst). Wer nur in einem Stammtisch ist,
  braucht keine Auswahl. Wer in mehreren ist und nichts gewählt hat, erhält
  `409 stammtisch_required`; die App zeigt dann die Auswahlseite `/gruppen`.
- Es gibt zwei Arten von Admin: den **Stammtisch-Admin** (Rolle `admin` in
  einem Stammtisch: Mitglieder, Rollen, Tarif) und den **Applikations-Admin**
  des Vereint-Teams (Plattform-Admin, siehe unten).
- Rollen und Rechte der Anfrage stammen ausschließlich aus dem gewählten
  Stammtisch. Realmrollen aus Keycloak zählen nicht mehr, mit einer Ausnahme:
  die Realmrolle `admin` macht eine Person zum **Plattform-Admin**.

## Rollen je Stammtisch

Jeder Stammtisch hat eigene Rollen (`stammtisch_roles`). Beim Anlegen erhält er
vier Systemrollen mit den bisherigen Rechten: Mitglied (`member`), Vorstand
(`board`), Admin (`admin`) und Theke (`tabletRecorder`). Wer `roles.manage` hat,
kann unter **Stammtisch** eigene Rollen anlegen, Rechte zuschneiden und Rollen
zuweisen. Systemrollen lassen sich anpassen, aber nicht löschen.

Neue Rechte für die Verwaltung je Stammtisch:

| Recht | Wofür |
| :--- | :--- |
| `members.read` | Mitgliederliste und Rollen sehen |
| `members.invite` | Einladungslinks erstellen |
| `members.manage` | Mitglieder deaktivieren, Vorstandsamt setzen |
| `roles.manage` | Rollen anlegen, ändern, zuweisen |
| `stammtisch.manage` | Stammtisch umbenennen, Daten exportieren |
| `billing.manage` | Tarif buchen, Zahlung und Rechnungen (siehe `abrechnung.md`) |
| `moments.manage` | Moment-Typen und Reaktionen verwalten |
| `kiosk.manage` | Kiosk-Geräte entsperren |
| `notifications.broadcast` | Rundschreiben senden |
| `chat.moderate` | Chatnachrichten anderer entfernen |
| `audit.read.all` | Audit-Log aller Mitglieder |

Schutz vor Aussperren: Die letzte Person, die Mitglieder **und** Rollen
verwalten darf, kann diese Rechte nicht verlieren und den Stammtisch nicht
verlassen (`last_role_manager_protected`).

Die App blendet Bereiche nach den freigegebenen App-Kontexten des gewählten
Stammtischs ein (`allowedAppContexts`), nicht nach Rollennamen. Eine eigene
Rolle „Kasse" mit `ledger.read` sieht so die Kasse, aber nicht den Adminbereich.

## Beitreten, verlassen, anlegen

- **Beitreten:** nur per Einladungslink eines Stammtischs. Neue Konten
  registrieren sich darüber; wer schon ein Konto hat, öffnet den Link angemeldet
  und tritt mit einem Klick bei (`POST /api/v1/member-invites/join`). Eine
  offene Registrierung ohne Einladung gibt es weiterhin nicht.
- **Name und Bild:** Wer `stammtisch.manage` hat (beim Eröffnen die
  eröffnende Person), benennt die Gruppe und lädt unter **Gruppe** ein Bild hoch
  (`PUT /api/v1/stammtisch/image`, PNG/JPEG/GIF bis 5 MB). Es liegt
  verschlüsselt und ohne Metadaten im Objektspeicher; sehen können es nur
  Mitglieder der Gruppe (`GET /api/v1/stammtische/{id}/image`).
- **Verlassen:** unter **Gruppe → Gruppe verlassen**. Buchungen und
  Beiträge bleiben im Stammtisch erhalten.
- **Erster Start:** Der erste Plattform-Admin ohne Mitgliedschaft wird
  automatisch Admin von „Mein Stammtisch", solange dort noch nie jemand Mitglied
  war (`PlatformService.claimUnclaimedStammtisch`).
- **Eröffnen (Kunden):** Wer einen Stammtisch gründen will, registriert sich
  unter `/gruppe-eroeffnen` mit Stammtischname, Name, E-Mail und Passwort
  (`POST /api/v1/signup`, öffentlich, je IP begrenzt). Das Konto entsteht in
  Keycloak, die Person wird Stammtisch-Admin, der Stammtisch startet im
  kostenlosen Tarif. Danach bucht sie unter **Gruppe → Tarif** und lädt
  Mitglieder per Einladungslink ein. Angemeldete Personen eröffnen weitere
  Gruppen unter `/gruppen` (`POST /api/v1/stammtische`), höchstens drei
  eigene aktive (`SIGNUP_MAX_OWNED`, Fehler `stammtisch_limit`).
  `SIGNUP_ENABLED=false` schaltet das Eröffnen ab.
- **Anlegen (Vereint-Team):** Plattform-Admins legen unter `/plattform`
  Stammtische an. Optional wird ein bestehendes Konto per E-Mail Admin des
  neuen Stammtischs, sonst die anlegende Person. Stammtische werden archiviert,
  nicht gelöscht.

## Gemeinsame Getränkedatenbank

`drink_library` und `drink_library_barcodes` gehören keinem Stammtisch. Sie
enthalten Name, Beschreibung, Kategorie und Barcodes, aber **keine Preise und
keine Bilder**.

- Unter **Katalog → Aus der Getränkedatenbank** sucht man nach Name oder
  Barcode und übernimmt ein Getränk in den eigenen Katalog; Preis und
  Einkaufspreis setzt jeder Stammtisch selbst. Der Katalogeintrag merkt sich die
  Herkunft (`drink_catalog.library_drink_id`).
- Wer `catalog.approve` hat, kann ein freigegebenes eigenes Getränk in die
  Datenbank teilen. Gibt es den Barcode dort schon, wird verknüpft statt
  doppelt angelegt.
- Ändern und Löschen von Einträgen ist Plattform-Admins vorbehalten.

## Bestehende Daten

Migration `013-stammtische.xml` legt den Stammtisch „Mein Stammtisch"
(`00000000-0000-0000-0000-000000000001`) an. Alle vorhandenen Daten, Konten,
Rollen und Vorstandsämter gehören danach zu ihm; Theke-Konten erhalten die Rolle
`tabletRecorder`. Der Name lässt sich danach unter **Stammtisch** ändern.
`014-drink-library.xml` legt die Getränkedatenbank an.

## Betrieb

- Row-Level-Security greift nur für Datenbankbenutzer ohne Superuser- und ohne
  `BYPASSRLS`-Recht. In Produktion ist das der Benutzer `vereint`
  (`deploy/postgres/init-databases.sh`), dem die Tabellen gehören; `FORCE` sorgt
  dafür, dass die Policy auch für den Eigentümer gilt. Lokal mit
  `docker compose` verbindet sich der Dienst als Superuser, dort ist RLS wirksam
  ausgeschaltet; die Trennung in der Anwendung bleibt.
- Backups laufen als `postgres` (Superuser) und enthalten alle Stammtische.
- `TENANCY_BOOTSTRAP_REALM_ROLES=true` (nur lokal und in den E2E-Tests): Konten
  ohne Mitgliedschaft treten beim ersten Aufruf „Mein Stammtisch" bei, mit den
  Systemrollen aus ihren Keycloak-Realmrollen. In Produktion bleibt es aus.
- `vereint.tenancy.row-level-security` schaltet das Setzen der Datenbank-Variablen
  ab (nur für H2-Tests).

## Noch offen

- **Push-Benachrichtigungen** kommen ohne Inhalt an; der Service Worker holt den
  Text über die API im gerade gewählten Stammtisch. Kommt die Mitteilung aus
  einem anderen Stammtisch, zeigt das Gerät die neueste ungelesene Mitteilung
  des gewählten Stammtischs oder den allgemeinen Hinweis „Du hast eine neue
  Mitteilung". Die Mitteilung selbst liegt korrekt im anderen Stammtisch.
- Der Rollen-Cache im Fachservice ist pro Instanz; bei mehreren Instanzen
  greifen Rollenänderungen dort erst nach Ablauf (heute läuft eine Instanz).
