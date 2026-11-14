# Branches und CI

## Branches

| Branch | Zweck |
| :--- | :--- |
| `develop` | Standard-Branch, hier landen alle Pull Requests |
| `qs` | Qualitätssicherung vor dem Release |
| `main` | Produktion. Nach einem Merge landen neu gebaute Images als `:main` in GitHub Packages ([Vereint selbst betreiben](selbst-betreiben.md)) |

Feature-Branches gehen per Pull Request nach `develop`. Die Prüfungen laufen nur
für Pull Requests in diese drei Branches; ein Pull Request, der auf einem
anderen Feature-Branch aufsetzt, bekommt CI erst, wenn er auf `develop` zeigt.

## Was vor jedem Merge geprüft wird

| Workflow | Prüft |
| :--- | :--- |
| `baseservice CI/CD` | Tests (JDK 25), Docker-Image bauen, Trivy-Scan des Images |
| `webservice CI/CD` | Tests, Docker-Image bauen, Trivy-Scan des Images |
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
Request vor dem Merge, die CI-Checks als Pflicht, kein Force-Push und kein
Löschen.

## Images

Die drei Image-Workflows laufen nur, wenn sich ihr Ordner (`baseservice/`,
`webservice/`, `keycloak/`) oder der Workflow selbst geändert hat; `Security`
und `E2E-Tests` laufen immer. Gebaut und gescannt wird bei jedem Pull Request
und Push. Nur nach einem Merge auf `qs` oder `main` werden baseservice und
webservice für `linux/amd64` und `linux/arm64` nach
`ghcr.io/damaurer/vereint-<dienst>` gepusht, getaggt mit Commit-SHA und Branch-Namen.
Mit *Run workflow* lassen sich die Image-Workflows auch von Hand starten.
Ausgerollt wird außerhalb dieses Repositorys.
