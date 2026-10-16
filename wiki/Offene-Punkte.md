# Offene Punkte

Bekannte Lücken und nächste Schritte, Stand 16.10.2026. Erledigtes bitte hier
austragen.

| Punkt | Stand |
| :--- | :--- |
| Go-Live | In AWS ist noch nichts angelegt, auf `main` wurde noch nie ausgerollt. Schritte in der [Go-Live-Checkliste](Go-Live-Checkliste). |
| [Pull Request #27](https://github.com/damaurer/vereint/pull/27) | CI grün, wartet auf den Merge. Behebt den Rollback beim allerersten Deployment, beschreibt den ersten Administrator, schaltet „Passwort vergessen“ ab. |
| Prüfen nach dem Deployment | Barcode-Kamera, Web Push, Zwei-Faktor-Anmeldung und Video-Upload lassen sich erst unter echtem HTTPS am Handy prüfen. |
| Regel für Barcode-Käufe | Scannen nur bei laufenden Events, an denen das Mitglied teilnimmt. Diese Regel war ein gewählter Standard und ist noch nicht ausdrücklich bestätigt. |
| Keycloak-Login-Theme | Die vier FTL-Vorlagen basieren noch auf Keycloak 26.1.4 und laufen unter 26.8.1. Beim nächsten Theme-Umbau mit den 26.8.1-Originalen abgleichen ([keycloak/README.md](https://github.com/damaurer/vereint/blob/develop/keycloak/README.md#produktion)). |
| Rollen & Berechtigungen | Die Tabelle in der Administration ist noch eine Vorschau; Änderungen dort werden nicht gespeichert. Rollen vergibt man über *Bearbeiten* beim Mitglied. |
| BeerWithMe Status | Im Profil nur eine Vorschau, wird nicht an andere übertragen. |
| Push für Chat-Nachrichten | Einzelne Chat-Nachrichten lösen keinen Push aus; neue Nachrichten zeigt der Ungelesen-Zähler am Chat. |
| Arbeitsspeicher | Die Container-Grenzen summieren sich auf etwa 2,1 GB bei 2 GB RAM plus 2 GB Swap. Im Betrieb beobachten. |
