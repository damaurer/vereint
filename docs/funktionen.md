# Funktionen

Überblick über alles, was die App heute kann. Wer was darf, steht unter
[Rollen und Berechtigungen](rollen-und-berechtigungen.md); Schritt-für-Schritt-
Anleitungen im [Benutzerhandbuch](handbuch/README.md).

## Gruppen

- Eine Installation trägt beliebig viele **Gruppen** (Stammtisch, Verein, Team
  oder jede andere Gemeinschaft). Ein Konto kann Mitglied in mehreren Gruppen
  sein; über *Gruppe wechseln* bzw. die Seite *Gruppe wählen* (`/gruppen`)
  wechselt man zwischen ihnen.
- Alles Fachliche gehört genau einer Gruppe: Events, Chats, Guthaben, Katalog,
  Moments, Mitteilungen, Einladungen, Kiosk-Geräte, Protokoll und Statistik. Die
  Trennung sichern Anwendung und Datenbank (Row-Level-Security) doppelt ab.
- Eigene Gruppe eröffnen unter *Eigene Gruppe eröffnen* (`/gruppe-eroeffnen`):
  Gruppenname und Konto in einem Schritt, die Person wird Admin. Höchstens drei
  eigene Gruppen pro Person.
  Der Betreiber kann das Eröffnen abschalten (`SIGNUP_ENABLED`); Einladungslinks
  funktionieren dann weiter.
- *Gruppeneinstellungen*: Name und Bild der Gruppe, Rollen und Berechtigungen,
  Datenexport, Gruppe verlassen.
- Die Plattform-Administration (Vereint-Team) legt unter `/plattform` Gruppen an,
  und archiviert sie.
- Details: [docs/domains/stammtische.md](domains/stammtische.md)

## Kosten

Vereint ist kostenlos und Open Source (AGPL-3.0). Es gibt keine Tarife, keine
Online-Zahlung und keine Grenzen für Mitglieder, Speicher, Videos oder
Thekenterminals.

## Start und Navigation

- Dashboard mit Guthaben, nächsten Events (direkt zu- oder absagen) und neuen
  Mitteilungen.
- Auf dem Handy eine Leiste unten mit *Start*, *Events*, *Chat*, *Guthaben* und
  *Mehr*, am Tablet dieselben Einträge in einer schmalen Leiste links, am
  Rechner eine Seitenleiste mit allen Bereichen.
- Hell, Dunkel oder Systemeinstellung im Profil; Sprache Deutsch oder Englisch.
- Freiwillige Zwei-Faktor-Anmeldung mit einer Authenticator-App, im Profil unter *Sicherheit*.

## Events und Zusagen

- Vorstand und Administration legen Events über eine eigene Seite an
  (*Events → Neues Event*).
- Eingeladene Mitglieder werden benachrichtigt und können in der App oder direkt
  aus der Push-Mitteilung zu- oder absagen. Wann eingeladen und erinnert wird,
  ist je Event einstellbar.
- Jedes Event hat einen eigenen Chat für die Eingeladenen.
- Gäste ohne Konto können über einen Gast-Link zu einem einzelnen Event
  eingeladen werden.
- Fachliche Details: [docs/domains/events-and-invites.md](domains/events-and-invites.md)

## Chat und Mitteilungen

- Gruppenchat, Event-Chats und Direktnachrichten, mit Zähler für ungelesene Nachrichten am Chat-Eintrag.
- Direktnachrichten sind gruppenübergreifend: ein Gespräch je Person, schreiben
  darf man Freunden und Personen aus den eigenen Gruppen.
- Mitteilungen (Glocke oben) und Rundbriefe des Vorstands, auf Wunsch als
  Web-Push aufs Handy (siehe [PWA und Push](frontend/angular-ssr-and-pwa.md)).
- Nachrichten und Mitteilungen werden verschlüsselt gespeichert (siehe
  [Sicherheit und Verschlüsselung](betrieb/sicherheit-und-schluessel.md)).

## Kalender und Freunde

- Persönlicher Kalender (*Mehr → Kalender*): vergangene und kommende Events
  sowie Moments aus allen eigenen Gruppen, je Monat, mit Gruppenfilter. Jeder
  Eintrag zeigt seine Gruppe; Events und Moments bleiben Teil ihrer Gruppe.
- Freundesliste (*Mehr → Freunde*) über alle Gruppen: Anfrage und Annahme, nur
  an Personen mit gemeinsamer Gruppe. Freundschaften bleiben, wenn jemand eine
  Gruppe verlässt.
- Web-Push für neue Direktnachrichten, Freundschaftsanfragen und angenommene
  Anfragen, unabhängig von der gewählten Gruppe.
- Fachliche Details: [docs/domains/kalender-freunde-direktnachrichten.md](domains/kalender-freunde-direktnachrichten.md)

## Guthaben

- Jedes Mitglied hat ein Guthabenkonto in Euro mit vollständigem Verlauf
  (Käufe mit Getränke- bzw. Speisenname, Aufladungen, Korrekturen).
- Aufladen können Mitglieder **nicht selbst**. Vorstand und Administration buchen
  Guthaben in der Kasse über eine Mitgliederauswahl.
