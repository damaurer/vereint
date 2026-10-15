# PWA und Push

Vereint ist eine **Progressive Web App**: Sie lässt sich auf Handy, Tablet und
Rechner wie eine App installieren („Zum Home-Bildschirm“), ohne App Store.

## Offline

Der Service Worker cached nur, was keine persönlichen Daten enthält:

- Programmcode, Schriften, Logo und Icons sind offline verfügbar.
- Seiten mit persönlichen Daten werden **nie** gecacht. Ohne Netz erscheint eine
  Offline-Seite.

## Web Push

- Einschalten **pro Gerät** im Profil oder auf der Mitteilungsseite.
- Gepusht werden Mitteilungen: Event-Einladungen und Erinnerungen, neue
  Moments sowie Rundbriefe und Nachrichten des Vorstands. Auf Event-Einladungen
  kann man direkt aus der Mitteilung zu- oder absagen. Einzelne Chat-Nachrichten
  lösen derzeit keinen Push aus.
- Pushes enthalten **keine Inhalte**. Google, Mozilla oder Apple sehen nur, dass
  es etwas Neues gibt. Das Gerät lädt die Mitteilung danach mit seiner Sitzung
  nach. Ohne gültige Sitzung erscheint nur „Du hast eine neue Mitteilung.“
- **iPhone und iPad:** Web Push gibt es nur in der installierten App (iOS 16.4
  oder neuer). Das Profil zeigt dafür eine Installationsanleitung.

## Betrieb

- Terraform erzeugt das VAPID-Schlüsselpaar und legt es unter `/vereint/VAPID_*`
  im Parameter Store ab. Push funktioniert in Produktion nach `terraform apply`
  und dem nächsten Deployment.
- Geht der Schlüssel verloren, ist nichts verloren: Geräte melden sich beim
  nächsten App-Start mit dem neuen Schlüssel an.
- Lokal ist Push standardmäßig aus (`VAPID_ENABLED=false`).

Mehr: [docs/frontend/angular-ssr-and-pwa.md](https://github.com/damaurer/vereint/blob/develop/docs/frontend/angular-ssr-and-pwa.md),
[docs/domains/chat-and-push-notifications.md](https://github.com/damaurer/vereint/blob/develop/docs/domains/chat-and-push-notifications.md)
