# Keycloak-Realm-Importe

Dieses Verzeichnis enthält die versionierten Realm-Definitionen. Beide Dateien sind gehärtet: keine Wildcard-Redirects, keine offenen `webOrigins`, keine Direct Access Grants, Refresh-Token-Rotation aktiv und ausschließlich Platzhalter statt Secrets.

| Datei | Zweck |
| --- | --- |
| `realm-export.json` | Import für deployte Umgebungen; enthält ausschließlich das Service-Account des Tablet-Clients und keine Seed-Benutzer |
| `dev/realm-export-dev.json` | Import für die lokale Entwicklung; zusätzlich Seed-Benutzer mit temporären Passwörtern aus Umgebungsvariablen |

Keycloak ersetzt beim Import Platzhalter der Form `${VARIABLE}` durch den Wert der jeweiligen Umgebungsvariablen.

```text
KEYCLOAK_CLIENT_SECRET           Secret des Clients reisch-web
KEYCLOAK_TABLET_CLIENT_SECRET    Secret des Service-Accounts reisch-tablet
PUBLIC_BASE_URL                  Root-URL des Express-/SSR-Gateways
SPRING_API_BASE_URL              Root-URL des Spring-Boot-Fachservice
KEYCLOAK_SEED_ADMIN_PASSWORD     nur Entwicklungsimport
KEYCLOAK_SEED_BOARD_PASSWORD     nur Entwicklungsimport
KEYCLOAK_SEED_MEMBER_PASSWORD    nur Entwicklungsimport
```

Für die lokale Entwicklung wird `./keycloak/dev` als Importverzeichnis eingebunden; Keycloak liest nur reguläre `.json`-Dateien der obersten Ebene, Unterverzeichnisse werden ignoriert. Die Werte der Realm-Härtung und ihr Zusammenspiel mit der Express-Session sind in `docs/authentifizierung.md` beschrieben.

Secrets und Passwörter gehören niemals in dieses Verzeichnis.
