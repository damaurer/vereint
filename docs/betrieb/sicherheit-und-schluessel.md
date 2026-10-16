# Sicherheit und Verschlüsselung

## Verschlüsselung in Schichten

| Schicht | Wie |
| :--- | :--- |
| **Übertragung** | Von außen nur HTTPS über Caddy (Let's Encrypt, HSTS, HTTP leitet um). S3 lehnt Zugriffe ohne TLS ab. |
| **Inhalte in der App** | Chat-Nachrichten, Benachrichtigungen, Bilder sowie Fotos und Videos aus Moments verschlüsselt der baseservice mit **AES-256-GCM** (`DATA_ENCRYPTION_KEY`), bevor sie in PostgreSQL oder S3 landen. Ein Datenbank-Dump oder ein Bucket allein ist damit unlesbar. |
| **Speicher** | EBS-Disks und S3-Buckets sind verschlüsselt, beide Buckets privat. |
| **Backups** | Zusätzlich mit GnuPG (AES-256, `BACKUP_ENCRYPTION_KEY`) verschlüsselt, bevor sie den Server verlassen. |
| **Web Push** | Pushes enthalten keine Inhalte. Das Gerät lädt die Mitteilung mit seiner Sitzung nach. |

Bilder und Videos gibt es nur über Endpunkte des baseservice, die vorher prüfen,
ob die Person sie sehen darf. Direkte S3-Links gibt es dafür nicht.

Bewusst **keine** Ende-zu-Ende-Verschlüsselung: Sie würde Suche und
Push-Vorschauen verhindern. Der Schlüssel liegt auf dem Server, nicht bei den
Mitgliedern.

## Schlüssel, die offline gesichert sein müssen

> **Wichtig:** Diese zwei Werte aus dem SSM Parameter Store zusätzlich offline
> aufbewahren, zum Beispiel im Passwort-Manager des Vorstands. Die Werte gehören
> nie in dieses Wiki, ins Repository oder in einen Chat.

| Parameter | Ohne ihn … |
| :--- | :--- |
| `/vereint/BACKUP_ENCRYPTION_KEY` | … sind die Backups in S3 nicht lesbar. |
| `/vereint/DATA_ENCRYPTION_KEY` | … sind Chat-Nachrichten, Benachrichtigungen, Bilder und Videos **auch aus einem intakten Backup** nicht mehr lesbar. |

Auslesen (mit AWS-Admin-Login):

```bash
aws ssm get-parameter --name /vereint/BACKUP_ENCRYPTION_KEY --with-decryption
aws ssm get-parameter --name /vereint/DATA_ENCRYPTION_KEY --with-decryption
```

**`DATA_ENCRYPTION_KEY` rotieren:** den bisherigen Wert zusätzlich als
`/vereint/DATA_ENCRYPTION_KEY_PREVIOUS` anlegen, dann
`terraform apply -replace=random_bytes.data_encryption_key` und neu ausrollen.
Alte Inhalte bleiben mit dem vorherigen Schlüssel lesbar.

## Secrets

- Alle Secrets erzeugt Terraform zufällig und legt sie als `SecureString` unter
  `/vereint/*` im Parameter Store ab. Im Repository und in GitHub stehen sie nie.
- Bei jedem Deployment schreibt `bin/fetch-env.sh` sie in eine `.env`, die nur
  root lesen kann.
- Der Terraform-State enthält die Secrets und liegt deshalb verschlüsselt und
  versioniert in S3.
- In GitHub liegt nur `AWS_DEPLOY_ROLE_ARN`, und das ist kein Schlüssel, sondern
  der Name der Rolle, die nur Jobs im Environment `production` übernehmen dürfen.

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
- Keine offene Selbstregistrierung, keine Wildcard-Redirects, keine Direct
  Access Grants, Refresh-Token-Rotation. Login- und Admin-Ereignisse werden 90
  Tage gespeichert.
- Einladungslinks: 32 zufällige Byte, nur der Hash gespeichert, das Token steht
  im URL-Fragment und landet nie in Server-Logs.

**Anwendung**

- Fremde Seiten können nichts auslösen: Der webservice lehnt schreibende
  Anfragen ab, die nicht von der eigenen Seite kommen.
- Rate-Limits: Einladungs- und Gast-Token-Endpunkte 30 Versuche je IP in
  15 Minuten, Login-Start 120 je IP in 5 Minuten, übrige API 600 Anfragen je
  Sitzung und Minute.
- Der webservice reicht nur `/api/v1` weiter; die API-Beschreibung (Swagger) ist
  in Produktion abgeschaltet.
- Fotos und Videos ohne Standort: EXIF/XMP-Daten aus Bildern und Orts- und
  Geräteangaben aus Videos werden entfernt, bevor sie verschlüsselt gespeichert
  werden.

**Server**

- **Kein SSH**, Port 22 geschlossen. Shell nur über AWS Session Manager.
- Nur Port 80 und 443 offen; ausgehend nur Web und E-Mail.
- IMDSv2 mit Hop-Limit 1, damit Container nicht an die Rechte des Servers kommen.
- Container ohne Root, ohne Linux-Capabilities, mit `no-new-privileges`, Prozess-
  und Speicherlimits; baseservice und webservice mit schreibgeschütztem
  Dateisystem.
- Caddy weist Anfragen über 8 MB ab (Moment-Medien bis 110 MB) und erlaubt Kamera
  und Standort nur für die eigene Seite.
- Keycloak-Admin-Konsole und Master-Realm sind von außen nicht erreichbar.
- Automatische Sicherheitsupdates des Betriebssystems (`dnf-automatic`).

**Lieferkette**

- Jeder Pull Request wird auf eingecheckte Secrets (Gitleaks) und bekannte
  Schwachstellen (Trivy) geprüft.
- GitHub Actions sind auf Commit-SHAs gepinnt, Images auf Digests; Dependabot
  hält beides aktuell.

Mehr: [deploy/README.md](https://github.com/damaurer/vereint/blob/develop/deploy/README.md#sicherheit),
[infra/aws/README.md](https://github.com/damaurer/vereint/blob/develop/infra/aws/README.md#sicherheit),
[docs/architecture/security-and-auth.md](https://github.com/damaurer/vereint/blob/develop/docs/architecture/security-and-auth.md)
