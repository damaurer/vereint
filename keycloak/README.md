# Keycloak-Realm-Importe

Dieses Verzeichnis enthält die versionierten Realm-Definitionen. Beide Dateien sind gehärtet: keine Wildcard-Redirects, keine offenen `webOrigins`, keine Direct Access Grants, Refresh-Token-Rotation aktiv und ausschließlich Platzhalter statt Secrets.

| Datei | Zweck |
| --- | --- |
| `realm-export.json` | Import für deployte Umgebungen; enthält ausschließlich das Service-Account des Tablet-Clients und keine Seed-Benutzer |
| `dev/realm-export-dev.json` | Import für die lokale Entwicklung; zusätzlich Seed-Benutzer mit temporären Passwörtern aus Umgebungsvariablen |

Keycloak ersetzt beim Import Platzhalter der Form `${VARIABLE}` durch den Wert der jeweiligen Umgebungsvariablen.

```text
KEYCLOAK_CLIENT_SECRET           Secret des Clients vereint-web
KEYCLOAK_TABLET_CLIENT_SECRET    Secret des Service-Accounts vereint-tablet
PUBLIC_BASE_URL                  Root-URL des Express-/SSR-Gateways
SPRING_API_BASE_URL              Root-URL des Spring-Boot-Fachservice
KEYCLOAK_SEED_ADMIN_PASSWORD     nur Entwicklungsimport
KEYCLOAK_SEED_BOARD_PASSWORD     nur Entwicklungsimport
KEYCLOAK_SEED_MEMBER_PASSWORD    nur Entwicklungsimport
```

Für die lokale Entwicklung wird `./keycloak/dev` als Importverzeichnis eingebunden; Keycloak liest nur reguläre `.json`-Dateien der obersten Ebene, Unterverzeichnisse werden ignoriert. Die Werte der Realm-Härtung und ihr Zusammenspiel mit der Express-Session sind in [`docs/backend-for-frontend/03-authentication-and-session.md`](../docs/backend-for-frontend/03-authentication-and-session.md) beschrieben.

Im Entwicklungs-Export ist zusätzlich `registrationAllowed: true` gesetzt, damit die Registrierungsseite lokal erreichbar ist. Achtung: `default-roles-vereint` vergibt automatisch die Rolle `member`, registrierte Benutzer erhalten also sofort Mitgliedsrechte. Im deployten Export bleibt die Registrierung deaktiviert.

Secrets und Passwörter gehören niemals in dieses Verzeichnis.

## Login-Theme `vereint`

Beide Realm-Exports setzen `loginTheme: "vereint"` sowie Deutsch als Standardsprache (`internationalizationEnabled`, `supportedLocales: de,en`, `defaultLocale: de`). Das Theme liegt unter `themes/vereint/login` und erbt von `keycloak.v2` (PatternFly 5, Keycloak 26.1.4). Es rendert alle Login-Seiten im Split-Screen-Layout der Vereint-App (Optimus-Design-Tokens aus `webservice/src/styles.css`, Markenverlauf und Logos aus `webservice/public`), ist von 320 px bis 4K responsiv und folgt automatisch dem Dark-Mode des Systems.

```text
themes/vereint/login/
├── theme.properties              parent=keycloak.v2, locales, darkMode, styles, Klassen-Hooks
├── template.ftl                  Split-Screen-Rahmen (Branding-Panel + Karte) fuer alle Seiten
├── login.ftl                     Anmeldung
├── login-reset-password.ftl      Passwort zuruecksetzen
├── register.ftl                  Registrierung
├── messages/messages_de.properties, messages_en.properties
└── resources/
    ├── css/vereint.css           Optimus-Tokens, PF5-Variablen-Mapping, Layout, Dark-Mode
    └── img/                      vereint-logo.svg, vereint-logo-mono.svg, vereint-icon.svg, favicon.svg
```

