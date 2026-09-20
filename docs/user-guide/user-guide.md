# 🍻 Vereint – Benutzerhandbuch

Willkommen beim offiziellen Benutzerhandbuch der Vereinsplattform **Vereint**. Dieses Handbuch bietet allen Mitgliedern, Vorständen, Thekenbedienern und Gästen eine strukturierte, praxisnahe und lückenlose Anleitung zur optimalen Nutzung aller Funktionen.

---

## 📑 Inhaltsverzeichnis

1. **Kapitel 1: Einführung & Erste Schritte**
   - 1.1 Zweck & Systemübersicht
   - 1.2 Rollen- und Berechtigungskonzept
   - 1.3 Anmeldung & Authentifizierung (Keycloak OIDC)
   - 1.4 Mobile Nutzung als Progressive Web App (PWA)
2. **Kapitel 2: Mein Vereinskonto & Kassenbuch**
   - 2.1 Das persönliche Dashboard & die BalanceCard
   - 2.2 Guthaben aufladen (Einzahlungen)
   - 2.3 Buchungshistorie & digitaler Kontoauszug
   - 2.4 Barcode-Kauf & PWA-Selbstbedienung
   - 2.5 Revisionssicherheit & Append-Only-Prinzip
   - 2.6 Einkaufspreise, Wareneinsatz & Deckungsbeitragsanalyse
   - 2.7 Speisen- und Getränkekatalog verwalten (Vorstand & Admin)
3. **Kapitel 3: Theken-Strichliste (Kiosk-Modus)**
   - 3.1 Touch-Oberfläche im Thekenbetrieb
   - 3.2 1-Tap-Getränke- & Speisenbuchung (Tab-Auswahl)
   - 3.3 Rundenabrechnung für Gruppen (Getränke & Speisen)
   - 3.4 Abendabschluss & Bareinnahmen
   - 3.5 Fehlbuchungen & Sofortstornierung
4. **Kapitel 4: Veranstaltungen & Gast-Einladungen**
   - 4.1 Event-Übersicht & Lebenszyklus
   - 4.2 Zu- und Absagen (RSVP) & Teilnehmerlisten
   - 4.3 Krypto-Gasttokens & Einladungslinks
   - 4.4 Gast-Teilnahme ohne Vereinsbenutzerkonto
   - 4.5 Speisen- & Getränkeangebot pro Event konfigurieren
5. **Kapitel 5: Moments & Rituale (Gemeinschaftsmomente)**
   - 5.1 Was sind Moments? (Anstoßen, Jubeln, Gebet, Check-in)
   - 5.2 Multi-Status-Reaktionen in Echtzeit
   - 5.3 Die 24-Stunden-Moment-Konversation
   - 5.4 Interaktive Weltkarte & GeoJSON-Standortfreigabe
   - 5.5 Archivierung im Eventverlauf
6. **Kapitel 6: Kommunikation & Push-Benachrichtigungen**
   - 6.1 Vereinskanäle, Event-Chat & Direktnachrichten
   - 6.2 Gast-Chat mit temporärem Zugang
   - 6.3 Web-Push-Aktivierung (VAPID) auf Smartphones & PC
   - 6.4 Vorstands-Broadcasts & Eilmeldungen
7. **Kapitel 7: Statistiken & Eber-Analytics**
   - 7.1 Persönliche Kennzahlen & Liter-Ranking
   - 7.2 Ausgabentrends & Monatsvergleiche
   - 7.3 Top-Rundengeber & Getränkeranglisten
   - 7.4 Datenschutz & Clientseitige Datenaggregation
8. **Kapitel 8: Häufige Fragen & Fehlerbehebung (FAQ)**
   - 8.1 Idempotenz & Netzausfälle an der Theke
   - 8.2 Negativer Kontostand & Guthabenauszahlung
   - 8.3 Login-Probleme & Passwort-Reset
   - 8.4 Offline-Verhalten & Service-Worker

---

## 🏛️ Kapitel 1: Einführung & Erste Schritte

### 1.1 Zweck & Systemübersicht
**Vereint** ist eine ganzheitliche Web- und PWA-Plattform, die alle organisatorischen und geselligen Aspekte des Vereinsalltags bündelt. Das System verbindet ein finanzamtkonformes Doppel-Buchungsjournal mit einer extrem schnellen Touch-Strichliste für die Vereinstheke, einem flexiblen Eventmanagement mit Gästezugängen sowie interaktiven Kommunikationsmodulen.

