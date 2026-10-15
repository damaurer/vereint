# Funktionen

Überblick über alles, was die App heute kann. Wer was darf, steht unter
[Rollen und Berechtigungen](Rollen-und-Berechtigungen); Schritt-für-Schritt-
Anleitungen im [Benutzerhandbuch](Benutzerhandbuch).

## Start und Navigation

- Dashboard mit Guthaben, nächsten Events (direkt zu- oder absagen) und neuen
  Mitteilungen.
- Auf dem Handy eine Leiste unten mit *Start*, *Events*, *Chat*, *Guthaben* und
  *Mehr*; auf größeren Bildschirmen eine Seitennavigation.
- Hell, Dunkel oder Systemeinstellung im Profil; Sprache Deutsch oder Englisch.

## Events und Zusagen

- Vorstand und Administration legen Events über eine eigene Seite an
  (*Events → Neues Event*).
- Eingeladene Mitglieder werden benachrichtigt und können in der App oder direkt
  aus der Push-Mitteilung zu- oder absagen. Wann eingeladen und erinnert wird,
  ist je Event einstellbar.
- Jedes Event hat einen eigenen Chat für die Eingeladenen.
- Gäste ohne Konto können über einen Gast-Link zu einem einzelnen Event
  eingeladen werden.
- Fachliche Details: [docs/domains/events-and-invites.md](https://github.com/damaurer/vereint/blob/develop/docs/domains/events-and-invites.md)

## Chat und Mitteilungen

- Vereinschat, Direktnachrichten zwischen Mitgliedern und Event-Chats.
- Mitteilungen (Glocke oben) und Rundbriefe des Vorstands, auf Wunsch als
  Web-Push aufs Handy (siehe [PWA und Push](PWA-und-Push)).
- Nachrichten und Mitteilungen werden verschlüsselt gespeichert (siehe
  [Sicherheit und Verschlüsselung](Sicherheit-und-Verschluesselung)).

## Guthaben

- Jedes Mitglied hat ein Guthabenkonto in Euro mit vollständigem Verlauf
  (Käufe mit Getränke- bzw. Speisenname, Aufladungen, Korrekturen).
- Aufladen können Mitglieder **nicht selbst**. Vorstand und Administration buchen
  Guthaben in der Kasse über eine Mitgliederauswahl.
- Das Guthaben darf wie bei der Strichliste ins Minus gehen.
- Technisch ein unveränderliches Kassenbuch mit Idempotenzschlüssel gegen
  Doppelbuchungen: [docs/domains/ledger-and-finance.md](https://github.com/damaurer/vereint/blob/develop/docs/domains/ledger-and-finance.md)

## Bezahlen per Barcode

- Unter *Bezahlen* (Menü und Dashboard) scannt das Mitglied den EAN-Barcode des
  Getränks mit der Handykamera, alternativ per Eingabe.
- Nach Bestätigung von Getränk und Preis wird vom Guthaben abgebucht.
- Ein eigener Kauf lässt sich 10 Minuten lang rückgängig machen.
- Scannen geht nur bei einem laufenden Event, an dem das Mitglied teilnimmt.
- Die Kamera braucht HTTPS; lokal ohne Zertifikat funktioniert nur die Eingabe.

## Getränke- und Speisenkatalog

- Katalog mit Scan zuerst: Ein bekannter Barcode öffnet das Getränk, ein
  unbekannter das Formular zum Anlegen mit vorausgefülltem Code.
- Ein Formular für Anlegen, Vorschlagen und Bearbeiten mit Verkaufs- und
  Einkaufspreis und Marge (Einkaufspreis nur für Vorstand und Administration).
- Mitglieder können Getränke vorschlagen; der Vorstand gibt frei. Vom Vorstand
  angelegte Getränke sind sofort freigegeben.
- Statt Löschen gibt es den Schalter *Im Sortiment*. Warnungen bei doppeltem
  Barcode oder Namen.
- Je Event eine Auswahl aus dem Katalog (Subliste) mit eigenen Preisen.
- Details: [docs/domains/drink-catalog-and-sublists.md](https://github.com/damaurer/vereint/blob/develop/docs/domains/drink-catalog-and-sublists.md),
  [docs/domains/food-catalog-and-event-food.md](https://github.com/damaurer/vereint/blob/develop/docs/domains/food-catalog-and-event-food.md)

## Thekenterminal (Strichliste)

- Ein Tablet an der Theke mit eigenem Konto (Rolle *Terminal*): Mitglied wählen,
  Getränk antippen, fertig.
- Striche des Terminals lassen sich 10 Minuten lang rückgängig machen.
- Abendabschluss mit Bareinnahmen.
- Details: [docs/domains/tablet-strichliste-recorder.md](https://github.com/damaurer/vereint/blob/develop/docs/domains/tablet-strichliste-recorder.md)

## Moments

- Spontane gemeinsame Momente (z. B. Anstoßen) mit Rückmeldungen der
  Mitglieder, Bildern und einem verknüpften Chat.
- Details: [docs/domains/moments-and-rituals.md](https://github.com/damaurer/vereint/blob/develop/docs/domains/moments-and-rituals.md)

## Statistiken

- Für alle angemeldeten Mitglieder erreichbar: Verbrauch, Top-Listen,
  Anwesenheit.
- Details: [docs/domains/statistics-and-analytics.md](https://github.com/damaurer/vereint/blob/develop/docs/domains/statistics-and-analytics.md)

## Mitglieder per Einladungslink

- Vorstand und Administration erstellen Einladungslinks mit Bezeichnung,
  Gültigkeit (1, 7 oder 30 Tage) und Anzahl Nutzungen (1 bis 50).
- Die eingeladene Person registriert sich über den Link und ist danach normales
  Mitglied. Eine offene Selbstregistrierung gibt es nicht.
- Links sind zufällig, laufen ab und lassen sich zurückziehen; gespeichert wird
  nur ein Hash.
- Details: [docs/domains/member-invites.md](https://github.com/damaurer/vereint/blob/develop/docs/domains/member-invites.md)

## Verwaltung

- Vorstand: Events, Kasse, Kommunikation (Rundbriefe, Infotafel), Einladungen.
- Administration: Mitglieder, Rollen, Konten deaktivieren, Audit-Protokoll.
- In Formularen wird mit Namen gearbeitet, nicht mit rohen IDs.
