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
  Der Betreiber schaltet das Eröffnen bewusst ein (`SIGNUP_ENABLED=true`,
  standardmäßig aus); Einladungslinks funktionieren auch ohne.
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
- Startdialog *Vereint einrichten* beim ersten Öffnen nach der Anmeldung, einmal
  pro Gerät (nicht im Kiosk-Modus): erklärt, dass Vereint auf den
  Home-Bildschirm gehört (nur dort Push auf iPhone/iPad), bietet *Installieren*
  bzw. die iPhone-Anleitung an und holt per Knopf die Erlaubnis für
  Mitteilungen, Kamera (Strichcode scannen) und Standort (Moments). Was dort
  nicht erlaubt wird, fragt Vereint beim Start nie wieder; der Browser fragt
  erst, wenn die Funktion benutzt wird. Läuft Vereint schon installiert und ist
  alles entschieden, erscheint der Dialog nicht.

## Events und Zusagen

- Vorstand und Administration legen Events über eine eigene Seite an
  (*Events → Neues Event*).
- Eingeladene Mitglieder werden benachrichtigt und können in der App oder direkt
  aus der Push-Mitteilung zu- oder absagen. Wann eingeladen und erinnert wird,
  ist je Event einstellbar.
- Jedes Event hat einen eigenen Chat für die Eingeladenen; alle Termine einer
  Serie teilen sich einen Chat.
- Wiederkehrende Events (Serien, angelehnt an RFC 5545 `RRULE`): täglich,
  werktags, wöchentlich an einem oder mehreren Wochentagen, alle N Tage/Wochen/
  Monate/Jahre, monatlich am Tag X oder am letzten Tag, monatlich am n-ten bzw.
  letzten Wochentag (auch mehrere, z. B. 1. und 3. Donnerstag), jährlich am
  Datum oder am n-ten Wochentag eines Monats. Ende nie, nach Anzahl oder am
  Datum. Einzelne Termine auslassen, zusätzliche Termine ergänzen oder nur
  eigene, unregelmäßige Termine wählen. Vorschau der nächsten Termine schon
  beim Anlegen. Jeder Termin ist ein eigenes Event mit eigener Zu-/Absage,
  eigener Erinnerung, eigener Statistik und eigenem Eintrag im Kalender. Der
  Chat gehört der ganzen Serie: Wer zu irgendeinem Termin eingeladen ist oder
  einen ausrichtet, schreibt dort mit, auch nachdem die Serie mit „dieser und
  alle folgenden“ geteilt wurde. Er bleibt offen, solange ein Termin nicht
  abgesagt ist. Gäste eines Termins sehen nur Nachrichten ab ihrer Einladung; alle Termine beginnen zur selben Ortszeit (Europe/Berlin, auch über
  die Zeitumstellung). Angelegt werden die Termine der nächsten 12 Monate,
  höchstens 26 kommende je Serie; ein Hintergrundjob legt alle 6 Stunden nach.
  Die Einladung geht je Termin N Tage vorher hinaus (Standard 7).
- In der Eventliste steht jede Serie nur einmal, mit dem Hinweis
  **Wiederkehrend**: unter **Kommend** der laufende oder nächste Termin, unter
  **Vergangen** der zuletzt vergangene. Die Vorstandsübersicht
  (**Gastgeber · Events**) zeigt ebenfalls nur den aktuellen Termin je Serie,
  mit Wiederholungssymbol. Der Kalender zeigt weiterhin jeden Termin, die
  Eventseite die nächsten Termine der Serie.
