# Leitfaden Thekenterminal

Für den Thekendienst. Das Thekenterminal ist die digitale Strichliste: Ein Tablet liegt an der Theke, und wer ausschenkt, tippt für jedes Getränk einen Strich beim richtigen Namen. Der Betrag wird automatisch vom Guthaben des Mitglieds abgebucht, oder vom Guthaben dessen, der gerade eine Runde ausgibt.

Runden gibt jede Person am eigenen Handy aus; das Terminal zeigt sie nur an (siehe [Runden](#runden)).

Voraussetzung: Das Tablet ist mit dem Thekenkonto angemeldet (siehe [Thekentablet einrichten](04-administration.md#thekentablet-einrichten)), und der Vorstand hat das Event auf **Aktiv** gestellt.

## Abend auswählen

<img src="bilder/t-event-waehlen.png" alt="Aktive Events am Terminal" width="720">

Öffne **Thekenterminal** (am Handy unter **Mehr**, Abschnitt **Verwaltung**; am Rechner links unter **Verwaltung**). Unter **Aktive Events** stehen alle Abende, die gerade laufen. Tippe beim richtigen Abend auf **Auswählen**.

Erscheint kein Event, ist der Abend noch nicht auf **Aktiv** gestellt. Bitte den Vorstand oder Gastgeber darum.

## Kiosk-Modus

<img src="bilder/t-kiosk-start.png" alt="Kiosk-Modus starten" width="720">

Im **Kiosk-Modus** bleibt das Tablet auf der Strichliste: Menü, Mitteilungen und Abmelden sind ausgeblendet, und auch nach Neuladen oder Schließen und Öffnen der App landet es wieder hier, beim zuletzt gewählten Abend.

1. **Kiosk-Modus starten** tippen.
2. Optional einen **Gerätenamen** eintragen, z. B. „Theke links“.
3. Eine **PIN** aus 4 bis 8 Ziffern vergeben und wiederholen, dann **Starten**.

<img src="bilder/t-kiosk-entsperren.png" alt="Kiosk-Modus mit PIN verlassen" width="720">

Zum Verlassen oben rechts auf das Schloss (**Kiosk entsperren**) oder auf **Kiosk-Modus verlassen** tippen und die PIN eingeben. Nach 5 falschen Eingaben ist die PIN-Eingabe eine Weile gesperrt. PIN vergessen? Vorstand oder Administration entsperren das Gerät unter **Vorstand → Kiosk-Geräte** (siehe [Leitfaden Vorstand](03-vorstand.md#kiosk-geräte)).

## Striche erfassen

<img src="bilder/t-strichliste.png" alt="Strichliste mit einer Spalte je Kategorie" width="720">

Die Strichliste sieht aus wie die auf Papier: eine **Zeile je Mitglied** am Event, eine **Spalte je Strich-Kategorie**, zum Beispiel „Bier“ und „Alkoholfrei“. Im Spaltenkopf steht der Preis je Strich. Die Kategorien, ihre Preise und ihre Reihenfolge legt der Vorstand fest (siehe [Strich-Kategorien](03-vorstand.md#strich-kategorien)).

- **Ein Tipp auf ein Feld bucht einen Strich**: Zeile der Person, Spalte der Kategorie. Der Kategoriepreis wird vom Guthaben der Person abgebucht, bei einer laufenden Runde vom Guthaben des Gebers.
- Im Feld stehen die Striche als Fünferbündel (vier Striche und ein Querstrich) und rechts die Zahl. Leere Felder zeigen ein **+**.
- Gezählt wird alles, was an diesem Abend für die Person gebucht wurde, auch von einem anderen Tablet oder vor einem Neuladen.
- Rechts unter **Heute an der Theke** stehen die Zahl der Striche, der Umsatz des Abends und die laufenden Runden.

### Welches Getränk war es?

<img src="bilder/t-artikel.png" alt="Auswahl des Getränks in einer Kategorie" width="720">

Jeder Strich gehört zu einem bestimmten Getränk, damit Bestand und Auswertung stimmen.

- Enthält die Kategorie im Event **nur ein Getränk**, bucht der Tipp sofort.
- Enthält sie **mehrere**, fragt das Terminal kurz nach: Getränk antippen, fertig. Der Preis ist bei allen derselbe, nämlich der Kategoriepreis.

### Spalte „Sonstiges“

Ganz rechts steht **Sonstiges**, wenn es im Event Getränke ohne Kategorie oder Speisen gibt. Ein Tipp öffnet die Auswahl dieser Artikel mit ihrem jeweiligen Preis, zum Beispiel „Obstler 2 cl · 2,00 €“ oder „Brezel · 1,80 €“.

Hat der Vorstand noch keine Strich-Kategorien angelegt, gibt es nur diese Spalte, und jeder Strich läuft über die Auswahl.

## Vertippt? Rückgängig machen

<img src="bilder/t-strich-rueckgaengig.png" alt="Strich erfasst mit Rückgängig" width="720">

Nach jedem Strich erscheint unten ein dunkler Balken, z. B. „Strich: Felix Braun · Bier (Helles 0,5 l)“. Das zuletzt getippte Feld ist hervorgehoben.

- **Rückgängig** nimmt diesen letzten Strich sofort zurück. Danach steht der Strich davor im Balken und lässt sich ebenso zurücknehmen.

Zurücknehmen geht nur für Striche, die in dieser Sitzung an diesem Tablet gebucht wurden, und nur **innerhalb von 10 Minuten**. Das Geld wird dabei per Gegenbuchung zurückgebucht; beide Buchungen bleiben im Protokoll. Ältere Fehler korrigiert der Kassenwart.

## Runden

<img src="bilder/t-runde.png" alt="Laufende Runden, nur Anzeige" width="720">

Eine Runde gibt jede Person **in der App am eigenen Handy** aus und bezahlt sie mit ihrem eigenen Guthaben (siehe [Leitfaden Mitglied](02-mitglied.md#eine-runde-ausgeben)). Am Terminal wird keine Runde ausgegeben; es zeigt sie nur an.

- Wer eingeladen ist, bekommt an der Theke **einfach seinen Strich**, wie immer. Der Strich geht automatisch auf die Runde, solange sie läuft und nicht aufgebraucht ist. Bei **Eine Runde** gilt das für ein Getränk je Person, beim **ganzen Abend** bis zur Höchstsumme.
- Unter dem Namen in der Strichliste steht, auf wessen Kosten die Person gerade trinkt: „Runde von Thomas“, „Abend von Sabine“ oder „Eigene Rechnung“.
- Rechts unter **Laufende Runden** steht, wer was ausgibt, bis zu welcher Summe, wie viele schon eingelöst haben und wie lange die Runde noch gilt. **Alle ansehen** öffnet die Übersicht mit allen Eingeladenen; wer schon eingelöst hat, trägt ein Häkchen.
- **Rückgängig** funktioniert auch bei einem Strich auf eine Runde: Der Betrag geht an den Geber zurück, und die Person kann ihr Rundengetränk wieder bekommen.
- Neue Runden erscheinen von selbst, das Terminal lädt alle 30 Sekunden nach.

## Tipps für den Abend

- Tablet quer aufstellen, dann passen alle Spalten nebeneinander. Bei vielen Kategorien lässt sich die Liste seitlich schieben.
- Zum Schichtwechsel nicht abmelden; das Terminal läuft im Kiosk-Modus einfach weiter.
- Ist das WLAN kurz weg, erscheint eine Fehlermeldung und der Strich wurde nicht gebucht. Nach dem Wiederverbinden noch einmal tippen und auf den Balken „Strich: …“ achten.