```text
+-----------------------------------------------------------------------------------+
|                                🍻 VEREINT PLATTFORM                               |
+------------------------+--------------------------+-------------------------------+
| 💰 KASSENBUCH & FINANZ | 📱 THEKEN-KIOSK          | 📅 EVENTS & GÄSTE             |
| - Double-Entry Ledger  | - 1-Tap Touch-Buchung    | - RSVP & Teilnehmerlisten     |
| - Guthabenverwaltung   | - Rundenabrechnung       | - Kryptografische Gast-Tokens |
| - PWA-Barcodescanner   | - Fehlertoleranz         | - Sortiments-Sublisten        |
+------------------------+--------------------------+-------------------------------+
| 💬 CHAT & PUSH-NOTIFY  | 🎉 MOMENTS & RITUALE     | 📊 EBER-ANALYTICS             |
| - Vereins- & Eventchat | - Anstoßen / Jubeln      | - Liter- & Ausgabenranking    |
| - Web Push (VAPID)     | - Weltkarte & 24h-Chat   | - Trend- & Verbrauchsanalysen |
| - Board-Broadcasts     | - Archivierte Historie   | - Revisionssichere Audits     |
+------------------------+--------------------------+-------------------------------+
```

### 1.2 Rollen- und Berechtigungskonzept
Das Berechtigungssystem basiert auf klar definierten Rollen, die den Funktionsumfang für jeden Benutzer passgenau steuern:

| Rolle | Schlüssel | Typische Nutzer | Berechtigungen & Zugriffsrechte |
| :--- | :--- | :--- | :--- |
| **Mitglied** | `member` | Reguläre Vereinsmitglieder | Eigenes Guthaben einsehen, Barcodekauf via PWA, Event-RSVP, Teilnahme an Chats & Moments, persönliche Statistiken. |
| **Vorstand** | `board` | Vorsitzende, Kassierer, Schriftführer | Event-Erstellung, Gast-Einladungen generieren, Getränkekatalog verwalten, Kassen-Topups/Payouts durchführen, Broadcasts senden. |
| **Thekenbediener** | `tabletRecorder` | Diensthabende am Theken-Tablet | Kiosk-Modus bedienen, 1-Tap-Getränkebuchungen für alle Mitglieder erfassen, Runden buchen, Abendabschluss durchführen. |
| **Administrator** | `admin` | IT-Verantwortliche des Vereins | Benutzerverwaltung, Rollenzuweisung, Kontosperrungen, Audit-Log-Einsicht, Systemkonfiguration. |
| **Gast** | `guest` | Externe Besucher ohne Account | Teilnahme an freigegebenen Events via Einladungslink, Lesen und Schreiben im Event-Chat über temporäres Gast-Token. |

> ℹ️ **Hinweis**: Ein Benutzer kann mehrere Rollen gleichzeitig innehaben (z. B. `member` + `board` + `tabletRecorder`).

### 1.3 Anmeldung & Authentifizierung (Keycloak OIDC)
Der Zugang zu Vereint erfolgt sicher über das zentrale Single-Sign-On-System **Keycloak (OpenID Connect)**.

#### Schritt-für-Schritt: Erstmalige Anmeldung
1. Rufen Sie die Vereins-URL in Ihrem Webbrowser auf (z. B. `https://vereint.mein-verein.de`).
2. Klicken Sie auf **"Anmelden mit Vereint ID"**. Sie werden auf die geschützte Keycloak-Anmeldeseite weitergeleitet.
3. Geben Sie Ihren Benutzernamen (oder E-Mail-Adresse) und Ihr Passwort ein.
4. Nach erfolgreicher Authentifizierung werden Sie automatisch auf Ihr persönliches **Dashboard** weitergeleitet.
5. *Just-in-Time Provisioning*: Bei Ihrem allerersten Login wird Ihr Vereinskonto automatisch initialisiert und mit der Standardrolle `member` verknüpft.

### 1.4 Mobile Nutzung als Progressive Web App (PWA)
Vereint ist als **Progressive Web App (PWA)** konzipiert. Sie können die Plattform direkt auf dem Startbildschirm Ihres Smartphones oder Tablets installieren – ganz ohne App-Store-Download:

- **Auf iOS (Apple Safari)**:
  1. Öffnen Sie die Vereinswebseite in Safari.
  2. Tippen Sie in der Menüleiste auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben).
  3. Wählen Sie die Option **"Zum Home-Bildschirm"** (`Add to Home Screen`).
  4. Bestätigen Sie den Namen mit **Hinzufügen**.
- **Auf Android (Google Chrome)**:
  1. Öffnen Sie die Vereinswebseite in Chrome.
  2. Tippen Sie auf das Dreipunkt-Menü oben rechts oder auf das Banner **"Vereint zum Startbildschirm hinzufügen"**.
  3. Bestätigen Sie die Installation mit **Installieren**.

