# Gruppen (mehrere Stammtische)

In der App heißen sie **Gruppen**; im Code, in API-Pfaden und Tabellen heißen
sie weiterhin `stammtisch`. Eine Gruppe kann ein Stammtisch, ein Verein, ein
Team oder jede andere Gemeinschaft sein, deshalb bleiben die Texte der App
neutral („Gruppe“, „Treffen“). „Vereint“ ist nur der Produktname. Eine
Vereint-Installation trägt beliebig viele Gruppen, ähnlich wie Server bei
Discord. Eine Person hat ein Konto (Keycloak) und kann Mitglied in mehreren
Gruppen sein. Alles Fachliche gehört genau einer Gruppe: Events, Chat,
Guthaben und Buchungen, Katalog und Sublisten, Moments, Mitteilungen,
Einladungen, Kiosk-Geräte, Audit-Log und Statistik.

Übergreifend sind nur:

- das Konto selbst (Name, E-Mail, AGB-Zustimmung, Push-Abos),
- die Liste der Gruppen und die Mitgliedschaften,
- die gemeinsame **Getränkedatenbank** (Stammdaten ohne Preise),
- die **Freundesliste** und die **Direktnachrichten** (je Personenpaar ein
  Gespräch, gehören den beiden Konten),
- der **persönliche Kalender**. Er speichert nichts selbst, sondern liest Events
  und Moments je eigener Gruppe im Kontext dieser Gruppe (siehe
  [Kalender, Freunde und Direktnachrichten](kalender-freunde-direktnachrichten.md)).

## Trennung

Die Trennung ist doppelt abgesichert, damit ein einzelner Programmierfehler
keine Daten einer anderen Gruppe zeigt.

1. **In der Anwendung (Hibernate `@TenantId`).** Jede fachliche Entität erbt von
   `StammtischScoped`. Hibernate hängt an jede Abfrage `stammtisch_id = ?` an und
   setzt die Spalte beim Speichern selbst. Der Wert kommt aus dem
   `TenantContext` der Anfrage.
2. **In der Datenbank (PostgreSQL Row-Level-Security).** Die 33 fachlichen
   Tabellen aus Migration `013` haben die Policy `stammtisch_isolation` mit
   `FORCE ROW LEVEL SECURITY`. `TenantAwareDataSource` setzt bei jeder
   Verbindung `vereint.stammtisch_id`; Zeilen einer anderen Gruppe sind damit
   weder lesbar noch schreibbar, auch nicht über native SQL-Abfragen.

Ausnahmen laufen bewusst im System-Kontext (`vereint.rls_bypass`): die Auswahl
der Gruppe vor einer Anfrage, Hintergrundjobs je Gruppe
(`StammtischJobs.forEachStammtisch`), Tarif und Stripe sowie das Auflösen von
Gast- und Einladungslinks, die erst die Gruppe ihres Events oder Links finden
müssen.

Die Tests `StammtischSeparationIntegrationTest` (H2) und
`RowLevelSecurityIntegrationTest` (echtes PostgreSQL mit Testcontainers) prüfen
die Trennung.

## Welche Gruppe gilt?

- Die App merkt sich die gewählte Gruppe im HttpOnly-Cookie
  `vereint.stammtisch`. Der BFF reicht sie als Header `X-Stammtisch-Id` an den
  Fachservice weiter; einen vom Browser gesendeten Header verwirft er.
- `StammtischContextFilter` prüft bei jeder Anfrage die Mitgliedschaft
  (`403 stammtisch_access_denied` sonst). Wer nur in einer Gruppe ist,
  braucht keine Auswahl. Wer in mehreren ist und nichts gewählt hat, erhält
  `409 stammtisch_required`; die App zeigt dann die Auswahlseite `/gruppen`.
  In der Kopfzeile wechselt man die Gruppe jederzeit.
- Es gibt zwei Arten von Admin: den **Gruppen-Admin** (Rolle `admin` in
  einer Gruppe: Mitglieder, Rollen, Tarif) und die **Plattform-Administration**
  des Vereint-Teams (siehe unten).
- Rollen und Rechte der Anfrage stammen ausschließlich aus der gewählten
  Gruppe. Realmrollen aus Keycloak zählen nicht, mit einer Ausnahme:
  die Realmrolle `admin` macht eine Person zur **Plattform-Administration**
  (alle Gruppen unter `/plattform`, Pflege der Getränkedatenbank).

## Rollen je Gruppe