- Ändern wie im Kalender: **nur dieser Termin**, **dieser und alle folgenden**
  (die Serie wird geteilt) oder **alle kommenden Termine**. Vergangene und
  einzeln geänderte Termine bleiben unverändert. Fällt ein Termin durch eine
  neue Regel weg, wird er gelöscht; hat dort schon jemand geantwortet,
  gebucht oder einen Moment gestartet, wird er stattdessen abgesagt (der Chat
  gehört der Serie und bleibt).
  Absagen mit „dieser und alle folgenden“ beendet die Serie. Getränke und
  Speisen eines Termins lassen sich in alle folgenden übernehmen, neue Termine
  übernehmen sie vom letzten Termin. Einladungen können für alle folgenden
  Termine gelten; bei „alle Mitglieder“ kommen neue Mitglieder automatisch dazu.
  Aus einem einzelnen Event wird über **Wiederholung** nachträglich eine Serie.
- Gäste ohne Konto können über einen Gast-Link zu einem einzelnen Event
  eingeladen werden.
- Fachliche Details: [docs/domains/events-and-invites.md](domains/events-and-invites.md)

## Chat und Mitteilungen

- Alle Chats auf einer Seite wie bei bekannten Messengern: Gruppenchats und Event-Chats aller eigenen Gruppen und die Direktnachrichten in einer Liste, neueste Nachricht zuerst, mit Vorschau, Uhrzeit und Ungelesen-Zahl. Laufende Moment-Chats (24 Stunden nach dem Start) stehen mit in der Liste. Suche und Filter (Alle, Ungelesen, Gruppen, Events, Direkt, Moments) statt Unterseiten. Chats anderer Gruppen öffnen, ohne die Gruppe zu wechseln. Am Handy öffnet ein Chat im Vollbild, am Rechner steht er neben der Liste.
- „Neue Nachricht“ fragt zuerst die Art (Gruppe, Event, Direktnachricht, Moment) und dann das Ziel: eine eigene Gruppe, ein Event, zu dem man eingeladen ist, oder eine Person aus den eigenen Gruppen bzw. der Freundesliste. „Moment“ startet einen Moment und öffnet danach seinen Chat.
- Fotos und kurze Videos in allen Chats (Gruppe, Event, Moment, Direktnachricht): bis zu 4 je Nachricht, Text freiwillig, mit denselben Grenzen und derselben Verschlüsselung wie bei Moments (Fotos bis 10 MB und im Browser verkleinert, Videos MP4/MOV bis 60 Sekunden und 100 MB, Ort und Kameradaten entfernt). Abruf nur über den berechtigungsgeprüften Endpunkt; Videos mit Spulen (HTTP-Range). Nicht gesendete Uploads löscht der Server nach 6 Stunden. Vorschau und Push zeigen „📷 Foto“ bzw. „🎥 Video“.
- Alle Emojis für Nachrichten und Reaktionen: Auswahl mit „Zuletzt verwendet“, Reitern je Unicode-Gruppe und Suche (englische Namen); fünf schnelle Reaktionen bleiben. Die vom Vorstand festgelegten Moment-Reaktionen ändern sich dadurch nicht.
- Zähler für ungelesene Nachrichten am Chat-Eintrag, über alle eigenen Chats.
- Live: Neue Nachrichten, Reaktionen und Mitteilungen erscheinen sofort, ohne Neuladen; Zähler gleichen sich über alle eigenen Geräte ab.
- Haken wie bei bekannten Messengern an eigenen Nachrichten: einer = gesendet, zwei = zugestellt (auf einem Gerät angekommen), zwei farbige = gelesen. In Gruppen- und Event-Chats wechseln die Haken erst, wenn alle Empfänger so weit sind; ein Antippen bzw. Darüberfahren zeigt „Zugestellt an 3 von 5, gelesen von 2“.
- Nachrichten-Info wie bei bekannten Messengern: Eine eigene Nachricht im Gruppen-, Event- oder Moment-Chat antippen (am Rechner auch Rechtsklick) und **Info** wählen. Die Info zeigt je Person, ob die Nachricht **gelesen**, **zugestellt** oder **noch nicht zugestellt** ist (ohne Uhrzeit, weil der Stand je Chat und nicht je Nachricht gespeichert wird). Nur die Absenderin sieht sie.
- „… schreibt…“ über dem Eingabefeld, solange jemand im offenen Chat tippt (Gruppen-, Event-Chat und Direktnachrichten).
- Offline schreiben: Ohne Netz wartet eine Nachricht mit Uhr-Symbol auf dem Gerät und geht automatisch hinaus, sobald das Netz zurück ist, auch nach einem Neuladen der App. Doppelt kommt sie dabei nie an. Lehnt der Server sie ab (z. B. Event abgesagt), lässt sie sich erneut senden oder verwerfen. Beim Abmelden wird die Warteschlange geleert.
- Der Event-Chat auf der Eventseite ist derselbe Verlauf wie unter *Chat*, mit Reaktionen, Haken und Tipp-Anzeige.
- Zu- und Absagen stehen im Event-Chat als Hinweiszeile, grün für „hat zugesagt“, rot für „hat abgesagt“ (bei Serien mit dem Termin). Sie lösen keinen Push aus und zählen nicht als ungelesen. Unter jeder Nachricht steht klein wie die Haken, ob die Person für den Termin, für den sie schrieb, zu- oder abgesagt hat (bei Serien der damals nächste Termin). Die Anzeige zeigt die aktuelle Antwort, fehlt ohne Zu- oder Absage (auch bei „Vielleicht“) und verschwindet, sobald der Termin vorbei ist.
- Web-Push für neue Nachrichten im Gruppenchat und in Event-Chats (Absender und Text, je Chat eine Benachrichtigung). Pushes aus anderen Gruppen zeigen ihren Inhalt, und ein Tipp darauf wechselt in die Gruppe.
- Direktnachrichten sind gruppenübergreifend: ein Gespräch je Person, schreiben
  darf man Freunden und Personen aus den eigenen Gruppen.
