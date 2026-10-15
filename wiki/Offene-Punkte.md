# Offene Punkte

Bekannte Lücken und nächste Schritte. Erledigtes bitte hier austragen.

| Punkt | Stand |
| :--- | :--- |
| Go-Live | Noch nichts in AWS angelegt. Schritte in der [Go-Live-Checkliste](Go-Live-Checkliste). |
| Benutzerhandbuch | [Pull Request #14](https://github.com/damaurer/vereint/pull/14) ist fertig und wartet auf Review ([Benutzerhandbuch](Benutzerhandbuch)). Nur die Tabelle „Rollen & Berechtigungen“ ist noch als Vorschau markiert. Nach [Pull Request #20](https://github.com/damaurer/vereint/pull/20) sind die Bildschirmfotos von „Letzte Aktionen“ und dem Mehr-Menü neu aufzunehmen. |
| Ungelesen-Zähler im Chat-Tab | Fehlt. Der Fachservice speichert für Chats noch keinen Lesestatus; dafür ist zuerst eine Änderung im Datenmodell nötig. |
| Keycloak-Login-Theme | Die vier FTL-Vorlagen basieren noch auf Keycloak 26.1.4 und laufen unter 26.8.1. Beim nächsten Theme-Umbau mit den 26.8.1-Originalen abgleichen ([keycloak/README.md](https://github.com/damaurer/vereint/blob/develop/keycloak/README.md#produktion)). |
| Barcode-Kamera | Lässt sich erst nach dem Deployment unter HTTPS am Handy prüfen. |
| Regel für Barcode-Käufe | Scannen nur bei laufenden Events, an denen das Mitglied teilnimmt. Diese strengere Regel war ein gewählter Standard und ist noch nicht ausdrücklich bestätigt. |
| `README.md` und Teile von `docs/` | Erwähnen teils noch MinIO als Produktionsspeicher und ältere Startbefehle. Maßgeblich für den Betrieb sind `deploy/README.md` und `infra/aws/README.md`. |
