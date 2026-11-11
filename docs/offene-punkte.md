# Offene Punkte

Die Liste der offenen Aufgaben, Bugs und Entscheidungen sind die
[GitHub-Issues](https://github.com/damaurer/vereint/issues). Neue Punkte bitte
dort anlegen, nicht hier. Diese Seite fasst nur bekannte Grenzen der App
zusammen, für die es kein eigenes Issue gibt, und verweist auf die wichtigsten
Issues. Stand 10.11.2026.

## Wichtige Issues

| Punkt | Issue |
| :--- | :--- |
| Erster Produktivbetrieb | [#57](https://github.com/damaurer/vereint/issues/57) mit Unteraufgaben |
| Prüfen nach dem ersten Deployment: Barcode-Kamera, Web Push, Zwei-Faktor-Anmeldung und Video-Upload gehen erst unter echtem HTTPS am Handy | [#62](https://github.com/damaurer/vereint/issues/62) |
| Rechtliches vor dem Öffnen für andere: Betreiberangaben in `webservice/src/app/legal/legal-operator.ts`, Datenschutzerklärung, AV-Vertrag ([rechtliches.md](domains/rechtliches.md#vor-dem-freischalten-der-registrierung)). Bis dahin bleibt `SIGNUP_ENABLED=false`; Einladungslinks funktionieren trotzdem | [#63](https://github.com/damaurer/vereint/issues/63) |
| Regel für Barcode-Käufe (Scannen nur bei laufenden Events, an denen das Mitglied teilnimmt) bestätigen | [#67](https://github.com/damaurer/vereint/issues/67) |
| Handbuch-Bilder für die neuen Seiten aus #80, #81 und #82 aufnehmen, sobald sie da sind: Strichliste nach Kategorien, Runde am Handy, Statistiken (aufnehmen mit [`scripts/handbook`](../scripts/handbook/)) | [#70](https://github.com/damaurer/vereint/issues/70) |

## Bekannte Grenzen der App

| Punkt | Stand |
| :--- | :--- |
| Push aus einer anderen Gruppe | Kommt eine Mitteilung aus einer anderen als der gerade gewählten Gruppe, zeigt das Gerät nur die neueste Mitteilung der gewählten Gruppe oder „Du hast eine neue Mitteilung“. |
| BeerWithMe Status | Im Profil nur eine Vorschau, wird nicht an andere übertragen. |
| Umstellung der Cookie-Namen auf `__Host-` | Der BFF liest Sitzung und Gruppenwahl noch unter den alten Namen ohne Präfix und schreibt sie um ([03-authentication-and-session.md](backend-for-frontend/03-authentication-and-session.md#cookie-namen-mit-__host-)). Solange gilt ein von einer anderen Anwendung unter derselben Domain gesetztes altes Cookie, wenn noch kein neues existiert. Nach dem Deployment und einer vollen Sitzungsdauer `readLegacySessionCookie` und `migrateLegacyStammtischCookie` entfernen. |
| Push für Chat-Nachrichten | Einzelne Chat-Nachrichten lösen keinen Push aus; neue Nachrichten zeigt der Ungelesen-Zähler am Chat. |
| Datenschutz-Link auf der Anmeldeseite | Das Login-Theme verlinkt `/datenschutz` der App. Auf dem Server liefert die Plattform diese Seite aus; lokal gibt es sie nicht (siehe [keycloak/README.md](../keycloak/README.md#vorhandener-keycloak)). |