- Das Guthaben darf wie bei der Strichliste ins Minus gehen.
- Technisch ein unveränderliches Kassenbuch mit Idempotenzschlüssel gegen
  Doppelbuchungen: [docs/domains/ledger-and-finance.md](domains/ledger-and-finance.md)

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
- Gemeinsame **Getränkedatenbank** aller Gruppen (ohne Preise und Bilder): unter
  *Aus der Getränkedatenbank* übernimmt man ein Getränk und setzt den eigenen
  Preis; eigene freigegebene Getränke lassen sich dorthin teilen. *Barcode
  scannen* im Katalog sucht einen unbekannten Code auch dort und füllt
  *Getränk anlegen* damit vor (nur der Preis fehlt noch). Ab Werk
  enthält sie über 1.200 Getränke von mehr als 130 deutschen Brauereien und
  Herstellern (Migrationen 017/018).
- Details: [docs/domains/drink-catalog-and-sublists.md](domains/drink-catalog-and-sublists.md),
  [docs/domains/food-catalog-and-event-food.md](domains/food-catalog-and-event-food.md)

## Thekenterminal (Strichliste)

- Ein Tablet an der Theke mit eigenem Konto (Rolle *Terminal*): Mitglied wählen,
  Getränk antippen, fertig.
- **Kiosk-Modus**: Beim Start vergibt das Gerät eine eigene PIN (4 bis 8 Ziffern).
  Danach bleibt es auf der Strichliste, auch nach Neuladen oder Neustart der App,
  und lässt sich nur mit dieser PIN verlassen. Nach 5 Fehlversuchen ist die
  Eingabe zeitweise gesperrt. Vorstand und Administration entsperren jedes Gerät
  unter *Vorstand → Kiosk-Geräte* auch ohne PIN.
- Striche des Terminals lassen sich 10 Minuten lang rückgängig machen.
- Abendabschluss mit Bareinnahmen.
- Details: [docs/domains/tablet-strichliste-recorder.md](domains/tablet-strichliste-recorder.md)

## Moments

- Spontane gemeinsame Momente (z. B. Anstoßen) mit Rückmeldungen der
  Mitglieder, freiwilligem Standort auf einer Karte und einem verknüpften Chat.
- Bis zu vier Fotos oder Videos je Beitrag. Videos höchstens 60 Sekunden und
  100 MB (MP4/MOV). Standort- und Gerätedaten werden entfernt, alles wird
  verschlüsselt gespeichert.
- Welche Moment-Typen und Reaktionen es gibt, legt der Vorstand unter
  *Vorstand → Moments · Typen & Reaktionen* fest.
- Details: [docs/domains/moments-and-rituals.md](domains/moments-and-rituals.md)

## Statistiken

- Für alle angemeldeten Mitglieder erreichbar: Verbrauch, Top-Listen,
  Anwesenheit.
- Details: [docs/domains/statistics-and-analytics.md](domains/statistics-and-analytics.md)

## Mitglieder per Einladungslink

- Wer Mitglieder einladen darf (Vorstand und Admin), erstellt Einladungslinks
  der Gruppe mit Bezeichnung, Gültigkeit (1, 7 oder 30 Tage) und Anzahl
  Nutzungen (1 bis 50).
- Neue Personen registrieren sich über den Link und sind danach Mitglied der
  Gruppe. Wer schon ein Konto hat, öffnet den Link angemeldet und tritt mit
  *Dieser Gruppe beitreten* bei. In eine bestehende Gruppe kommt man nur per
  Einladung.
- Links sind zufällig, laufen ab und lassen sich zurückziehen; gespeichert wird
  nur ein Hash.
- Details: [docs/domains/member-invites.md](domains/member-invites.md)

## Rechtliches

- Impressum (`/impressum`) und AGB mit Widerrufsbelehrung (`/agb`) sind
  öffentliche Seiten ohne Anmeldung. Links stehen auf der Anmeldeseite, auf den
  öffentlichen Seiten, unten in der Seitenleiste und im Menü *Mehr*.
- Wer sich per Einladungslink registriert oder eine Gruppe eröffnet, stimmt
  den AGB per Häkchen zu; Fassung und Zeitpunkt werden am Konto gespeichert.
- Die Betreiberangaben sind noch Platzhalter; solange zeigen beide Seiten den
  Hinweis „Entwurf“. Datenschutzerklärung und Auftragsverarbeitung fehlen noch.
- Details: [docs/domains/rechtliches.md](domains/rechtliches.md)

## Verwaltung

- Vorstand: Events, Kasse, Kommunikation (Rundbriefe, Infotafel), Einladungen,
  Moment-Typen und Reaktionen, Kiosk-Geräte. Die Übersicht zeigt unter
  *Letzte Aktionen* das Protokoll mit Namen.
- Administration: Mitglieder, Konten deaktivieren, Audit-Protokoll. Rollen,
  auch eigene, weist man unter *Administration → Bearbeiten → Rollen* zu;
  anlegen und zuschneiden lassen sie sich unter *Gruppeneinstellungen →
  Rollen & Berechtigungen*.
- In Formularen und Protokollen wird mit Namen gearbeitet, nicht mit rohen IDs.
- Passwort vergessen: Vereint verschickt keine E-Mails, die Anmeldeseite zeigt
  deshalb keinen Link dafür. Wer Zugang zur Keycloak-Verwaltung hat (meist der
  Betreiber), setzt ein vorläufiges Passwort.
