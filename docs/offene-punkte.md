# Offene Punkte

Bekannte Lücken und nächste Schritte, Stand 16.10.2026. Erledigtes bitte hier
austragen.

| Punkt | Stand |
| :--- | :--- |
| Go-Live | Geplant ist ein Strato VPS; noch ist kein Server bestellt, auf `main` wurde noch nie ausgerollt. Schritte in [Betrieb auf einem Strato VPS](betrieb/strato.md#checkliste-für-den-go-live) (AWS-Variante: [Go-Live-Checkliste](betrieb/go-live-checkliste.md)). |
| Prüfen nach dem Deployment | Barcode-Kamera, Web Push, Zwei-Faktor-Anmeldung und Video-Upload lassen sich erst unter echtem HTTPS am Handy prüfen. |
| Regel für Barcode-Käufe | Scannen nur bei laufenden Events, an denen das Mitglied teilnimmt. Diese Regel war ein gewählter Standard und ist noch nicht ausdrücklich bestätigt. |
| Keycloak-Login-Theme | Die vier FTL-Vorlagen basieren noch auf Keycloak 26.1.4 und laufen unter 26.8.1. Beim nächsten Theme-Umbau mit den 26.8.1-Originalen abgleichen ([keycloak/README.md](../keycloak/README.md#produktion)). |
| Rechtliches vor dem Eröffnen von Gruppen | Impressum und AGB gibt es als Seiten, aber nur als Entwurf: Die Betreiberangaben in `webservice/src/app/legal/legal-operator.ts` sind Platzhalter, die Texte sind nicht anwaltlich geprüft. Datenschutzerklärung, Vertrag zur Auftragsverarbeitung und ein Kündigungsbutton für Verbraucher fehlen ([rechtliches.md](domains/rechtliches.md#vor-dem-freischalten-der-registrierung)). Bis dahin in Produktion `/vereint/SIGNUP_ENABLED` auf `false` setzen ([deploy/README.md](../deploy/README.md#mehrere-gruppen)). |
| Push aus einer anderen Gruppe | Kommt eine Mitteilung aus einer anderen als der gerade gewählten Gruppe, zeigt das Gerät nur die neueste Mitteilung der gewählten Gruppe oder „Du hast eine neue Mitteilung“. |
| BeerWithMe Status | Im Profil nur eine Vorschau, wird nicht an andere übertragen. |
| Push für Chat-Nachrichten | Einzelne Chat-Nachrichten lösen keinen Push aus; neue Nachrichten zeigt der Ungelesen-Zähler am Chat. |
| Bildschirmfotos im Handbuch | Für Moments mit Fotos und Videos, die Seite *Gruppe wählen* und den Beitritt mit bestehendem Konto gibt es noch keine Bilder. Aufnehmen mit [`scripts/handbook`](../scripts/handbook/). |
| Arbeitsspeicher | Die Container-Grenzen summieren sich auf etwa 2,1 GB bei 2 GB RAM plus 2 GB Swap. Im Betrieb beobachten. |
