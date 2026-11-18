# Branches und CI

## Branches

| Branch | Zweck |
| :--- | :--- |
| `develop` | Standard-Branch, hier landen alle Pull Requests |
| `qs` | Qualitätssicherung vor dem Release |
| `main` | Produktion. Nach einem Merge landen neu gebaute Images als `:main` in GitHub Packages ([Vereint selbst betreiben](selbst-betreiben.md)) |

Feature-Branches gehen per Pull Request nach `develop`. Die Workflows laufen nur
in diesen Fällen:

- bei einem Push auf `develop`, `qs` oder `main` (also nach jedem Merge),
- bei einem Pull Request von `develop` nach `qs` und von `qs` nach `main`,
  jeweils aus diesem Repository (nicht aus einem Fork),
- von Hand (*Run workflow*) auf einem dieser drei Branches, `Security`
  zusätzlich jeden Montag auf `develop`.

Pull Requests von Feature-Branches nach `develop` bekommen keine CI; geprüft
wird erst der Stand auf `develop` nach dem Merge. Vor dem Merge nach `develop`
deshalb lokal testen (`node local/vereint.mjs test`). Jeder andere
Pull Request (zum Beispiel ein Feature-Branch direkt nach `qs`) zeigt die Jobs
nur als übersprungen.

## Was geprüft wird

| Workflow | Prüft |
| :--- | :--- |
| `baseservice CI/CD` | Tests (JDK 25), Docker-Image bauen, Trivy-Scan des Images; auf `main`/`qs` zusätzlich pushen und signieren |
| `webservice CI/CD` | Tests, Docker-Image bauen, Trivy-Scan des Images; auf `main`/`qs` zusätzlich pushen und signieren |
| `keycloak CI/CD` | Keycloak-Image mit Realm und Theme bauen und scannen (nur für den lokalen Stack und die E2E-Tests, wird nicht veröffentlicht) |
| `Security` | Gitleaks (Secrets in der gesamten Historie), Trivy auf Abhängigkeiten und Konfiguration, Verweise auf nicht vorhandene Markdown-Dateien; zusätzlich jeden Montag |
| `E2E-Tests` | Playwright gegen den kompletten Stack ([E2E-Tests](../../e2e/README.md)) |

GitHub Actions sind auf Commit-SHAs gepinnt, Images auf genaue Versionen (die
Basis-Images des baseservice zusätzlich auf Digests). Dependabot hält beides und
die Abhängigkeiten aktuell: Gradle, npm (webservice, e2e), alle Dockerfiles und
die Compose-Dateien ([.github/dependabot.yml](../../.github/dependabot.yml)).
Ausgenommen ist das Playwright-Image des Seed-Dienstes in
`local/compose.local.yaml`; es wird zusammen mit `local/seed.package.json` von
Hand angehoben.

Für `main`, `qs` und `develop` sollte in GitHub ein Branch-Schutz gelten: Pull
Request vor dem Merge, kein Force-Push und kein Löschen. CI-Checks als Pflicht
nur für `qs` und `main`; für `develop` meldet kein Pull Request Checks, ein
Pflicht-Check bliebe dort für immer offen.

## Images

Die drei Image-Workflows laufen nur, wenn sich ihr Ordner (`baseservice/`,
`webservice/`, `keycloak/`) oder der Workflow selbst geändert hat; `Security`
und `E2E-Tests` laufen immer. Gebaut und gescannt wird bei jedem Lauf (siehe
oben, wann die Workflows laufen). Nur nach einem Merge auf `qs` oder `main` werden baseservice und
webservice für `linux/amd64` und `linux/arm64` nach
`ghcr.io/damaurer/vereint-<dienst>` gepusht, getaggt mit Commit-SHA und Branch-Namen.
Das `:qs`-Image des webservice wird mit `APP_STAGE=qs` gebaut. Es liefert
unter denselben Adressen ein eigenes Manifest („Vereint QS“, orange
Statusleiste) und orange Icons mit QS-Schild aus `webservice/public/qs/` aus.
So lassen sich die installierte QS-App und die Produktiv-App auf dem Gerät
unterscheiden. `:main` bleibt unverändert. Die PNG-Icons entstehen mit
`node scripts/qs-icons/render.mjs` aus den SVG-Quellen.
Mit *Run workflow* lassen sich die Image-Workflows auch von Hand starten.
Ausgerollt wird außerhalb dieses Repositorys.

## Signierte Images

Gepusht wird in einem eigenen Job (`Image pushen und signieren`), der nur bei
einem Push oder einem Start von Hand auf `main` oder `qs` läuft. Er liegt im
GitHub-Environment `signatur-main` bzw. `signatur-qs` und signiert nach dem
Push den Digest, auf den `:main` bzw. `:qs` zeigt, mit
[cosign](https://github.com/sigstore/cosign) 2.6.5. Die Signatur liegt neben
dem Image in GitHub Packages; ein öffentliches Transparenz-Log wird nicht
benutzt (`--tlog-upload=false`). Wer die Images ausrollt, prüft passend dazu
mit dem öffentlichen Schlüssel und ohne Log, zum Beispiel:

```bash
cosign verify --key cosign.pub --insecure-ignore-tlog=true \
  ghcr.io/damaurer/vereint-baseservice:main
```

Einrichten (einmalig, in *Settings → Environments*):

1. Schlüsselpaar erzeugen: `cosign generate-key-pair` (fragt nach einem
   Passwort, legt `cosign.key` und `cosign.pub` an).
2. Environments `signatur-main` und `signatur-qs` anlegen, jeweils mit den
   Secrets `COSIGN_PRIVATE_KEY` (Inhalt von `cosign.key`) und
   `COSIGN_PASSWORD`. Unter *Deployment branches and tags* nur `main` bzw.
   `qs` zulassen, damit kein anderer Branch an den Schlüssel kommt.
3. `cosign.pub` dort hinterlegen, wo vor dem Ausrollen geprüft wird.
   `cosign.key` und das Passwort offline aufbewahren
   ([Sicherheit und Schlüssel](sicherheit-und-schluessel.md)).

Fehlt das Secret, schlägt der Job nach dem Push fehl: Das Image liegt dann
unsigniert in GitHub Packages und wird von einem prüfenden Server nicht
ausgerollt. cosign 3 legt Signaturen anders ab; die Version im Workflow
(`COSIGN_IMAGE`) nur zusammen mit der Prüfseite anheben.