- Mitteilungen (Glocke oben) und Rundbriefe des Vorstands, auf Wunsch als
  Web-Push aufs Handy (siehe [PWA und Push](frontend/angular-ssr-and-pwa.md)).
- Nachrichten und Mitteilungen werden verschlüsselt gespeichert (siehe
  [Sicherheit und Verschlüsselung](betrieb/sicherheit-und-schluessel.md)).

## Melden und Blockieren

- Fremde Chatnachrichten, Direktnachrichten, Moments und Antworten auf Moments
  lassen sich melden (Grund und freiwillige Notiz). Im Chat über die
  Reaktions-Auswahl einer Nachricht (**Melden oder blockieren**), bei Moments
  über **Melden**.
- Meldungen zu Inhalten einer Gruppe gehen an ihre Verwaltung
  (`chat.moderate` oder `members.manage`) unter **Vorstand → Meldungen**
  (`/meldungen`, mit Zahl offener Meldungen). Meldungen zu Direktnachrichten
  gehen an die Plattform-Administration (`/plattform/meldungen`). Bearbeiten:
  Inhalt entfernen oder ohne Folgen schließen; beides steht im Audit-Log.
- Blockieren gilt über alle Gruppen: Nachrichten, Moments und Antworten der
  Person sind ausgeblendet, Push von ihr kommt nicht mehr, Direktnachrichten
  und Freundschaftsanfragen sind in beide Richtungen gesperrt, eine
  Freundschaft endet. Die Person erfährt es nicht. Aufheben im Profil unter
  **Blockierte Personen**.
- Fachliche Details: [docs/domains/melden-und-blockieren.md](domains/melden-und-blockieren.md)

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
- Die Notiz, die die Kasse beim Ein- oder Auszahlen angibt, steht dezent unter der
  Buchung: im eigenen Verlauf des Mitglieds und im Verlauf in der Kasse. Andere
  Mitglieder sehen sie nicht.
- Das Guthaben darf wie bei der Strichliste ins Minus gehen.
- Technisch ein unveränderliches Kassenbuch mit Idempotenzschlüssel gegen
  Doppelbuchungen: [docs/domains/ledger-and-finance.md](domains/ledger-and-finance.md)

## Runden

