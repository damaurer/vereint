# Offene Punkte

Bekannte Lücken und nächste Schritte, Stand 16.10.2026. Erledigtes bitte hier
austragen.

| Punkt | Stand |
| :--- | :--- |
| Go-Live | In AWS ist noch nichts angelegt, auf `main` wurde noch nie ausgerollt. Schritte in der [Go-Live-Checkliste](betrieb/go-live-checkliste.md). |
| [Pull Request #27](https://github.com/damaurer/vereint/pull/27) | CI grün, wartet auf den Merge. Behebt den Rollback beim allerersten Deployment, beschreibt den ersten Administrator, schaltet „Passwort vergessen“ ab. |
| Prüfen nach dem Deployment | Barcode-Kamera, Web Push, Zwei-Faktor-Anmeldung und Video-Upload lassen sich erst unter echtem HTTPS am Handy prüfen. |
| Regel für Barcode-Käufe | Scannen nur bei laufenden Events, an denen das Mitglied teilnimmt. Diese Regel war ein gewählter Standard und ist noch nicht ausdrücklich bestätigt. |
| Keycloak-Login-Theme | Die vier FTL-Vorlagen basieren noch auf Keycloak 26.1.4 und laufen unter 26.8.1. Beim nächsten Theme-Umbau mit den 26.8.1-Originalen abgleichen ([keycloak/README.md](../keycloak/README.md#produktion)). |
| Rechtliches vor dem Eröffnen von Gruppen | Impressum, AGB, Datenschutzerklärung und Auftragsverarbeitung fehlen. Bis dahin in Produktion `/vereint/SIGNUP_ENABLED` auf `false` setzen ([deploy/README.md](../deploy/README.md#mehrere-gruppen)). |
| Online-Zahlung | Stripe ist noch nicht eingerichtet; ohne Stripe bleibt die Online-Zahlung aus, Tarife vergibt die Plattform-Administration von Hand ([abrechnung.md](domains/abrechnung.md#einrichtung)). |
| Push aus einer anderen Gruppe | Kommt eine Mitteilung aus einer anderen als der gerade gewählten Gruppe, zeigt das Gerät nur die neueste Mitteilung der gewählten Gruppe oder „Du hast eine neue Mitteilung“. |
| BeerWithMe Status | Im Profil nur eine Vorschau, wird nicht an andere übertragen. |
| Push für Chat-Nachrichten | Einzelne Chat-Nachrichten lösen keinen Push aus; neue Nachrichten zeigt der Ungelesen-Zähler am Chat. |
| Bildschirmfotos im Handbuch | Die Bilder zur Vorstandsübersicht und zum Menü *Mehr* zeigen noch den Stand vor den letzten Änderungen. Für Kiosk-Modus, Kiosk-Geräte, Moments mit Fotos und Videos, Gruppenauswahl, Gruppeneinstellungen und Tarife gibt es noch keine Bilder. Neu aufnehmen mit [`scripts/handbook`](../scripts/handbook/). |
| Arbeitsspeicher | Die Container-Grenzen summieren sich auf etwa 2,1 GB bei 2 GB RAM plus 2 GB Swap. Im Betrieb beobachten. |