---

## 💰 Kapitel 2: Mein Vereinskonto & Kassenbuch

### 2.1 Das persönliche Dashboard & die BalanceCard
Nach der Anmeldung sehen Sie im Dashboard sofort Ihren aktuellen Kontostand auf der zentralen **BalanceCard**:

- **Positiver Saldo (Grün)**: Ihr Konto weist ein aktives Guthaben auf. Sie können jederzeit Getränke an der Theke buchen oder via Barcode erwerben.
- **Negativer Saldo (Rot / Warnung)**: Ihr Konto ist im Minus. Sie werden gebeten, Ihr Guthaben beim Kassierer oder per Überweisung zeitnah aufzuladen.

```text
+-------------------------------------------------------------+
|  👤 Guten Abend, Max Mustermann!             [ Profil ⚙️ ]  |
+-------------------------------------------------------------+
|  💰 MEIN KASSENSTAND                                        |
|  +-------------------------------------------------------+  |
|  |  Aktuelles Guthaben:     14,50 €            [ AKTIV ] |  |
|  |  Status: Ausgeglichen • Letzte Buchung: Gestern, 21:15|  |
|  +-------------------------------------------------------+  |
|  [ ➕ Guthaben aufladen ]           [ 📄 Kontoauszug ]      |
+-------------------------------------------------------------+
```

### 2.2 Guthaben aufladen (Einzahlungen)
Um das Vereinskonto aufzuladen, stehen folgende Wege zur Verfügung:
1. **Barzahlung beim Kassier / Vorstand**:
   - Übergeben Sie den gewünschten Betrag dem Kassenverantwortlichen.
   - Der Vorstand bucht den Betrag über `POST /api/v1/ledger/topups` auf Ihr Mitgliedskonto.
   - Ihr Kontostand aktualisiert sich in Echtzeit.
2. **Banküberweisung / Dauerauftrag**:
   - Sofern Ihr Verein Banküberweisungen unterstützt, geben Sie Ihre Mitgliedsnummer im Verwendungszweck an. Der Kassierer bucht den Geldeingang nach Kontoabgleich ein.

### 2.3 Buchungshistorie & digitaler Kontoauszug
Jedes Mitglied kann lückenlos jede einzelne Buchung nachvollziehen:
- Klicken Sie auf **"Kontoauszug"** auf der BalanceCard.
- Sie erhalten eine chronologische Auflistung mit Buchungsdatum, Buchungsart (`topup`, `purchase`, `payout`, `correction`), Artikeldetails (z. B. "1x Pils 0.5L") und dem gebuchten Betrag.
- Transaktionen sind transparent und können nach Datumsbereich oder Event gefiltert werden.

### 2.4 Barcode-Kauf & PWA-Selbstbedienung
Befindet sich an der Vereinstheke oder im Vereinsheim ein Selbstbedienungs-Kühlschrank mit Barcode-Etiketten:
1. Öffnen Sie die Vereint PWA auf Ihrem Smartphone.
2. Tippen Sie auf das **Kamera-/Barcode-Symbol**.
3. Scannen Sie den EAN-Strichcode auf der Flasche.
4. Die App zeigt den Getränkenamen und den Preis an. Bestätigen Sie mit **"Jetzt kaufen"**.
5. Der Kauf wird sekundenschnell vom Guthaben abgebucht.

### 2.5 Revisionssicherheit & Append-Only-Prinzip
Das Kassenbuch von Vereint folgt strengen buchhalterischen Standards:
- **Unveränderbarkeit (Append-Only)**: Bestehende Buchungszeilen können niemals gelöscht oder nachträglich editiert werden.
- **Korrekturen**: Bei versehentlichen Fehlbuchungen wird eine Gegenbuchung (`correction`) erzeugt, die den Originalbetrag referenziert und rechnerisch ausgleicht.
- **Datenbank-Trigger**: Spezielle Trigger in der PostgreSQL-Datenbank stellen sicher, dass jeder Beleg manipulationssicher archiviert wird.

