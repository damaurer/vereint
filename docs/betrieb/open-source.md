# Open Source

Vereint steht unter der [GNU Affero General Public License v3.0](../../LICENSE)
(AGPL-3.0). Jeder darf den Code nutzen, ändern und selbst betreiben. Wer eine
geänderte Fassung als Dienst im Netz anbietet, muss den Nutzern den geänderten
Quellcode ebenfalls zugänglich machen. Als Rechteinhaber bist du selbst daran
nicht gebunden und kannst später zusätzlich ein gehostetes Angebot verkaufen.

Daten von Dritten behalten ihre eigene Lizenz: Der Startbestand der
Getränkedatenbank stammt aus Open Food Facts und steht unter der ODbL 1.0
([Quellenangabe](../../baseservice/src/main/resources/db/changelog/data/README.md)).

## Was vor dem Öffentlichschalten geprüft wurde

- **Secrets in der Historie:** Gitleaks 8.21.2 über alle Branches und Commits
  (28.10.2026). Gefunden wurden nur zwei Testwerte (ein fester Einladungs-Token
  und der PEM-Rahmen um einen im Test erzeugten Schlüssel); beide stehen jetzt
  in `.gitleaksignore`. Keine Terraform-States, `.env`-Dateien, Schlüsseldateien
  oder AWS-Konto-IDs im Verlauf. Echte Schlüssel liegen nur beim Betreiber, nie
  im Repository.
- **Demo-Zugänge:** Die Passwörter in `.env.example` und im Entwicklungs-Realm
  (`admin-demo-2026` usw.) gelten nur lokal; Produktion erzeugt eigene Werte.
- **Workflows:** Kein Workflow nutzt `pull_request_target` oder selbst gehostete
  Runner. Pull Requests aus Forks laufen ohne Secrets; Images werden nur nach
  einem Merge auf `qs` oder `main` veröffentlicht.

## Was öffentlich sichtbar wird

- Der gesamte Verlauf mit allen Commits, Pull Requests und Issues.
- Die E-Mail-Adresse in deinen Commits (`git log`). Sie lässt sich nur durch
  ein Umschreiben der Historie entfernen, was alle Forks und offenen Branches
  bricht. Für neue Commits genügt die GitHub-Einstellung *Keep my email
  addresses private* und die `noreply`-Adresse als `user.email`.
- Die Platzhalter in `webservice/src/app/legal/legal-operator.ts` (keine
  echten Daten).

## Umstellen (von Hand in GitHub)

1. Diesen Stand nach `develop` mergen, damit `LICENSE`, `SECURITY.md` und die
   ergänzte `.gitleaksignore` drin sind.
2. **Settings → General → Danger Zone → Change repository visibility →
   Public.**
3. **Settings → Actions → General → Fork pull request workflows from outside
   collaborators:** *Require approval for all external contributors*. So
   laufen fremde Pull Requests erst nach deiner Freigabe.
4. **Settings → Code security:** *Private vulnerability reporting*, *Secret
   scanning* und *Push protection* einschalten (für öffentliche Repos
   kostenlos).
5. **Settings → Branches:** Schutzregeln für `develop`, `qs` und `main`
   (Pull Request nötig, Prüfungen müssen grün sein).

Danach sind GitHub Actions für das Repository kostenlos; das monatliche Limit
privater Repositories gilt nicht mehr. Die Container-Images unter
`ghcr.io/damaurer/*` bleiben privat, bis du sie unter *Packages* einzeln
öffentlich schaltest.

## Selbst betreiben

Für Ausprobieren und Entwickeln reicht `node local/vereint.mjs up`
([local/README.md](../../local/README.md)). Für den
Produktionsbetrieb beschreibt [Vereint selbst betreiben](selbst-betreiben.md)
die Images, die Konfiguration und den ersten Start. Wer
lieber S3 statt eines Verzeichnisses nutzt, stellt `STORAGE_BACKEND=s3` und
die `S3_*`-Werte ein ([Integrationen](../baseservice/06-integrations.md)).