Die drei überschriebenen Seiten-Templates und `template.ftl` sind Kopien der `keycloak.v2`-Originale aus Keycloak 26.1.4 mit minimalen Anpassungen (Kopfkommentar in jeder Datei). Alle übrigen Seiten (OTP, Fehler, Info, Passwort aktualisieren, E-Mail-Verifikation, …) werden unverändert geerbt und erhalten über `template.ftl` und `vereint.css` automatisch das Branding. Beim Keycloak-Upgrade die vier FTL-Dateien mit den neuen Originalen aus `org.keycloak.keycloak-themes-<version>.jar` (Pfad `theme/keycloak.v2/login/`) abgleichen.

### Lokale Entwicklung

`docker-compose.yml` mountet `./keycloak/themes` nach `/opt/keycloak/themes` (read-only) und deaktiviert den Theme-Cache (`KC_SPI_THEME_CACHE_THEMES=false`, `KC_SPI_THEME_CACHE_TEMPLATES=false`, `KC_SPI_THEME_STATIC_MAX_AGE=-1`). Änderungen an FTL, CSS und Messages sind damit nach einem Browser-Reload sichtbar; nur `theme.properties` erfordert einen Neustart des Containers. Die Login-Seite ist über die Auth-URL des Clients erreichbar, z. B.

```text
http://localhost:8082/realms/vereint/protocol/openid-connect/auth?client_id=vereint-web&response_type=code&scope=openid&redirect_uri=http://localhost:8080/api/auth/callback&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256
```

Prüfschritte nach Änderungen: Seite rendert mit `<html class="login-pf vereint-html" lang="de">`, `css/vereint.css` und `img/*.svg` liefern HTTP 200, `?kc_locale=en` schaltet auf Englisch, kein horizontales Scrollen bei 320/375/768/1024/1440/1920 px, Buttons und Eingabefelder sind mindestens 44 px hoch, im Dark-Mode erhält `<html>` die Klasse `pf-v5-theme-dark` und die Karte den Hintergrund `#1e293b`. Das Container-Log darf keine Meldung `Theme vereint not found` enthalten.

### Produktion

`keycloak/Dockerfile` baut ein Image mit dem Produktionsrealm (Keycloak 26.8.1): Realm-Import (`realm-export.json`) und Theme sind eingebaut, die Konfiguration ist vorab optimiert, Keycloak läuft unter dem Pfad `/kc`. Es läuft im lokalen Stack (`local/`) und in den E2E-Tests; CI baut und prüft es bei jeder Änderung, veröffentlicht es aber nicht.

Laufzeit ist seit dem Produktions-Setup Keycloak 26.8.1 (26.1.4 hatte zahlreiche bekannte Schwachstellen); die FTL-Vorlagen basieren weiterhin auf 26.1.4 und rendern unter 26.8.1 (Login, Passwort zurücksetzen und Fehlermeldungen geprüft). Beim nächsten Theme-Umbau die Vorlagen mit den 26.8.1-Originalen abgleichen.

Das Theme benötigt keinen Build-Schritt (`kc.sh build` ist nicht erforderlich). Den Ordner `keycloak/themes/vereint` entweder in das Image kopieren (`COPY keycloak/themes /opt/keycloak/themes`) oder wie lokal nach `/opt/keycloak/themes` mounten. Die Cache-Variablen aus `docker-compose.yml` **nicht** übernehmen: Keycloak cached Themes und Templates standardmäßig, was in Produktion gewünscht ist.

### Vorhandener Keycloak

Statt dieses Images kann auch ein vorhandener Keycloak den Realm bereitstellen,
zum Beispiel unter `https://auth.<domain>/realms/vereint` ohne `/kc`. Dafür
`realm-export.json` (mit ersetzten Platzhaltern) importieren und `themes/vereint`
als Theme einbinden; API und BFF lesen die Adresse nur aus
`KEYCLOAK_ISSUER_URI`. Keycloak importiert einen Realm nur, solange es ihn
noch nicht gibt; spätere Änderungen am laufenden Realm macht man in der
Admin-Konsole. Wer eine Kopie von Realm oder Theme woanders pflegt, zieht
Änderungen an `realm-export.json` und `themes/vereint` dort nach.