### 2.6 Einkaufspreise, Wareneinsatz & Deckungsbeitragsanalyse
Für eine transparente Wirtschaftlichkeit und professionelle Vereinsbuchhaltung unterstützt Vereint die lückenlose Erfassung von Einkaufspreisen (`costPrice`):
- **Automatischer Beleg-Snapshot**: Bei jedem Kauf wird neben dem Verkaufspreis (`unitPrice`) auch der zum Kaufzeitpunkt gültige Einkaufspreis (`costPrice`) im Beleg eingefroren.
- **Deckungsbeitrag pro Buchung**: Das System ermittelt sekundengenau den Deckungsbeitrag (`profit = unitPrice - costPrice`).
- **Event-Wirtschaftlichkeitsanalyse (Vorstand & Kassenwart)**:
  - In der Kassenübersicht eines Events (`/api/v1/ledger/events/{eventId}/summary`) sehen Vorstände auf einen Blick:
    - **Gesamterlös (`revenueTotal`)**: Summe aller Verkäufe.
    - **Wareneinsatz (`costTotal`)**: Tatsächliche Beschaffungskosten für konsumierte Speisen und Getränke.
    - **Deckungsbeitrag / Reingewinn (`profitTotal`)**: Verbleibender Gewinn für die Vereinskasse.
    - **Guthabenkonsum (`creditConsumptionTotal`)**: Anteil der bargeldlos über Mitgliedskonten abgerechneten Verkäufe.

### 2.7 Speisen- und Getränkekatalog verwalten (Vorstand & Admin)
Vorstände und Administratoren pflegen das Vereinssortiment zentral über das Administrations-Dashboard:
1. **Speisenkatalog (`/api/v1/food`)**:
   - Klicken Sie im Admin-Bereich auf **"Speisenkatalog"** und wählen Sie **"Neue Speise anlegen"**.
   - Geben Sie Name, Kategorie (z. B. `Grill`, `Kuchen`, `Snacks`), den Standard-Verkaufspreis sowie den Standard-Einkaufspreis ein.
   - Über den Schalter `Aktiv` können saisonale Angebote (z. B. Glühwein-Gebäck im Sommer) vorübergehend ausgeblendet werden, ohne historische Buchungen zu gefährden.
2. **Getränkekatalog & Vorschläge (`/api/v1/drinks`)**:
   - Mitglieder können über ihre App neue Getränke vorschlagen.
   - Der Vorstand prüft vorgeschlagene Artikel im Dashboard und gibt sie mit einem Klick frei (`Freigeben`) oder weist sie ab.
   - Freigegebenen Getränken können EAN-Barcodes für den Scanner zugewiesen werden.

---

## 📱 Kapitel 3: Theken-Strichliste (Kiosk-Modus)

### 3.1 Touch-Oberfläche im Thekenbetrieb
Der Kiosk-Modus ist speziell für Tablets an der Vereinstheke konzipiert. Die Oberfläche ist für schnelle Fingerbedienung bei lauter Umgebung und hohem Besucherandrang optimiert und kombiniert Getränke und Speisen in einer aufgeräumten Tab-Struktur:

```text
+-----------------------------------------------------------------------------------+
| 🍻 VEREINT - THEKEN STRICHLISTE (KIOSK MODE)                    Event: Sommerfest |
+-----------------------------------------------------------------------------------+
| Mitglied suchen... [ 🔍 Max                             ]       [ 🔒 Abmelden ]  |
+-----------------------------------------+-----------------------------------------+
| MITGLIEDERLISTE                         | ARTIKELAUSWAHL: [ 🍺 GETRÄNKE ] [ 🌭 SPEISEN ] |
| --------------------------------------- | --------------------------------------- |
| [👤 Max Mustermann         (14,50 €)] > | [ 🍺 Pils 0.5L                 3,00 € ] |
| [👤 Erika Muster           ( 8,00 €)]   | [ 🍋 Radler 0.5L               3,00 € ] |
| [👤 Lukas Schmidt          (-2,50 €)] ! | [ 🥤 Cola / Limo 0.33L         2,00 € ] |
| [👤 Sarah Weber            (22,00 €)]   | [ 🌭 Bratwurst im Brötchen     3,50 € ] |
| --------------------------------------- | --------------------------------------- |
| [ 🍻 Runde für Gruppe buchen ]          | [ ⚡ Letzte Buchung stornieren (Storno) ]|
+-----------------------------------------+-----------------------------------------+
| Status: Bereit • 1-Tap Buchung aktiv • Idempotenz-Schutz eingeschaltet            |
+-----------------------------------------------------------------------------------+
```

