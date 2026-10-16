# Branches und CI

## Branches

| Branch | Zweck |
| :--- | :--- |
| `develop` | Standard-Branch, hier landen alle Pull Requests |
| `qs` | Qualitätssicherung vor dem Release |
| `main` | Produktion. **Jeder Merge nach `main` rollt automatisch aus** ([Deployment und Rollback](deployment-und-rollback.md)) |

Feature-Branches gehen per Pull Request nach `develop`. Die Prüfungen laufen nur
für Pull Requests in diese drei Branches; ein Pull Request, der auf einem
anderen Feature-Branch aufsetzt, bekommt CI erst, wenn er auf `develop` zeigt.

## Was vor jedem Merge geprüft wird

| Workflow | Prüft |
| :--- | :--- |
| `baseservice CI/CD` | Tests (JDK 25), Docker-Image bauen, Trivy-Scan des Images |
| `webservice CI/CD` | Tests, Docker-Image bauen, Trivy-Scan des Images |
| `keycloak CI/CD` | Keycloak-Image mit Realm und Theme bauen und scannen |
| `Security` | Gitleaks (Secrets in der gesamten Historie), Trivy auf Abhängigkeiten und Konfiguration; zusätzlich jeden Montag |
| `E2E-Tests` | Playwright gegen den kompletten Stack ([E2E-Tests](../../e2e/README.md)) |
| `Infrastruktur` | `terraform fmt` und `terraform validate` bei Änderungen in `infra/` |

GitHub Actions sind auf Commit-SHAs gepinnt, Images auf Digests. Dependabot hält
beides und die Abhängigkeiten aktuell
([.github/dependabot.yml](../../.github/dependabot.yml)).

Für `main`, `qs` und `develop` sollte in GitHub ein Branch-Schutz gelten: Pull
Request vor dem Merge, die CI-Checks als Pflicht, kein Force-Push und kein
Löschen (siehe [Go-Live-Checkliste](go-live-checkliste.md)).

## Images

Bei Pushes auf `develop`, `qs` und `main` werden die Images für `linux/amd64`
und `linux/arm64` gebaut und nach `ghcr.io/damaurer/<dienst>` gepusht, getaggt
mit dem Commit. Ausgerollt wird immer über den Digest, nie über einen
veränderlichen Tag.
