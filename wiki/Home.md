# Vereint – Wiki

**Vereint** ist die App für unseren Verein: Events mit Zu- und Absagen, Vereinschat
und Direktnachrichten, Guthaben statt Bargeld, Bezahlen per Barcode-Scan, die
digitale Strichliste am Thekenterminal, Moments, Statistiken und Einladungen per
Link. Sie läuft als installierbare Web-App (PWA) auf Handy, Tablet und Rechner.

Dieses Wiki ist der Einstieg. Es fasst zusammen, wie die App aufgebaut ist, wie
sie betrieben, ausgerollt und gesichert wird, und verlinkt für Details auf die
Dokumentation im Repository.

> Die Seiten liegen im Repository unter [`wiki/`](https://github.com/damaurer/vereint/tree/develop/wiki)
> und werden bei jedem Merge nach `develop` automatisch hierher übertragen.
> Änderungen bitte dort per Pull Request machen, nicht direkt im Wiki.

## Überblick

| Seite | Inhalt |
| :--- | :--- |
| [Funktionen](Funktionen) | Was die App kann, Bereich für Bereich |
| [Rollen und Berechtigungen](Rollen-und-Berechtigungen) | Mitglied, Vorstand, Administration, Terminal |
| [Architektur](Architektur) | Komponenten, Datenfluss, Technologien |
| [Lokale Entwicklung](Lokale-Entwicklung) | Projekt auf dem eigenen Rechner starten |
| [Branches und CI](Branches-und-CI) | `develop`, `qs`, `main`, Prüfungen vor jedem Merge |
| [E2E-Tests](E2E-Tests) | Playwright-Tests gegen den echten Stack |
| [AWS-Infrastruktur und Kosten](AWS-Infrastruktur-und-Kosten) | Terraform, Server, Budget |
| [Deployment und Rollback](Deployment-und-Rollback) | Automatisches Ausrollen, Health Check, Zurückrollen |
| [Sicherheit und Verschlüsselung](Sicherheit-und-Verschluesselung) | Verschlüsselung, Secrets, Härtung |
| [Backups und Wiederherstellung](Backups-und-Wiederherstellung) | Nächtliche Backups, Snapshots, Restore |
| [Go-Live-Checkliste](Go-Live-Checkliste) | Was vor dem ersten Produktivbetrieb von Hand zu tun ist |
| [Mehrsprachigkeit](Mehrsprachigkeit) | Sprachen, neue Sprache hinzufügen |
| [PWA und Push](PWA-und-Push) | Installieren, Offline, Web Push |
| [Benutzerhandbuch](Benutzerhandbuch) | Anleitungen je Rolle |
| [Offene Punkte](Offene-Punkte) | Bekannte Lücken und nächste Schritte |
| [Weitere Dokumentation](Weitere-Dokumentation) | Wegweiser in `docs/` |

## Das Wichtigste in fünf Sätzen

1. Gearbeitet wird auf `develop`; jeder Pull Request nach `develop`, `qs` oder
   `main` muss Tests, Sicherheitsscans und E2E-Tests bestehen.
2. Jeder Merge nach `main` rollt automatisch auf einen einzelnen AWS-Server in
   Frankfurt aus, mit Datenbank-Backup vorher, Health Check danach und
   automatischem Rollback bei Fehlern.
3. Chat-Nachrichten, Benachrichtigungen und Bilder werden in der App mit
   AES-256-GCM verschlüsselt, bevor sie in der Datenbank oder in S3 landen.
4. Backups laufen jede Nacht, werden vor dem Hochladen probeweise
   wiederhergestellt und verschlüsselt abgelegt.
5. `BACKUP_ENCRYPTION_KEY` und `DATA_ENCRYPTION_KEY` müssen zusätzlich offline
   aufbewahrt werden. Ohne sie sind Backups bzw. verschlüsselte Inhalte nicht mehr
   lesbar.