### 3.2 1-Tap-Getränke- & Speisenbuchung in der Praxis
Die Erfassung an der Theke erfordert lediglich **zwei kurze Fingertipps**:
1. **Mitglied auswählen**: Tippen Sie in der linken Liste auf den Namen des Mitglieds (z. B. "Max Mustermann").
2. **Kategorie wählen (optional)**: Wechseln Sie bei Bedarf oben zwischen den Tabs **[ 🍺 Getränke ]** und **[ 🌭 Speisen ]**.
3. **Artikel antippen**: In der Kachelauswahl tippen Sie auf den gewünschten Artikel (z. B. "Pils 0.5L" oder "Bratwurst").
4. **Sofortige Quittierung**:
   - Die Buchung wird sofort ausgeführt (`TabletPurchaseRequest` mit `eventDrinkId` oder `eventFoodId`).
   - Ein grünes Bestätigungsbanner (`Toast`) erscheint: *"1x Bratwurst für Max Mustermann gebucht (-3,50 €)"*.
   - Der neue Kontostand des Mitglieds wird unmittelbar aktualisiert.

### 3.3 Rundenabrechnung für Gruppen (Getränke & Speisen)
Gibt ein Mitglied eine Runde für mehrere Personen aus (z. B. Getränkerunde oder Brezeln für den Tisch):
1. Tippen Sie auf die Schaltfläche **"Runde für Gruppe buchen"**.
2. Wählen Sie das gewünschte Getränk oder die Speise aus.
3. Markieren Sie alle anwesenden Mitglieder, die den Artikel erhalten.
4. Bestätigen Sie mit **"Runde buchen"**.
5. Das System bucht die Runde im Modus `revenueOnly` bzw. belastet wahlweise den Ausgeber, ohne dass alle Einzelempfänger ins Minus geraten.

### 3.4 Abendabschluss & Bareinnahmen
Am Ende des Abends führt das Thekenpersonal den Kassenabschluss durch:
1. Öffnen Sie das Kiosk-Menü oben rechts und wählen Sie **"Abendabschluss"**.
2. Geben Sie die Summe der erhaltenen Bareinnahmen von Gästen ohne Vereinskonto ein.
3. Das System erzeugt einen aggregierten Abschlussbeleg (`source = evening, accountingMode = revenueOnly`).
4. Das Event kann anschließend vom Vorstand in den Status `completed` versetzt werden.

### 3.5 Fehlbuchungen & Sofortstornierung
Sollte versehentlich ein falscher Artikel angetippt worden sein:
- Direkt nach der Buchung steht der Button **"Letzte Buchung stornieren"** zur Verfügung.
- Ein Tippen erzeugt automatisch eine Revisions-Gegenbuchung (`POST /api/v1/ledger/corrections`), die das Mitgliedskonto umgehend wieder entlastet.

---

## 📅 Kapitel 4: Veranstaltungen & Gast-Einladungen

### 4.1 Event-Übersicht & Lebenszyklus
Veranstaltungen durchlaufen in Vereint einen definierten Lebenszyklus:

```text
[ Entwurf (draft) ] ---> [ Veröffentlicht (published) ] ---> [ Aktiv / Theke offen (active) ]
                                   |                                        |
                                   v                                        v
                          [ Abgesagt (cancelled) ]                 [ Beendet (completed) ]
                                                                            |
                                                                            v
                                                                  [ Archiviert (archived) ]
```

- **draft**: Nur für den Ersteller und den Vorstand sichtbar zur Vorbereitung von Datum, Ort und Getränke-/Speisenangebot.
- **published**: Sichtbar für alle Mitglieder; RSVP-Rückmeldungen können abgegeben werden.
- **active**: Die Veranstaltung läuft aktuell. Das Tablet an der Theke greift auf das Event-Sortiment (`/items`) zu.
- **completed**: Das Event ist beendet und die Kassenabrechnung abgeschlossen.
- **archived**: Das Event steht für historische Statistiken bereit.

### 4.2 Zu- und Absagen (RSVP) & Teilnehmerlisten
Jedes Vereinsmitglied kann mit einem Klick auf der Eventkarte seinen Teilnahmestatus festlegen:
- **Zusagen (`attending`)**: Sie werden in die Teilnehmerliste aufgenommen. Das Thekenteam sieht Sie priorisiert in der Schnellauswahl.
- **Unsicher (`maybe`)**: Hilft dem Vorstand bei der Mengenplanung für Getränke und Verpflegung.
- **Absagen (`declined`)**: Entfernt Sie aus der aktiven Teilnehmerübersicht des Events.

### 4.3 Krypto-Gasttokens & Einladungslinks
Für Freunde, Partnervereine oder externe Gäste können Vorstände sichere Einladungslinks erzeugen:
1. Öffnen Sie die Event-Details und klicken Sie auf **"Gast-Einladung erstellen"**.
2. Legen Sie optional ein **Nutzungslimit** (z. B. maximal 15 Gäste) und eine **Gültigkeitsdauer** fest.
3. Das System erzeugt einen kryptografisch sicheren Zufallstoken (`256-Bit Entropy`).
4. In der Vereinsdatenbank wird aus Sicherheitsgründen ausschließlich der **SHA-256-Hash** gespeichert.
5. Kopieren Sie den generierten Link (z. B. `https://vereint.mein-verein.de/invites/accept?token=sec_9f8a...`) und teilen Sie ihn per WhatsApp, Signal oder E-Mail.