Jede Gruppe hat eigene Rollen (`stammtisch_roles`). Beim Anlegen erhält sie
vier Systemrollen mit Startwerten aus `RolePermissionMatrix`: Mitglied
(`member`), Vorstand (`board`), Admin (`admin`) und Theke (`tabletRecorder`).
Wer `roles.manage` hat, legt unter **Gruppe → Rollen** eigene Rollen an und
schneidet Rechte zu. Zugewiesen werden System- und eigene Rollen in der
**Administration** im Bearbeiten-Formular des jeweiligen Mitglieds
(`PUT /api/v1/users/{id}/roles`; der Fachservice prüft, dass es die Rolle in der
Gruppe gibt). Systemrollen lassen sich anpassen, aber nicht löschen.

Rechte für die Verwaltung je Gruppe:

| Recht | Wofür |
| :--- | :--- |
| `members.read` | Mitgliederliste und Rollen sehen |
| `members.invite` | Einladungslinks erstellen und widerrufen |
| `members.manage` | Mitglieder bearbeiten und sperren, Vorstandsamt setzen |
| `roles.manage` | Rollen anlegen, ändern, zuweisen |
| `stammtisch.manage` | Gruppe umbenennen, Bild setzen, Daten exportieren |
| `billing.manage` | Tarif buchen, Zahlung und Rechnungen (siehe [Tarife & Abrechnung](abrechnung.md)) |
| `moments.manage` | Moment-Typen und Reaktionen verwalten |
| `kiosk.manage` | Kiosk-Geräte sehen und aus der Ferne entsperren |
| `notifications.broadcast` | Mitteilungen an Mitglieder senden |
| `chat.moderate` | Infotafel im Gruppenchat setzen, alle Event-Chats öffnen |
| `audit.read.all` | Audit-Log aller Bereiche |

Schutz vor Aussperren: Die letzte Person, die Mitglieder **oder** Rollen
verwalten darf (`members.manage`, `roles.manage`), kann diese Rechte nicht
verlieren, nicht gesperrt werden und die Gruppe nicht verlassen
(`last_role_manager_protected`).

Die App blendet Bereiche nach den freigegebenen App-Kontexten der gewählten
Gruppe ein (`allowedAppContexts`), nicht nach Rollennamen. Eine eigene
Rolle „Kasse“ mit `ledger.read` sieht so die Kasse, aber nicht den Adminbereich.

## Beitreten, verlassen, anlegen

- **Beitreten:** nur per Einladungslink einer Gruppe. Neue Konten
  registrieren sich darüber; wer schon ein Konto hat, öffnet den Link angemeldet
  und tritt mit einem Klick bei (`POST /api/v1/member-invites/join`). Eine
  offene Registrierung ohne Einladung gibt es nicht. Details:
  [Einladungslinks](member-invites.md).
- **Name und Bild:** Wer `stammtisch.manage` hat (beim Eröffnen die
  eröffnende Person), benennt die Gruppe und lädt unter **Gruppe** ein Bild hoch
  (`PUT /api/v1/stammtisch/image`, PNG/JPEG/GIF bis 5 MB). Es liegt
  verschlüsselt und ohne Metadaten im Objektspeicher; sehen können es nur
  Mitglieder der Gruppe (`GET /api/v1/stammtische/{id}/image`).
- **Verlassen:** unter **Gruppe → Gruppe verlassen**. Buchungen und
  Beiträge bleiben in der Gruppe erhalten.
- **Erster Start:** Die erste Plattform-Administration ohne Mitgliedschaft wird
  automatisch Admin von „Meine Gruppe“, solange dort noch nie jemand Mitglied
  war (`PlatformService.claimUnclaimedStammtisch`).
- **Eröffnen (Kunden):** Wer eine Gruppe gründen will, registriert sich
  unter `/gruppe-eroeffnen` mit Gruppenname, Vor- und Nachname, E-Mail,
  Passwort und Zustimmung zu den AGB (`POST /api/v1/signup`, öffentlich, je IP
  begrenzt). Das Konto entsteht in Keycloak, die Person wird Admin der Gruppe,
  die Gruppe startet im kostenlosen Tarif. Danach bucht sie unter
  **Gruppe → Tarif** und lädt Mitglieder per Einladungslink ein. Angemeldete
  Personen eröffnen weitere Gruppen unter `/gruppen` (`POST /api/v1/stammtische`),
  höchstens drei eigene aktive (`SIGNUP_MAX_OWNED`, Fehler `stammtisch_limit`).
  `SIGNUP_ENABLED=false` schaltet das Eröffnen ab.
- **Anlegen (Vereint-Team):** Die Plattform-Administration legt unter
  `/plattform` Gruppen an. Optional wird ein bestehendes Konto per E-Mail Admin
  der neuen Gruppe, sonst die anlegende Person. Dort lassen sich Gruppen auch
  umbenennen, archivieren (nicht löschen) und von Hand einem Tarif zuordnen.

