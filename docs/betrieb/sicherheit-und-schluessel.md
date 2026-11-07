# Sicherheit und Verschlüsselung

Diese Seite beschreibt, was die App selbst schützt und welche Schlüssel
offline gehören. Server, Proxy und Backups liegen beim Betreiber
([Vereint selbst betreiben](selbst-betreiben.md)).

## Verschlüsselung in Schichten

| Schicht | Wie |
| :--- | :--- |
| **Übertragung** | Von außen nur HTTPS über den Reverse Proxy (HSTS, HTTP leitet um). |
| **Inhalte in der App** | Chat-Nachrichten, Benachrichtigungen, Bilder sowie Fotos und Videos aus Moments verschlüsselt der baseservice mit **AES-256-GCM** (`DATA_ENCRYPTION_KEY`), bevor sie in PostgreSQL oder im Datei-Volume landen. Ein Datenbank-Dump oder eine Kopie des Volumes allein ist damit unlesbar. |
| **Web Push** | Pushes enthalten keine Inhalte. Das Gerät lädt die Mitteilung mit seiner Sitzung nach. |

Bilder und Videos gibt es nur über Endpunkte des baseservice, die vorher prüfen,
ob die Person sie sehen darf. Direkte Links auf Dateien gibt es nicht.

Bewusst **keine** Ende-zu-Ende-Verschlüsselung: Sie würde Suche und
Push-Vorschauen verhindern. Der Schlüssel liegt auf dem Server, nicht bei den
Mitgliedern.

## Trennung der Gruppen

Daten einer Gruppe sieht nur, wer Mitglied dieser Gruppe ist. Das sichern zwei
unabhängige Schichten: Hibernate hängt an jede Abfrage die Gruppe an, und
PostgreSQL erzwingt dieselbe Grenze per Row-Level-Security auf allen fachlichen
Tabellen. Das greift nur, wenn sich der baseservice als Benutzer `vereint`
verbindet (kein Superuser), wie ihn `local/postgres/init-databases.sh` anlegt. Details: [stammtische.md](../domains/stammtische.md#trennung).

Zahlungsdaten gibt es in Vereint nicht; die App ist frei nutzbar.

## Schlüssel, die offline gesichert sein müssen

> **Wichtig:** `DATA_ENCRYPTION_KEY` zusätzlich außerhalb des Servers
> aufbewahren, zum Beispiel im Passwort-Manager und ausgedruckt. Ohne ihn sind
> Chat-Nachrichten, Benachrichtigungen, Bilder und Videos **auch aus einem
> intakten Backup** nicht mehr lesbar. Der Wert gehört nie in die
> Dokumentation, ins Repository oder in einen Chat.

**`DATA_ENCRYPTION_KEY` rotieren:** den bisherigen Wert als
`DATA_ENCRYPTION_KEY_PREVIOUS` setzen, einen neuen `DATA_ENCRYPTION_KEY`
erzeugen (`openssl rand -base64 32`) und den baseservice neu starten. Alte
Inhalte bleiben mit dem vorherigen Schlüssel lesbar. `SESSION_SECRET`
rotiert man ebenso mit `SESSION_SECRET_PREVIOUS`.

## Secrets

- Im Repository stehen keine echten Secrets. Der Betreiber gibt sie den
  Containern als Umgebungsvariablen ([Konfiguration](selbst-betreiben.md#konfiguration)).
- Lokal und in den E2E-Tests erzeugen `local/vereint.mjs` und `e2e/stack.sh`
  Wegwerf-Secrets in nicht versionierten Dateien.

## Härtung

**Anmeldung**

- Login über den BFF mit OIDC und PKCE; der Browser sieht nie ein Token, nur ein
  HttpOnly-Cookie.
- **Zwei-Faktor-Anmeldung freiwillig:** Im Profil führt „Zwei-Faktor-Anmeldung
  einrichten“ zur Keycloak-Kontoverwaltung. Wer eine Authenticator-App
  hinterlegt, wird beim Login nach dem Code gefragt. Für Vorstand und
  Administration empfohlen, Pflicht für niemanden.
- Passwörter mit 10 bis 128 Zeichen, nicht gleich Benutzername oder E-Mail,
  nicht eines der letzten drei. Nach 5 Fehlversuchen wachsende Sperre.
- Keine offene Selbstregistrierung in Keycloak (Konten entstehen nur über
  Einladungslinks oder „Gruppe eröffnen“, abschaltbar mit `SIGNUP_ENABLED`),
  kein „Passwort vergessen“ ohne Mailserver, keine Wildcard-Redirects, keine Direct
  Access Grants, Refresh-Token-Rotation. Login- und Admin-Ereignisse werden 90
  Tage gespeichert.
- Einladungslinks: 32 zufällige Byte, nur der Hash gespeichert, das Token steht
  im URL-Fragment und landet nie in Server-Logs.

**Anwendung**

- Fremde Seiten können nichts auslösen: Der webservice lehnt schreibende
  Anfragen ab, die nicht von der eigenen Seite kommen.
- Rate-Limits: Einladungs-, Gast-Token- und Registrierungs-Endpunkte 30 Versuche je IP in
  15 Minuten, Login-Start 120 je IP in 5 Minuten, übrige API 600 Anfragen je
  Sitzung und Minute.
- Der webservice reicht nur `/api/v1` weiter; die API-Beschreibung (Swagger) ist
  in Produktion abgeschaltet.
- Fotos und Videos ohne Standort: EXIF/XMP-Daten aus Bildern und Orts- und
  Geräteangaben aus Videos werden entfernt, bevor sie verschlüsselt gespeichert
  werden.

**Container**

- Beide Images laufen als unprivilegierter Benutzer (UID 10001), ohne
  Paketmanager zur Laufzeit; sie vertragen ein schreibgeschütztes Dateisystem
  (nur `/tmp` und beim baseservice das Datei-Volume beschreibbar).
- Empfohlen und in `local/compose.yaml` umgesetzt: keine Linux-Capabilities,
  `no-new-privileges`, Prozess- und Speicherlimits, Datenbank und baseservice
  ohne direkten Zugang von außen.
- Der Proxy weist Anfragen über 8 MB ab (Moment-Medien bis 110 MB) und
  erlaubt Kamera und Standort nur für die eigene Seite; die
  Keycloak-Verwaltung ist von außen nicht erreichbar.

**Lieferkette**

- Jeder Pull Request wird auf eingecheckte Secrets (Gitleaks) und bekannte
  Schwachstellen (Trivy) geprüft.
- GitHub Actions sind auf Commit-SHAs gepinnt, Images auf Digests; Dependabot
  hält beides aktuell.

Mehr: [docs/architecture/security-and-auth.md](../architecture/security-and-auth.md)