### 4.4 Gast-Teilnahme ohne Vereinsbenutzerkonto
Externe Gäste benötigen **kein Passwort und kein Vereinskonto**:
1. Der Gast klickt auf den erhaltenen Einladungslink.
2. Es öffnet sich eine Willkommensseite: Der Gast gibt lediglich seinen **Anzeigenamen** ein (z. B. "Thomas (Gast)").
3. Nach dem Klick auf **"Beitreten"** erhält das Gast-Smartphone ein sicheres `guestToken`.
4. Der Gast hat nun sofortigen Zugriff auf den Event-Chat und kann an Live-Moments teilnehmen.

### 4.5 Speisen- & Getränkeangebot pro Event konfigurieren
Veranstaltungsleiter und Vorstände passen das gastronomische Angebot im Vorfeld an das Event an:
1. **Event-Getränke zuweisen**:
   - Weisen Sie vorgefertigte Sublisten (z. B. "Sommerfest-Auswahl") oder Einzelgetränke mit individuellen Eventpreisen zu.
   - Legen Sie fest, ob das Getränk für das Tablet (`tabletEnabled`) freigeschaltet wird.
2. **Event-Speisen zuweisen (`/api/v1/events/{eventId}/food`)**:
   - Wählen Sie Speisen aus dem Vereinskatalog aus.
   - Passen Sie bei Bedarf den Verkaufspreis (`price`) und den Einkaufspreis (`costPrice`) an (z. B. Festpreise oder tagesaktuelle Einkaufskosten).
   - Aktivieren Sie `tabletEnabled`, damit die Speisen auf dem Tablet-Kiosk im Speisen-Tab erscheinen.

---

## 🎉 Kapitel 5: Moments & Rituale (Gemeinschaftsmomente)

### 5.1 Was sind Moments? (Anstoßen, Jubeln, Gebet, Check-in)
**Moments** ist das emotionale Herzstück von Vereint. Es ermöglicht Mitgliedern und Gästen, spontane Momente gemeinsamer Aktivität digital zu synchronisieren und festzuhalten – egal ob vor Ort im Vereinsheim oder aus der Ferne.

Typische Moment-Typen:
- 🍻 **Gemeinsames Anstoßen (`toast`)**: Zum feierlichen Auftakt eines Festes oder beim Feierabendbier.
- 🙏 **Gemeinsames Beten & Fürbitten (`prayer`)**: Für kirchliche Gruppen, Chöre oder besinnliche Anlässe.
- 📣 **Jubeln & Anfeuern (`cheer`)**: Bei Toren des Vereins, Wettkampfsiegen oder Ehrungen.
- 📍 **Check-in & Treffpunkt (`checkin`)**: Zur Bestätigung der Ankunft am Festzelt oder Sportplatz.
- ✨ **Individuelle Rituale (`other`)**: Frei definierbare Aktionen für besondere Vereinsanlässe.

### 5.2 Multi-Status-Reaktionen in Echtzeit
Während ein Moment aktiv ist, können alle Teilnehmer in Sekundenschnelle reagieren:
- **Schnell-Reaktionen**: Wählen Sie aus Emojis wie 🍻, 🙏, 📣, ❤️, 🔥, 👍.
- **Mehrfache Status-Updates**: Teilnehmer können mehrfach nacheinander reagieren (z. B. wiederholtes Anstoßen oder Zwischenrufe).
- **Kurznachrichten**: Fügen Sie Ihrer Reaktion einen kurzen Status-Text (max. 255 Zeichen) hinzu.

```text
+-----------------------------------------------------------------------------------+
| 🎉 AKTIVER MOMENT: "Sommerfest Eröffnungs-Anstoßen 🍻"        [ Noch 14 Min aktiv]|
+-----------------------------------------------------------------------------------+
|  Initiator: Vorstand Max • 18 Teilnehmer online • 42 Reaktionen geteilt           |
|                                                                                   |
|  SCHNELL-REAKTIONEN:                                                              |
|  [ 🍻 Anstoßen ]   [ 📣 Jubeln ]   [ ❤️ Herz ]   [ 🔥 Stimmung ]   [ 👍 Top ]     |
|                                                                                   |
|  Ihre Nachricht: [ Prost auf ein gelungenes Fest!            ] [ Absenden 🚀 ]    |
+-----------------------------------------------------------------------------------+
|  LIVE-TIMELINE DER TEILNEHMER:                                                    |
|  • Vor 1 Min  - Lukas Schmidt: "Auf den Verein! 🍻"                               |
|  • Vor 2 Min  - Erika Muster: "Endlich geht es los! 🔥"                           |
|  • Vor 4 Min  - Thomas (Gast): "Danke für die Einladung! 🍻"                      |
+-----------------------------------------------------------------------------------+
```