## Gemeinsame Getränkedatenbank

`drink_library` und `drink_library_barcodes` gehören keiner Gruppe. Sie
enthalten Name, Beschreibung, Kategorie und Barcodes, aber **keine Preise und
keine Bilder**.

Migration `017-drink-library-seed.xml` legt einen Startbestand von 95 in
Deutschland bekannten Getränken an (Bier, alkoholfreies Bier, Biermix,
Softdrinks, Energydrinks, Wasser, Saft und Schorle, Sekt, Spirituosen).
`018-drink-library-seed-breweries.xml` ergänzt 1.127 Getränke: alles, was
Open Food Facts von 138 deutschen Brauereien kennt, dazu Rapp's (Kelterei),
die Brauerei Rapp sowie Adelholzener und Almdudler als in Bayern viel
getrunkene Wässer und Limonaden. Erzeugt werden die Daten mit
`scripts/drink-library/` aus dem Export von Open Food Facts. Die
Barcodes stammen aus [Open Food Facts](https://world.openfoodfacts.org) unter
der ODbL 1.0, Quellenangabe in
`baseservice/src/main/resources/db/changelog/data/README.md`. Vorhandene
Einträge mit gleichem Namen oder Barcode bleiben unberührt.

- Unter **Katalog → Aus der Getränkedatenbank** (`/catalog/library`) sucht man
  nach Name oder Barcode (auch per Kamera) und übernimmt ein Getränk in den
  eigenen Katalog; „Barcode scannen“ im Katalog füllt „Getränk anlegen“ bei einem
  Treffer ebenfalls daraus vor. Preis
  und Einkaufspreis setzt jede Gruppe selbst. Der Katalogeintrag merkt sich die
  Herkunft (`drink_catalog.library_drink_id`).
- Wer `catalog.approve` hat, kann ein freigegebenes eigenes Getränk in die
  Datenbank teilen. Gibt es den Barcode dort schon, wird verknüpft statt
  doppelt angelegt.
- Ändern und Löschen von Einträgen ist der Plattform-Administration vorbehalten.

## Bestehende Daten

Migration `013-stammtische.xml` legt die Standardgruppe
(`00000000-0000-0000-0000-000000000001`) an. Alle vorher vorhandenen Daten,
Konten, Rollen und Vorstandsämter gehören danach zu ihr; Theke-Konten erhalten
die Rolle `tabletRecorder`. `015-billing.xml` benennt sie in „Meine Gruppe“ um,
sofern sie noch „Mein Stammtisch“ hieß; der Name lässt sich unter **Gruppe**
ändern. `014-drink-library.xml` legt die Getränkedatenbank an.

## Betrieb

- Row-Level-Security greift nur für Datenbankbenutzer ohne Superuser- und ohne
  `BYPASSRLS`-Recht. In Produktion ist das der Benutzer `vereint`
  (`deploy/postgres/init-databases.sh`), dem die Tabellen gehören; `FORCE` sorgt
  dafür, dass die Policy auch für den Eigentümer gilt. Lokal mit
  `docker compose` verbindet sich der Dienst als Superuser, dort ist RLS wirksam
  ausgeschaltet; die Trennung in der Anwendung bleibt.
- Backups laufen als `postgres` (Superuser) und enthalten alle Gruppen.
- `TENANCY_BOOTSTRAP_REALM_ROLES=true` (nur lokal und in den E2E-Tests): Konten
  ohne Mitgliedschaft treten beim ersten Aufruf „Meine Gruppe“ bei, mit den
  Systemrollen aus ihren Keycloak-Realmrollen. In Produktion bleibt es aus.
- `vereint.tenancy.row-level-security=false` schaltet das Setzen der
  Datenbank-Variablen ab (nur für H2-Tests).

## Bekannte Grenzen

- **Push-Benachrichtigungen** kommen ohne Inhalt an; der Service Worker holt den
  Text über die API in der gerade gewählten Gruppe. Kommt die Mitteilung aus
  einer anderen Gruppe, zeigt das Gerät die neueste ungelesene Mitteilung
  der gewählten Gruppe oder den allgemeinen Hinweis „Du hast eine neue
  Mitteilung.“. Die Mitteilung selbst liegt korrekt in der anderen Gruppe.
- Der Rollen-Cache im Fachservice (`StammtischAccess`) ist pro Instanz und wird
  nur auf der Instanz geleert, die die Rolle ändert; bei mehreren Instanzen
  greifen Rollenänderungen auf den übrigen erst nach einem Neustart (heute läuft
  eine Instanz).
