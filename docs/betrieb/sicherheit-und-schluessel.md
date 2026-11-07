# Sicherheit und Verschlüsselung

Vereint läuft auf dem Strato-Server, den
[LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup) einrichtet
([Betrieb auf einem Strato VPS](strato.md)). Server, Secrets (Ansible Vault),
Backups und Schlüsselrotation beschreibt LinuxServerSetup; diese Seite fasst
zusammen, was die App selbst schützt und welche Schlüssel offline gehören.

## Verschlüsselung in Schichten

| Schicht | Wie |
| :--- | :--- |
| **Übertragung** | Von außen nur HTTPS über Traefik (Let's Encrypt, HSTS, HTTP leitet um). |
| **Inhalte in der App** | Chat-Nachrichten, Benachrichtigungen, Bilder sowie Fotos und Videos aus Moments verschlüsselt der baseservice mit **AES-256-GCM** (`DATA_ENCRYPTION_KEY`), bevor sie in PostgreSQL oder im Datei-Volume landen. Ein Datenbank-Dump oder eine Kopie des Volumes allein ist damit unlesbar. |
| **Backups** | restic verschlüsselt alle Backups (`vault_restic_password`), bevor sie nach HiDrive gehen. |
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
verbindet (kein Superuser); in Produktion legt ihn `init-databases.sh` der
Rolle `vereint` in LinuxServerSetup so an, lokal `local/postgres/init-databases.sh`. Details: [stammtische.md](../domains/stammtische.md#trennung).

Zahlungsdaten gibt es in Vereint nicht; die App ist frei nutzbar.

## Schlüssel, die offline gesichert sein müssen

> **Wichtig:** Diese Werte zusätzlich offline aufbewahren, zum Beispiel im
> Passwort-Manager und ausgedruckt. Sie gehören nie in die Dokumentation, ins
> Repository oder in einen Chat.

| Wert | Ohne ihn … |
| :--- | :--- |
| `vault_vereint_data_encryption_key` (`DATA_ENCRYPTION_KEY`) | … sind Chat-Nachrichten, Benachrichtigungen, Bilder und Videos **auch aus einem intakten Backup** nicht mehr lesbar. |
| `vault_restic_password` | … ist kein Backup auf HiDrive lesbar. |
| Vault-Passwort von LinuxServerSetup | … kommt man an keinen der Werte im Vault. |

**`DATA_ENCRYPTION_KEY` rotieren:** wie in
[docs/vereint.md von LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/vereint.md#betrieb)
beschrieben: den bisherigen Wert als `vereint_data_encryption_key_previous`
übernehmen, den neuen in den Vault, `site.yml --tags vereint`. Alte Inhalte
bleiben damit lesbar.

## Secrets

- Alle Secrets stehen im Ansible Vault von LinuxServerSetup
  (`vault_vereint_*`). Auf dem Server liegen sie nur in Env-Dateien, die nur
  root lesen kann. Im Repository stehen sie nie.
- In GitHub liegen nur `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` und der
  Deploy-Key `DEPLOY_SSH_KEY` im Environment `production`. Der Key darf auf dem
  Server nur `deploy vereint <tag>` ausführen.
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

**Server** (LinuxServerSetup)

- SSH nur per Key, ohne Root- und Passwort-Login; Firewall lässt nur SSH, 80
  und 443 durch; CrowdSec sperrt Angreifer; Sicherheitsupdates täglich.
- Datenbank und API haben kein Internet (eigenes internes Netz), nur die API
  darf für Web Push nach außen.
- Container ohne Linux-Capabilities, mit `no-new-privileges`, Prozess- und
  Speicherlimits; baseservice und webservice mit schreibgeschütztem
  Dateisystem.
- Traefik weist Anfragen über 8 MB ab (Moment-Medien bis 100 MiB) und erlaubt
  Kamera und Standort nur für die eigene Seite.
- Die Keycloak-Verwaltung ist nur nach dem Admin-Login der Plattform mit 2FA
  erreichbar.

**Lieferkette**

- Jeder Pull Request wird auf eingecheckte Secrets (Gitleaks) und bekannte
  Schwachstellen (Trivy) geprüft.
- GitHub Actions sind auf Commit-SHAs gepinnt, Images auf Digests; Dependabot
  hält beides aktuell.

Mehr: [LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup#readme),
[docs/architecture/security-and-auth.md](../architecture/security-and-auth.md)