### 5.3 Die 24-Stunden-Moment-Konversation
Mit dem Start eines jeden Moments wird automatisch ein dedizierter Chatraum (`conversation_type = moment`) eröffnet:
- Ermöglicht allen Teilnehmern den ungestörten Austausch während der Aktion.
- Bleibt für **exakt 24 Stunden** geöffnet und archiviert sich danach automatisch, um den Hauptchat schlank zu halten.

### 5.4 Interaktive Weltkarte & GeoJSON-Standortfreigabe
Mitglieder, die unterwegs sind oder von zu Hause aus teilnehmen, können optional ihren Standort freigeben (`consent = true`):
- Vereint projiziert alle Teilnehmer als Pins auf eine interaktive Weltkarte (GeoJSON FeatureCollection).
- Ideal für überregionale Vereine, Fanclubs bei Auswärtsspielen oder weltweite Alumnitreffen.

### 5.5 Archivierung im Eventverlauf
Nach Ablauf des Moments fasst das System die Aktivität automatisch zusammen:
- *"18 Teilnehmer haben 42 Statusbeiträge zum Moment 'Sommerfest Eröffnungs-Anstoßen' geteilt."*
- Die Erinnerung bleibt dauerhaft im chronologischen Rückblick des Events erhalten.

---

## 💬 Kapitel 6: Kommunikation & Push-Benachrichtigungen

### 6.1 Vereinskanäle, Event-Chat & Direktnachrichten
Vereint stellt eine vollwertige Kommunikationszentrale bereit:
- **Vereins-Hauptkanal (`Club Channel`)**: Der allgemeine Treffpunkt für vereinsweite Ankündigungen, Diskussionen und Austausch.
- **Event-Chaträume**: Jedes Event besitzt einen eigenen Raum für Fahrgemeinschaften, Helferkoordination oder Mitbringsel.
- **Direktnachrichten (1:1 DMs)**: Für vertrauliche Absprachen zwischen zwei Mitgliedern oder mit dem Vorstand.

### 6.2 Gast-Chat mit temporärem Zugang
Gäste, die über einen Krypto-Einladungslink beigetreten sind, werden im Event-Chat mit einem gut sichtbaren **[Gast]**-Badge markiert. Sie können vollwertig mitlesen und schreiben, besitzen jedoch keinen Zugriff auf vereinsinterne Kanäle oder Mitgliederstammdaten.

### 6.3 Web-Push-Aktivierung (VAPID) auf Smartphones & PC
Um keine wichtigen Vereinsnachrichten oder Einladungen zu verpassen, unterstützt Vereint standardkonforme **Web Push Notifications**:

#### Anleitung zur Push-Aktivierung:
1. Öffnen Sie Ihr Profil über das Zahnrad-Symbol oben rechts.
2. Scrollen Sie zum Bereich **"Benachrichtigungen & Push"**.
3. Aktivieren Sie den Schalter **"Push-Benachrichtigungen empfangen"**.
4. Der Browser blendet eine Berechtigungsabfrage ein (*"vereint.de möchte Ihnen Benachrichtigungen senden"*).
5. Bestätigen Sie mit **"Erlauben"** (`Allow`).
6. Ihr Gerät ist nun sicher via VAPID-Schlüsselpaar registriert und empfängt Meldungen auch bei geschlossener App.

### 6.4 Vorstands-Broadcasts & Eilmeldungen
Der Vorstand kann über das Administrationsmenü dringende Meldungen verfassen (z. B. *"Platz wegen Unwetter gesperrt"*). Diese werden priorisiert als Systembenachrichtigung an alle Mitglieder versendet.

---

## 📊 Kapitel 7: Statistiken & Eber-Analytics

### 7.1 Persönliche Kennzahlen & Liter-Ranking
Das Modul **Eber-Analytics** bietet spannende Einblicke in das Vereinsgeschehen:
- **Liter-Ranking**: Wer hat im aktuellen Monat oder auf dem letzten Fest den größten Durst bewiesen? Transparente Rangliste des Gesamtkonsums (in Litern).
- **Anwesenheitsquote (`attendancePercent`)**: Zeigt den prozentualen Anteil besuchter Events im Jahresverlauf.

