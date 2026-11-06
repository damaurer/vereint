# Offene Punkte

Die Liste der offenen Aufgaben, Bugs und Entscheidungen sind die
[GitHub-Issues](https://github.com/damaurer/vereint/issues). Neue Punkte bitte
dort anlegen, nicht hier. Diese Seite fasst nur bekannte Grenzen der App
zusammen, für die es kein eigenes Issue gibt, und verweist auf die wichtigsten
Issues. Stand 05.11.2026.

## Wichtige Issues

| Punkt | Issue |
| :--- | :--- |
| Go-Live auf dem Strato VPS (`vereint.maurercloud.de`), Schritte in [Betrieb auf einem Strato VPS](betrieb/strato.md#checkliste-für-den-go-live) | [#57](https://github.com/damaurer/vereint/issues/57) mit Unteraufgaben |
| Prüfen nach dem ersten Deployment: Barcode-Kamera, Web Push, Zwei-Faktor-Anmeldung und Video-Upload gehen erst unter echtem HTTPS am Handy | [#62](https://github.com/damaurer/vereint/issues/62) |
| Rechtliches vor dem Öffnen für andere: Betreiberangaben in `webservice/src/app/legal/legal-operator.ts`, Datenschutzerklärung, AV-Vertrag ([rechtliches.md](domains/rechtliches.md#vor-dem-freischalten-der-registrierung)). Bis dahin bleibt in LinuxServerSetup `vereint_signup_enabled: false` ([Schritt 6](betrieb/strato.md#6-rechtliches-vor-dem-öffnen-für-andere)); Einladungslinks funktionieren trotzdem | [#63](https://github.com/damaurer/vereint/issues/63) |
| Regel für Barcode-Käufe (Scannen nur bei laufenden Events, an denen das Mitglied teilnimmt) bestätigen | [#67](https://github.com/damaurer/vereint/issues/67) |
| Keycloak-Login-Theme: FTL-Vorlagen mit der laufenden Keycloak-Version abgleichen ([keycloak/README.md](../keycloak/README.md#produktion)) | [#72](https://github.com/damaurer/vereint/issues/72) |
| Bildschirmfotos im Handbuch erneuern und ergänzen (aufnehmen mit [`scripts/handbook`](../scripts/handbook/)) | [#70](https://github.com/damaurer/vereint/issues/70) |

## Bekannte Grenzen der App

| Punkt | Stand |
| :--- | :--- |
| Push aus einer anderen Gruppe | Kommt eine Mitteilung aus einer anderen als der gerade gewählten Gruppe, zeigt das Gerät nur die neueste Mitteilung der gewählten Gruppe oder „Du hast eine neue Mitteilung“. |
| BeerWithMe Status | Im Profil nur eine Vorschau, wird nicht an andere übertragen. |
| Push für Chat-Nachrichten | Einzelne Chat-Nachrichten lösen keinen Push aus; neue Nachrichten zeigt der Ungelesen-Zähler am Chat. |