- Im laufenden Event gibt jede Person **am eigenen Handy** eine Runde aus
  (*Event → Runde ausgeben*): **Eine Runde** (ein Getränk je Person) oder
  **Ganzen Abend** (bis zu einer Höchstsumme), für ein Getränk oder alle,
  gültig 30 Minuten, 1 Stunde oder bis Event-Ende, für angehakte Personen.
- Abgebucht wird erst, was die Eingeladenen an der Theke wirklich nehmen, und
  zwar vom Guthaben des Gebers (darf ins Minus gehen). Sind Personen in
  mehreren Runden, gilt die zuerst gestartete. Eine Runde auf ein Getränk gilt
  auch für Getränke derselben Strich-Kategorie.
- Eingeladene bekommen eine Mitteilung. Eigene Runden lassen sich vorzeitig
  beenden; Rückgängig am Terminal bucht dem Geber zurück und gibt den Platz
  wieder frei. Im Kontoauszug des Gebers steht „Runde: Name · Getränk“.

## Bezahlen per Barcode oder aus dem Katalog

- Unter *Buchen* (Menü, Guthaben und Dashboard) scannt das Mitglied den EAN-Barcode des
  Getränks mit der Handykamera, alternativ per Eingabe.
- Alternativ wählt es oben *Aus Katalog wählen* und tippt das Getränk in einer
  durchsuchbaren Liste an (Issue #122). Die Liste zeigt nur Getränke aus dem
  Katalog der eigenen Gruppe, die freigegeben, im Sortiment und mit Preis
  sind, auch solche ohne Barcode. Danach geht es genau wie nach einem Scan
  weiter (gleiche Wahl, Buchung, Statistik und 10 Minuten Rückgängig).
- Nach Bestätigung von Getränk und Preis wird vom Guthaben abgebucht.
- Ein eigener Kauf lässt sich 10 Minuten lang rückgängig machen.
- Bei einem laufenden Event mit Selbstbedienung, an dem das Mitglied
  teilnimmt, läuft der Kauf über das Event (Event- oder Kategoriepreis).
- Sonst wählt das Mitglied nach dem Scan bzw. der Auswahl:
  - *Mit Guthaben bezahlen*: Preis aus dem Katalog der Gruppe, ohne Event;
    nur, wenn das Getränk dort einen Preis hat. Mit dem Haken *In die
    Statistik aufnehmen* lässt sich der Kauf aus der Statistik heraushalten.
  - *Nur in die Statistik (Fremdgetränk)*: Es wird nichts abgebucht. Das
    Getränk zählt in der eigenen und der Gruppenstatistik, bei keinem Event.
    Es darf auch nur in der Getränkedatenbank stehen. Entfernen geht
    10 Minuten lang.
- Ist die Statistik für die Person oder die Gruppe aus, gibt es das
  Fremdgetränk nicht; bezahlen geht weiter.
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
- Jedes Getränk kann einer Strich-Kategorie zugeordnet werden; deren Preis
  überschreibt im Event den Preis des Getränks (siehe Thekenterminal).
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

- Ein Tablet an der Theke mit eigenem Konto (Rolle *Terminal*). Die Strichliste
  sieht aus wie auf Papier: eine Zeile je Mitglied, eine Spalte je
  **Strich-Kategorie** (z. B. Bier, Alkoholfrei). Ein Tipp ins Feld bucht einen
  Strich; die Striche stehen als Fünferbündel mit Zahl im Feld.
- Jeder Strich nennt Getränk und Kategorie: Bei mehreren Getränken in der
  Kategorie fragt das Terminal kurz nach, bei nur einem bucht es sofort. Die
  Spalte *Sonstiges* öffnet Getränke ohne Kategorie und Speisen.
- Strich-Kategorien mit Preis je Strich und Reihenfolge pflegt der Vorstand
  unter *Getränkekatalog → Strich-Kategorien*. Im Event gilt: Kategoriepreis,
  sonst Preis aus dem Event (Getränkeliste), sonst Preis des Getränks. Das gilt
  am Terminal und beim Bezahlen per Barcode.
- **Runden** zeigt das Terminal nur an: im Zeilenkopf „Runde von …“ bzw.
  „Abend von …“ und rechts die laufenden Runden mit Höchstsumme, Verbrauch,
  Eingelösten und Restzeit. Ausgegeben wird am eigenen Handy (siehe *Runden*).
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
- Weltkarte aller Moments (*Moments → Weltkarte*): ein Pin je Moment mit
  geteiltem Standort, laufende und abgeschlossene, mit derselben Sichtbarkeit
  wie die Liste. Moments am selben Ort (rund 100 m) teilen sich einen Pin, ein
  Tipp öffnet den Moment. Kacheln von OpenStreetMap, ohne API-Key; im dunklen
  Design abgedunkelt.
- Bis zu vier Fotos oder Videos je Beitrag. Videos höchstens 60 Sekunden und
  100 MB (MP4/MOV). Standort- und Gerätedaten werden entfernt, alles wird
  verschlüsselt gespeichert.
- Welche Moment-Typen und Reaktionen es gibt, legt der Vorstand unter
  *Vorstand → Moments* fest.
- Details: [docs/domains/moments-and-rituals.md](domains/moments-and-rituals.md)

## Statistiken

- Für alle Mitglieder der Gruppe sichtbar, mit Namen (AGB-Abschnitt
  „Statistiken“; setzt die Zustimmung zur aktuellen AGB-Fassung voraus).
- Zeitraum 30 Tage, 90 Tage oder laufendes Kalenderjahr, gilt für alle drei
  Seiten (`?zeitraum=30|90|jahr`).
- *Statistik*: Striche der Gruppe, eigene Striche, Platz, Rangliste,
  Zusagequote.
- *Getränkestatistik*: Getränke, Liter, Kalorien, Durchschnitte je Event, Tag,
  Woche und Monat; nach Mitglied (aufklappbar je Getränk) oder nach Getränk,
  sortiert nach Anzahl oder Kalorien.
- *Statistik-Übersicht*: Kennzahlen, Zusagen je Event und je Mitglied (mit
  „Da gewesen“), Getränke je Woche, Wochentag und Uhrzeit, „Wer trinkt was?“
  nach Kategoriegruppe, beliebteste Getränke, Anteil je Kategorie,
  Rundengeber, Moments, Chat und Rekorde. Umsatz nur mit Leserecht auf die
  Kasse (Vorstand, Kasse, Admin).
- Füllmenge und Kalorien je Portion stehen am Getränk (Katalog und
  Getränkedatenbank, für die Startdaten aus Open Food Facts vorbefüllt);
  Getränke ohne Angabe zählen bei Litern bzw. Kalorien nicht mit.
- Sechs Ebenen, alle mit Zeitraum außer der Event-Statistik:
  - *Meine Statistik* (`/statistik/ich`): alles, was ich ausgelöst habe, über
    alle meine Gruppen, aufgeschlüsselt nach Funktion und Gruppe. Nur für mich.
  - *Events übergreifend* (`/statistik/events`): alle Events meiner Gruppen,
    die ich sehen darf, mit Summen, Durchschnitten und meinen eigenen Werten,
    ohne Namen anderer Personen.
  - *Gruppenstatistik* (`/statistik` mit Getränkestatistik und Übersicht).
  - *Events der Gruppe* (`/statistik/gruppe/events`): alle Events der Gruppe
    zusammengefasst und im Vergleich.
  - *Event-Statistik* (`/events/:id/statistik`): Antworten, Anwesende,
    Striche, Runden, Moments, Reaktionen und Event-Chat eines Events, für alle,
    die das Event sehen dürfen.
  - *Funktionen* (`/statistik/funktionen`): je Funktion, wie oft sie
    ausgelöst und wie darauf geantwortet wurde.
- Erfasst werden Käufe und Striche (auch Kiosk, Barcode, Runden, Guthabenkäufe
  ohne Event), Fremdgetränke (nur Statistik, ohne Event), Aufladungen,
  Events, Zusagen, Moments mit Reaktionen und Bildern, Chatnachrichten und
  Chat-Reaktionen in Gruppen- und Event-Chats, Einladungslinks und Beitritte.
  Direktnachrichten werden nicht erfasst. Ein stornierter Kauf verschwindet
  wieder aus der Statistik.
- Drei Schalter, alle standardmäßig an: *Meine Statistik erfassen*
  (Mein Konto), *Statistik in dieser Gruppe* (Gruppeneinstellungen, Recht
  `stammtisch.manage`) und *Statistik für dieses Event* (Event anlegen und
  verwalten). Es gilt Nutzer vor Gruppe vor Event: Ist einer aus, wird nichts
  erfasst. Ausschalten wirkt ab sofort und löscht nichts.
- Löschen: *Meine erfassten Statistikdaten löschen* (Mein Konto, alle
  Gruppen) und *Statistikdaten der Gruppe löschen* (Gruppeneinstellungen).
  Beides verlangt eine Bestätigung und steht im Protokoll der Gruppe. Buchungen
  der Kasse und der Umsatz bleiben unberührt.
- Die Statistikdaten sind Teil des Gruppen-Exports.
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
- Fehlt einem Konto die Zustimmung zur aktuellen Fassung (vom Admin angelegte
  oder ältere Konten, neue AGB-Fassung), zeigt die App nach dem Login zuerst
  die Seite „Bitte stimme den AGB zu“; bis dahin sind nur Abmelden, Impressum
  und AGB erreichbar.
- Das eigene Konto löscht man selbst unter *Profil → Konto löschen* (siehe
  [Konto löschen](#konto-löschen)); AGB § 10 Abs. 3 nennt das.
- Die Betreiberangaben sind noch Platzhalter; solange zeigen beide Seiten den
  Hinweis „Entwurf“. Datenschutzerklärung und Auftragsverarbeitung fehlen noch.
- Details: [docs/domains/rechtliches.md](domains/rechtliches.md)

## Konto löschen

- Unter *Profil → Konto löschen* löscht jede Person ihr Konto selbst (#152),
  wie es Google Play und der App Store verlangen.
- Vorher zeigt die App: in welchen Gruppen die Mitgliedschaft endet, welche
  Gruppen archiviert werden (keine weiteren aktiven Mitglieder), wo noch
  Guthaben offen ist und ob das Login gleich mitgelöscht wird. Bestätigt wird
  durch Eintippen von *LÖSCHEN*.
- Wer in einer Gruppe mit weiteren Mitgliedern als Letzte Mitglieder oder
  Rollen verwaltet, muss das erst übergeben; bis dahin lehnt Vereint ab.
- Gelöscht werden in allen Gruppen: eigene Chat- und Direktnachrichten mit
  Fotos und Videos, Direktchats (für beide Seiten), eigene Moments mit ihren
  Chats, Antworten und Medien, Reaktionen, Freundschaften, Mitteilungen,
  Push-Abos, Statistikeinträge, Zusagen zu künftigen Events und Serien,
  Profilbild, Rollen und Rechte sowie das Login in Keycloak.
- Erhalten bleiben Buchungen, Runden, Events, Thekensitzungen und das
  Audit-Protokoll. Sie zeigen den Platzhalter *Gelöschtes Konto* ohne E-Mail;
  das Kassenbuch der Gruppe bleibt so vollständig. Jede Gruppe mit Spuren des
  Kontos bekommt einen Audit-Eintrag `ACCOUNT_DELETED`.
- Ein gelöschtes Konto bleibt gesperrt und lässt sich nicht wieder aufnehmen.
  In Backups stehen die Daten bis zu deren Ablauf.
- Details: [docs/domains/auth-and-user-management.md](domains/auth-and-user-management.md#konto-löschen)

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