```text
+-----------------------------------------------------------------------------------+
| 📊 EBER-ANALYTICS & STATISTIKEN                                     Zeitraum: 2026|
+-----------------------------------------+-----------------------------------------+
| 🏆 TOP-KONSUMENTEN (LITER BIER/GETRÄNKE)| 💰 AUSGABEN-TREND (MONATLICH)           |
| --------------------------------------- | --------------------------------------- |
| 1. 🥇 Max Mustermann        34.5 Liter  | Jan:  45,00 €  |████                    |
| 2. 🥈 Lukas Schmidt         28.0 Liter  | Feb:  62,50 €  |██████                  |
| 3. 🥉 Sarah Weber           21.5 Liter  | Mär:  88,00 €  |████████                |
| 4.    Erika Muster          18.0 Liter  | Trend: +14 % zum Vormonat ↗️            |
+-----------------------------------------+-----------------------------------------+
| 🍻 TOP-RUNDENGEBER                      | 🥤 BELIEBTESTE GETRÄNKE (MARKTANTEIL)   |
| --------------------------------------- | --------------------------------------- |
| 1. Max Mustermann          6 Runden     | 1. Pils 0.5L (48 %)                     |
| 2. Christian Bauer         4 Runden     | 2. Radler 0.5L (26 %)                   |
| 3. Sarah Weber             3 Runden     | 3. Cola / Softdrinks (16 %)             |
+-----------------------------------------+-----------------------------------------+
```

### 7.2 Ausgabentrends & Monatsvergleiche
Die Sparkline- und Balkendiagramme visualisieren die finanzielle Dynamik:
- Monatliche Gesamtausgaben im Verein.
- Vergleichswerte zum Vormonat in Prozent.
- Hilft dem Kassierer bei der vorausschauenden Getränkebestellung für anstehende Feste.

### 7.3 Top-Rundengeber & Getränkeranglisten
Besonders spendable Mitglieder werden in der Kategorie **Top-Rundengeber** gewürdigt. Die Getränkestatistik gibt Aufschluss über Sortimentsfavoriten und hilft bei der Sortimentsoptimierung.

### 7.4 Datenschutz & Clientseitige Datenaggregation
- **Sicherheitsgarantie**: Statistiken werden niemals in öffentlichen Server-Caches oder SSR-Seiten vorgespeichert.
- **Client-Side Rendering**: Sämtliche Diagramme werden erst nach individueller Anmeldung im Webbrowser des autorisierten Nutzers berechnet.

---

## ❓ Kapitel 8: Häufige Fragen & Fehlerbehebung (FAQ)

### 8.1 Was passiert bei instabilem WLAN an der Vereinstheke?
Vereint verfügt über einen integrierten **Idempotenz-Schutz** (`UUIDv4 Idempotency-Key`):
- Bei Netzabbrüchen wiederholt das Tablet die Anfrage automatisch.
- Der Backend-Server erkennt Duplikate anhand des Schlüssels und führt die Abbuchung **garantiert nur genau einmal** aus. Es entstehen keine Doppelbuchungen!

### 8.2 Was tun, wenn mein Guthaben ins Minus gerät?
Ein negatives Guthaben sperrt Sie nicht sofort von der Vereinsgemeinschaft aus. Sie erhalten jedoch auf Ihrer BalanceCard einen dezenten Hinweis. Bitte gleichen Sie den Betrag bei der nächsten Gelegenheit beim Kassierer oder per Überweisung aus.

### 8.3 Was geschieht mit Restguthaben bei einem Vereinsaustritt?
Bei Beendigung der Mitgliedschaft erfasst der Vorstand eine Auszahlungsbuchung (`POST /api/v1/ledger/payouts`). Das verbleibende Restguthaben wird Ihnen in bar oder per Banküberweisung erstattet und das Vereinskonto auf 0,00 € ausgeglichen.

### 8.4 Ich habe mein Passwort vergessen – wie erhalte ich Zugang?
Klicken Sie auf der Keycloak-Anmeldeseite auf **"Passwort vergessen?"**. Geben Sie Ihre hinterlegte E-Mail-Adresse ein. Sie erhalten umgehend einen Link zur Vergabe eines neuen Passworts.

### 8.5 Funktioniert die App auch offline?
Dank Service-Worker-Caching können Sie Ihr Dashboard und die letzten Kontobewegungen auch ohne aktives Internet einsehen. Für neue Buchungen oder Chat-Nachrichten synchronisiert sich das System automatisch, sobald wieder Empfang besteht.

---

*Stand: September 2026 – Vereint Dokumentations- und Redaktionsteam.*
