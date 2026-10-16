import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalPageComponent } from './legal-page.component';
import {
  LEGAL_BACKUP_RETENTION_DAYS,
  LEGAL_GRACE_DAYS,
  LEGAL_OPERATOR,
  LEGAL_PRICES,
  TERMS_DATE_LABEL,
} from './legal-operator';

/**
 * Allgemeine Geschäftsbedingungen und Nutzungsbedingungen, öffentlich unter
 * `/agb`. Sie gelten für Gruppen (Vertrag über den Tarif) und für jedes Konto
 * (Nutzung), samt Widerrufsbelehrung und Muster-Widerrufsformular.
 */
@Component({
  selector: 'app-agb',
  imports: [RouterLink, LegalPageComponent],
  template: `
    <app-legal-page title="Allgemeine Geschäftsbedingungen">
      <p>
        <strong>Stand: {{ dateLabel }}</strong>
      </p>

      <nav aria-label="Inhalt">
        <ol>
          <li><a routerLink="/agb" fragment="geltung">Geltungsbereich und Begriffe</a></li>
          <li><a routerLink="/agb" fragment="leistungen">Leistungen von Vereint</a></li>
          <li><a routerLink="/agb" fragment="konto">Konto und Registrierung</a></li>
          <li><a routerLink="/agb" fragment="vertragsschluss">Vertragsschluss</a></li>
          <li><a routerLink="/agb" fragment="preise">Tarife, Preise und Zahlung</a></li>
          <li><a routerLink="/agb" fragment="kuendigung">Laufzeit und Kündigung</a></li>
          <li><a routerLink="/agb" fragment="verzug">Zahlungsverzug</a></li>
          <li><a routerLink="/agb" fragment="widerruf">Widerrufsrecht für Verbraucher</a></li>
          <li><a routerLink="/agb" fragment="pflichten">Pflichten der Nutzer</a></li>
          <li><a routerLink="/agb" fragment="inhalte">Umgang mit rechtswidrigen Inhalten</a></li>
          <li><a routerLink="/agb" fragment="sperrung">Sperrung und Ausschluss</a></li>
          <li><a routerLink="/agb" fragment="verfuegbarkeit">Verfügbarkeit und Änderungen</a></li>
          <li><a routerLink="/agb" fragment="daten">Daten, Sicherung, Export und Löschung</a></li>
          <li><a routerLink="/agb" fragment="haftung">Haftung</a></li>
          <li><a routerLink="/agb" fragment="maengel">Mängel</a></li>
          <li><a routerLink="/agb" fragment="aenderungen">Änderungen dieser AGB</a></li>
          <li><a routerLink="/agb" fragment="schluss">Schlussbestimmungen</a></li>
        </ol>
      </nav>

      <h2 id="geltung">§ 1 Geltungsbereich und Begriffe</h2>
      <p>
        (1) Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der Web-App
        „Vereint“ unter
        {{ operator.appUrl }}. Anbieter ist {{ operator.name }}, {{ operator.street }},
        {{ operator.postalCodeAndCity }}
        (im Folgenden „Betreiber“, „wir“). Die vollständigen Angaben stehen im
        <a routerLink="/impressum">Impressum</a>.
      </p>
      <p>(2) In diesen AGB bedeuten:</p>
      <ul>
        <li><strong>Nutzer:</strong> jede Person mit einem Konto bei Vereint.</li>
        <li>
          <strong>Gruppe:</strong> ein Bereich in Vereint für einen Verein, einen Stammtisch, eine
          Mannschaft oder eine andere Gemeinschaft mit eigenen Mitgliedern, Rollen und Daten.
        </li>
        <li>
          <strong>Kunde:</strong> wer eine Gruppe eröffnet und damit den Vertrag über diese Gruppe
          mit uns schließt. Das ist die eröffnende Person; handelt sie erkennbar für einen Verein
          oder ein Unternehmen, ist es dieser.
        </li>
        <li>
          <strong>Gruppenverwaltung:</strong> der Kunde und alle Nutzer, denen in der Gruppe eine
          Rolle mit Verwaltungsrechten gegeben wurde (etwa Admin oder Vorstand).
        </li>
        <li>
          <strong>Mitglied:</strong> ein Nutzer, der einer Gruppe angehört, meist auf Einladung der
          Gruppenverwaltung.
        </li>
        <li>
          <strong>Verbraucher</strong> ist jede natürliche Person, die den Vertrag überwiegend weder
          für ihre gewerbliche noch für ihre selbständige berufliche Tätigkeit schließt (§ 13 BGB).
          <strong>Unternehmer</strong> ist, wer bei Vertragsschluss in Ausübung seiner gewerblichen
          oder selbständigen beruflichen Tätigkeit handelt (§ 14 BGB). Eingetragene Vereine sind
          keine Verbraucher.
        </li>
      </ul>
      <p>
        (3) Abweichende Bedingungen des Kunden gelten nicht, auch wenn wir ihnen nicht ausdrücklich
        widersprechen.
      </p>

      <h2 id="leistungen">§ 2 Leistungen von Vereint</h2>
      <p>
        (1) Vereint ist eine Software, mit der Gruppen sich organisieren. Je nach Tarif und Rolle
        gehören dazu insbesondere: Mitgliederverwaltung mit Einladungslinks und Rollen, Termine mit
        Zu- und Absagen, Gruppen-, Termin- und Direktnachrichten, Push-Benachrichtigungen, ein
        Katalog für Getränke und Speisen, Strichlisten und ein Thekenterminal, das Bezahlen per
        Barcode mit Guthaben, Moments mit Bildern und Videos, Statistiken, ein Protokoll der
        Verwaltungsaktionen und der Export der Gruppendaten.
      </p>
      <p>
        (2) <strong>Guthaben und Kasse:</strong> Vereint zeichnet Guthaben, Buchungen und Käufe
        innerhalb einer Gruppe nur auf. Wir nehmen kein Geld der Gruppe oder ihrer Mitglieder
        entgegen, verwahren keines und zahlen keines aus. Ein Guthaben in Vereint ist weder E-Geld
        noch eine Forderung gegen uns. Ein- und Auszahlungen zwischen Mitgliedern und Gruppe laufen
        außerhalb von Vereint und liegen allein in der Verantwortung der Gruppe. Das gilt auch, wenn
        ein Guthaben ins Minus geht.
      </p>
      <p>
        (3) Den Umfang eines Tarifs (etwa Zahl der Mitglieder, Speicherplatz, Videos, gleichzeitige
        Thekenterminals) nennt § 5. Wird eine Grenze erreicht, bleibt alles Vorhandene erhalten; nur
        Neues kann nicht mehr hinzugefügt werden, bis die Gruppe in einen größeren Tarif wechselt
        oder wieder unter der Grenze liegt.
      </p>
      <p>
        (4) Wir stellen Vereint als Web-App bereit, die im Browser läuft und auf dem Gerät
        installiert werden kann. Für die Nutzung braucht es ein aktuelles Gerät mit aktuellem
        Browser und eine Internetverbindung. Kosten für Gerät und Internet trägt der Nutzer.
      </p>
      <p>
        (5) Für Zahlungen an uns nutzen wir den Zahlungsdienst Stripe (Stripe Payments Europe, Ltd.,
        Irland). Kartendaten und andere Zahlungsdaten gibt der Kunde direkt bei Stripe ein; Vereint
        speichert sie nicht.
      </p>

      <h2 id="konto">§ 3 Konto und Registrierung</h2>
      <p>
        (1) Ein Konto erhält, wer eine Gruppe eröffnet oder sich über einen Einladungslink einer
        Gruppe registriert. Eine offene Registrierung ohne Gruppe gibt es nicht. Ein Anspruch auf
        ein Konto besteht nicht.
      </p>
      <p>
        (2) Nutzer müssen mindestens 16 Jahre alt sein. Jüngere dürfen Vereint nur mit Zustimmung
        ihrer Erziehungsberechtigten nutzen; eine Gruppe eröffnen dürfen sie nicht.
      </p>
      <p>
        (3) Die Angaben bei der Registrierung müssen wahr sein und aktuell gehalten werden. Jedes
        Konto gehört genau einer Person und darf nicht weitergegeben werden.
      </p>
      <p>
        (4) Nutzer halten ihr Passwort geheim und melden uns einen Verdacht auf Missbrauch ihres
        Kontos unverzüglich. Wir empfehlen die Zwei-Faktor-Anmeldung, die Vereint für alle Konten
        anbietet.
      </p>
      <p>
        (5) Ein Thekenterminal (Kiosk) darf nur unter einem Konto der Gruppenverwaltung oder einem
        Konto mit dem dafür vorgesehenen Recht betrieben werden. Die Gruppe sorgt dafür, dass das
        Terminal mit der PIN gesperrt ist, wenn es unbeaufsichtigt bleibt.
      </p>

      <h2 id="vertragsschluss">§ 4 Vertragsschluss</h2>
      <p>
        (1) <strong>Konto und kostenloser Tarif:</strong> Mit dem Absenden des Formulars „Gruppe
        eröffnen“ bzw. der Registrierung über einen Einladungslink gibt der Nutzer ein Angebot zum
        Abschluss eines unentgeltlichen Nutzungsvertrags zu diesen AGB ab. Der Vertrag kommt
        zustande, sobald das Konto bzw. die Gruppe angelegt ist und Vereint das bestätigt. Jede neue
        Gruppe beginnt im kostenlosen Tarif.
      </p>
      <p>
        (2) <strong>Bezahlte Tarife und Förderbeitrag:</strong> In der Gruppe unter „Gruppe → Tarif“
        wählt die Gruppenverwaltung einen Tarif und die Zahlweise (monatlich oder jährlich); ein
        Mitglied kann dort für sich den freiwilligen Förderbeitrag wählen. Vereint leitet dann auf
        die Bezahlseite von Stripe weiter. Dort sieht der Kunde vor dem Absenden noch einmal Tarif,
        Preis, Zahlweise und Zahlungsart und kann alle Eingaben prüfen und berichtigen. Mit dem
        Klick auf die Schaltfläche zur kostenpflichtigen Bestellung gibt der Kunde ein verbindliches
        Angebot ab. Der Vertrag kommt zustande, wenn die Zahlung bestätigt ist und der Tarif in der
        Gruppe freigeschaltet wird.
      </p>
      <p>
        (3) Vertragssprache ist Deutsch. Den Vertragstext speichern wir nicht gesondert für den
        einzelnen Kunden. Die jeweils gültigen AGB stehen jederzeit unter {{ operator.appUrl }}/agb
        und lassen sich dort ausdrucken oder speichern. Rechnungen und Zahlungsbestätigungen erhält
        der Kunde per E-Mail von Stripe; sie sind auch im Kundenportal abrufbar. Vereint speichert,
        wann ein Konto welcher Fassung dieser AGB zugestimmt hat.
      </p>

      <h2 id="preise">§ 5 Tarife, Preise und Zahlung</h2>
      <p>(1) Es gibt die folgenden Tarife je Gruppe:</p>
      <table>
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">Kostenlos</th>
            <th scope="col">Standard</th>
            <th scope="col">Premium</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Preis</th>
            <td>0 €</td>
            <td>{{ prices.standardMonth }} je Monat oder {{ prices.standardYear }} je Jahr</td>
            <td>{{ prices.premiumMonth }} je Monat oder {{ prices.premiumYear }} je Jahr</td>
          </tr>
          <tr>
            <th scope="row">Mitglieder</th>
            <td>bis 10</td>
            <td>bis 40</td>
            <td>unbegrenzt</td>
          </tr>
          <tr>
            <th scope="row">Speicher für Bilder und Videos</th>
            <td>1 GB</td>
            <td>10 GB</td>
            <td>50 GB</td>
          </tr>
          <tr>
            <th scope="row">Videos in Moments</th>
            <td>nein</td>
            <td>ja</td>
            <td>ja</td>
          </tr>
          <tr>
            <th scope="row">Thekenterminals gleichzeitig</th>
            <td>1</td>
            <td>1</td>
            <td>mehrere</td>
          </tr>
        </tbody>
      </table>
      <p>
        (2) Maßgeblich sind der Preis und der Leistungsumfang, die vor der Bestellung in Vereint und
        auf der Bezahlseite angezeigt werden.
        @if (operator.smallBusiness) {
          Die Preise sind Endpreise. Als Kleinunternehmer im Sinne von § 19 UStG berechnen wir keine
          Umsatzsteuer.
        } @else {
          Alle Preise enthalten die gesetzliche Umsatzsteuer.
        }
      </p>
      <p>
        (3) <strong>Förderbeitrag:</strong> Jedes Mitglied kann freiwillig einen Förderbeitrag von
        {{ prices.supporterMonth }} je Monat zahlen. Er unterstützt Betrieb und Weiterentwicklung
        von Vereint, ändert keinen Tarif und gibt keinen Anspruch auf zusätzliche Leistungen. Er ist
        keine Spende im steuerlichen Sinn.
      </p>
      <p>
        (4) Entgelte sind jeweils zu Beginn eines Abrechnungszeitraums (Monat oder Jahr) im Voraus
        fällig und werden über die beim Bestellen gewählte Zahlungsart eingezogen. Zahlungsart,
        Rechnungen und Rechnungsadresse verwaltet der Kunde im Stripe-Kundenportal, das er in
        Vereint unter „Zahlung und Rechnungen“ erreicht.
      </p>
      <p>
        (5) Wechselt die Gruppe während eines Abrechnungszeitraums in einen größeren Tarif, gilt er
        sofort; der Preis wird anteilig verrechnet. Ein Wechsel in einen kleineren Tarif gilt zum
        Ende des laufenden Abrechnungszeitraums.
      </p>
      <p>
        (6) Preiserhöhungen für laufende Verträge teilen wir mindestens sechs Wochen vor dem
        Wirksamwerden in Textform mit. Gegenüber Verbrauchern gilt eine Preiserhöhung nur, wenn der
        Kunde ihr zustimmt. Stimmt er nicht zu, können wir den bezahlten Tarif zum Ende des
        laufenden Abrechnungszeitraums kündigen; die Gruppe läuft dann im kostenlosen Tarif weiter.
        Gegenüber Unternehmern gilt eine Preiserhöhung als angenommen, wenn der Kunde nicht bis zum
        Wirksamwerden kündigt; darauf weisen wir in der Mitteilung hin.
      </p>

      <h2 id="kuendigung">§ 6 Laufzeit und Kündigung</h2>
      <p>
        (1) Der kostenlose Nutzungsvertrag läuft auf unbestimmte Zeit. Der Nutzer kann ihn jederzeit
        ohne Frist kündigen, etwa per E-Mail an {{ operator.email }}. Wir können ihn mit einer Frist
        von vier Wochen kündigen.
      </p>
      <p>
        (2) Ein bezahlter Tarif mit monatlicher Zahlweise und der Förderbeitrag laufen jeweils einen
        Monat und verlängern sich um einen weiteren Monat, wenn sie nicht vor Ablauf gekündigt
        werden. Eine Kündigung ist jederzeit zum Ende des laufenden Monats möglich.
      </p>
      <p>(3) Ein bezahlter Tarif mit jährlicher Zahlweise läuft zunächst ein Jahr.</p>
      <ul>
        <li>
          Ist der Kunde <strong>Verbraucher</strong>, läuft der Vertrag nach dem ersten Jahr auf
          unbestimmte Zeit weiter und kann jederzeit mit einer Frist von einem Monat gekündigt
          werden. Für die Zeit nach dem Vertragsende bereits gezahlte Entgelte erstatten wir
          anteilig.
        </li>
        <li>
          Ist der Kunde <strong>Unternehmer</strong>, verlängert sich der Vertrag jeweils um ein
          weiteres Jahr, wenn er nicht bis zum Ende der Laufzeit gekündigt wird.
        </li>
      </ul>
      <p>
        (4) Kündigen kann der Kunde im Stripe-Kundenportal („Zahlung und Rechnungen“ in Vereint)
        oder in Textform, etwa per E-Mail an {{ operator.email }}. Bitte nennen Sie dabei die Gruppe
        und die E-Mail-Adresse Ihres Kontos. Wir bestätigen die Kündigung in Textform.
      </p>
      <p>
        (5) Endet ein bezahlter Tarif, läuft die Gruppe im kostenlosen Tarif weiter. Daten werden
        dabei nicht gelöscht; liegt die Gruppe über den Grenzen des kostenlosen Tarifs, gilt § 2
        Abs. 3.
      </p>
      <p>
        (6) Das Recht jeder Seite zur außerordentlichen Kündigung aus wichtigem Grund bleibt
        unberührt. Ein wichtiger Grund für uns ist insbesondere ein schwerer oder trotz Abmahnung
        wiederholter Verstoß gegen § 9.
      </p>

      <h2 id="verzug">§ 7 Zahlungsverzug</h2>
      <p>
        (1) Schlägt eine Zahlung fehl, informiert Stripe den Kunden und versucht es erneut. Die
        Gruppe läuft
        {{ graceDays }} Tage normal weiter.
      </p>
      <p>
        (2) Ist die Zahlung danach weiter offen, ist die Gruppe nur noch lesbar: Es kann nichts
        Neues angelegt oder geändert werden. Weiter möglich bleiben insbesondere das Ansehen aller
        Daten, Tarif und Zahlung, der Datenexport, das Verlassen der Gruppe und das eigene Profil.
        Gelöscht wird nichts. Mit dem Eingang der Zahlung ist die Gruppe wieder voll nutzbar.
      </p>
      <p>
        (3) Endet das Abonnement wegen offener Zahlungen, läuft die Gruppe im kostenlosen Tarif
        weiter (§ 6 Abs. 5). Gesetzliche Ansprüche wegen Zahlungsverzugs bleiben unberührt.
      </p>

      <h2 id="widerruf">§ 8 Widerrufsrecht für Verbraucher</h2>
      <p>
        Verbrauchern steht bei Verträgen über bezahlte Tarife und den Förderbeitrag ein
        Widerrufsrecht nach folgender Maßgabe zu. Für den unentgeltlichen Nutzungsvertrag (§ 4 Abs.
        1) ist ein Widerruf nicht nötig, weil er jederzeit ohne Frist und ohne Kosten gekündigt
        werden kann.
      </p>
      <div class="legal-box">
        <h3>Widerrufsbelehrung</h3>
        <p><strong>Widerrufsrecht</strong></p>
        <p>
          Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu
          widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.
        </p>
        <p>
          Um Ihr Widerrufsrecht auszuüben, müssen Sie uns ({{ operator.name }},
          {{ operator.street }}, {{ operator.postalCodeAndCity }}, {{ operator.country }}, Telefon:
          {{ operator.phone }}, E-Mail: {{ operator.email }}) mittels einer eindeutigen Erklärung
          (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen
          Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte
          Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.
        </p>
        <p>
          Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung
          des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
        </p>
        <p><strong>Folgen des Widerrufs</strong></p>
        <p>
          Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen
          erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die
          sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene,
          günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn
          Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags
          bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das
          Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde
          ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser
          Rückzahlung Entgelte berechnet.
        </p>
        <p>
          Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen,
          so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem
          Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses
          Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang
          der im Vertrag vorgesehenen Dienstleistungen entspricht.
        </p>
        <p><em>Ende der Widerrufsbelehrung</em></p>
      </div>
      <p>
        Nach einem Widerruf läuft die Gruppe im kostenlosen Tarif weiter; ihre Daten bleiben
        erhalten.
      </p>
      <div class="legal-box">
        <h3>Muster-Widerrufsformular</h3>
        <p>
          (Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und
          senden Sie es zurück.)
        </p>
        <ul>
          <li>
            An {{ operator.name }}, {{ operator.street }}, {{ operator.postalCodeAndCity }},
            {{ operator.country }}, E-Mail: {{ operator.email }}:
          </li>
          <li>
            Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den
            Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)
          </li>
          <li>Bestellt am (*)/erhalten am (*)</li>
          <li>Name des/der Verbraucher(s)</li>
          <li>Anschrift des/der Verbraucher(s)</li>
          <li>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)</li>
          <li>Datum</li>
        </ul>
        <p>(*) Unzutreffendes streichen.</p>
      </div>

      <h2 id="pflichten">§ 9 Pflichten der Nutzer</h2>
      <p>
        (1) Für Inhalte, die Nutzer in Vereint einstellen (etwa Nachrichten, Termine, Moments,
        Bilder, Videos, Namen und Bilder von Gruppen), sind sie selbst verantwortlich. Nutzer
        stellen nur Inhalte ein, an denen sie die nötigen Rechte haben, und achten die Rechte
        anderer, insbesondere das Recht am eigenen Bild. Wer andere Personen erkennbar fotografiert
        oder filmt, holt vor dem Einstellen deren Einwilligung ein.
      </p>
      <p>(2) Untersagt ist insbesondere,</p>
      <ul>
        <li>
          rechtswidrige Inhalte einzustellen, etwa beleidigende, volksverhetzende,
          gewaltverherrlichende, pornografische oder jugendgefährdende Inhalte oder solche, die
          Urheber-, Marken- oder Persönlichkeitsrechte verletzen;
        </li>
        <li>
          andere Nutzer zu belästigen, zu bedrohen oder ihnen unerwünschte Werbung zu schicken;
        </li>
        <li>
          Schadsoftware hochzuladen, Sicherheitsmaßnahmen zu umgehen, auf fremde Konten oder Gruppen
          zuzugreifen oder Vereint automatisiert auszulesen oder übermäßig zu belasten;
        </li>
        <li>
          Vereint für einen anderen Zweck als die Organisation der eigenen Gruppe zu nutzen, etwa
          zum Weiterverkauf.
        </li>
      </ul>
      <p>
        (3) Damit wir Vereint betreiben können, räumen Nutzer uns an ihren Inhalten ein einfaches,
        unentgeltliches, auf die Laufzeit des Vertrags beschränktes Recht ein, sie zu speichern, zu
        sichern, zu verschlüsseln, technisch anzupassen (etwa Bilder zu verkleinern und Metadaten zu
        entfernen) und den Berechtigten in der Gruppe anzuzeigen. Weitere Rechte erwerben wir nicht.
      </p>
      <p>
        (4) Die Gruppenverwaltung entscheidet, wen sie einlädt, welche Rollen und Rechte sie vergibt
        und wie die Gruppe Guthaben, Kasse und Käufe führt. Sie ist dafür verantwortlich, dass die
        Gruppe das Jugendschutzrecht einhält, insbesondere bei der Abgabe alkoholischer Getränke,
        und dass sie die Daten ihrer Mitglieder rechtmäßig verarbeitet (§ 13 Abs. 4).
      </p>
      <p>
        (5) Verstößt ein Nutzer schuldhaft gegen diese Pflichten, stellt er uns von Ansprüchen
        Dritter frei, die wegen des Verstoßes gegen uns geltend gemacht werden, einschließlich
        angemessener Kosten der Rechtsverteidigung.
      </p>

      <h2 id="inhalte">§ 10 Umgang mit rechtswidrigen Inhalten</h2>
      <p>
        (1) Gruppen in Vereint sind geschlossen; ihre Inhalte sehen nur Mitglieder der Gruppe. Wir
        sichten Inhalte nicht anlasslos und setzen keine automatische Inhaltsmoderation ein.
      </p>
      <p>
        (2) Jede Person kann uns Inhalte, die sie für rechtswidrig oder für einen Verstoß gegen
        diese AGB hält, an
        {{ operator.email }} melden. Die Meldung sollte die Gruppe, den Inhalt möglichst genau und
        die Gründe nennen. Wir bestätigen den Eingang, prüfen die Meldung sorgfältig und objektiv
        und teilen der meldenden Person unsere Entscheidung mit.
      </p>
      <p>
        (3) Ist ein Inhalt rechtswidrig oder verstößt er gegen diese AGB, können wir ihn sperren
        oder entfernen und je nach Schwere des Verstoßes den Nutzer verwarnen oder nach § 11
        sperren. Dabei berücksichtigen wir die Rechte und Interessen aller Beteiligten, insbesondere
        die Meinungsfreiheit. Auch die Gruppenverwaltung kann im Rahmen ihrer Rechte Inhalte ihrer
        Gruppe entfernen.
      </p>
      <p>
        (4) Beschränken wir einen Inhalt oder ein Konto, teilen wir dem betroffenen Nutzer die
        Gründe mit und nennen ihm seine Möglichkeiten, dagegen vorzugehen. Er kann der Entscheidung
        innerhalb von sechs Monaten per E-Mail an
        {{ operator.email }} widersprechen; wir prüfen sie dann erneut. Der Rechtsweg bleibt offen.
      </p>
      <p>
        (5) Bei Hinweisen auf Straftaten, die das Leben oder die Sicherheit von Personen gefährden,
        informieren wir die zuständigen Behörden.
      </p>

      <h2 id="sperrung">§ 11 Sperrung und Ausschluss</h2>
      <p>
        (1) Bei einem Verstoß gegen diese AGB oder geltendes Recht, bei begründetem Verdacht auf
        Missbrauch eines Kontos oder zur Abwehr einer Gefahr für Vereint oder andere Nutzer können
        wir ein Konto oder eine Gruppe vorübergehend sperren. Dabei wählen wir das mildeste
        geeignete Mittel und berücksichtigen, ob der Verstoß schuldhaft war.
      </p>
      <p>
        (2) Bei schweren oder wiederholten Verstößen können wir den Vertrag nach § 6 Abs. 6
        kündigen. Bereits gezahlte Entgelte für die Zeit nach dem Vertragsende erstatten wir
        anteilig, außer wenn der Kunde den Verstoß selbst begangen hat.
      </p>
      <p>
        (3) Gruppen können Mitglieder nach ihren eigenen Regeln aus der Gruppe entfernen. Das Konto
        des Mitglieds bleibt davon unberührt.
      </p>

      <h2 id="verfuegbarkeit">§ 12 Verfügbarkeit und Änderungen</h2>
      <p>
        (1) Wir betreiben Vereint mit der Sorgfalt eines ordentlichen Kaufmanns und sichern die
        Daten täglich. In bezahlten Tarifen ist Vereint im Jahresmittel zu mindestens 98 %
        erreichbar. Nicht mitgerechnet werden angekündigte Wartungen, möglichst in den Nachtstunden,
        sowie Ausfälle, die wir nicht zu vertreten haben, etwa Störungen des Internets, höhere
        Gewalt oder Ausfälle unseres Rechenzentrumsanbieters, die wir nicht verhindern konnten. Im
        kostenlosen Tarif schulden wir keine bestimmte Verfügbarkeit.
      </p>
      <p>
        (2) Wir entwickeln Vereint weiter und dürfen es ändern, wenn dafür ein triftiger Grund
        besteht, insbesondere neue rechtliche Anforderungen, die Sicherheit, technische Neuerungen
        oder eine bessere Bedienung, und die Änderung dem Kunden zumutbar ist. Für den Kunden
        entstehen dadurch keine zusätzlichen Kosten.
      </p>
      <p>
        (3) Beeinträchtigt eine Änderung die Nutzung eines bezahlten Tarifs mehr als nur
        unerheblich, informieren wir den Kunden mindestens sechs Wochen vorher klar und verständlich
        in Textform. Der Kunde kann den Vertrag dann innerhalb von 30 Tagen nach Zugang der
        Information oder nach der Änderung, wenn diese später erfolgt, unentgeltlich kündigen;
        bereits gezahlte Entgelte für die Zeit danach erstatten wir anteilig. Das gilt nicht, wenn
        der Kunde die bisherige Leistung ohne zusätzliche Kosten unverändert weiter nutzen kann. Für
        Verbraucher gilt im Übrigen § 327r BGB.
      </p>
      <p>
        (4) Wir dürfen Vereint auch ganz einstellen. Das kündigen wir mindestens drei Monate vorher
        an; der Kunde kann seine Daten bis dahin exportieren. Bereits gezahlte Entgelte für die Zeit
        danach erstatten wir anteilig.
      </p>

      <h2 id="daten">§ 13 Daten, Sicherung, Export und Löschung</h2>
      <p>
        (1) Vereint läuft auf Servern in Frankfurt am Main (EU). Nachrichten, Benachrichtigungen,
        Bilder und Videos speichern wir verschlüsselt. Wir sichern die Datenbank täglich und
        bewahren die Sicherungen
        {{ backupDays }} Tage auf.
      </p>
      <p>
        (2) Die Gruppenverwaltung kann die Daten ihrer Gruppe jederzeit als Datei exportieren, auch
        wenn die Gruppe nur lesbar ist (§ 7). Der Export enthält Rollen, Mitglieder, Termine,
        Katalog, Buchungen, Chats und Moments; Bilder und Videos sind nicht enthalten. Wir
        empfehlen, die Daten regelmäßig zu exportieren.
      </p>
      <p>
        (3) Nutzer können jederzeit verlangen, dass wir ihr Konto löschen, Kunden auch die Löschung
        ihrer Gruppe; dazu genügt eine E-Mail an {{ operator.email }}. Nach dem Ende eines Vertrags
        löschen wir die Daten innerhalb von 30 Tagen, soweit uns keine gesetzliche Pflicht zur
        Aufbewahrung trifft. Aus den Sicherungen verschwinden die Daten mit deren Ablauf nach
        höchstens {{ backupDays }} weiteren Tagen. Vor dem Löschen einer Gruppe weisen wir auf den
        Export hin.
      </p>
      <p>
        (4) Personenbezogene Daten verarbeiten wir nach unserer Datenschutzerklärung. Für die Daten,
        die eine Gruppe über ihre Mitglieder in Vereint führt, ist die Gruppe bzw. der Kunde
        Verantwortlicher im Sinne der DSGVO und wir sind sein Auftragsverarbeiter. Dafür gilt
        ergänzend unser Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO.
      </p>

      <h2 id="haftung">§ 14 Haftung</h2>
      <p>
        (1) Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung von
        Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz und soweit wir eine Garantie
        übernommen haben.
      </p>
      <p>
        (2) Bei leichter Fahrlässigkeit haften wir nur für die Verletzung wesentlicher
        Vertragspflichten, also solcher Pflichten, deren Erfüllung die ordnungsgemäße Durchführung
        des Vertrags erst ermöglicht und auf deren Einhaltung der Kunde regelmäßig vertrauen darf.
        Die Haftung ist dann auf den vertragstypischen, vorhersehbaren Schaden begrenzt.
      </p>
      <p>
        (3) Für den Verlust von Daten haften wir bei leichter Fahrlässigkeit nur in Höhe des
        Aufwands, der nötig gewesen wäre, um sie aus einem Export (§ 13 Abs. 2) wiederherzustellen,
        den der Kunde in angemessenen Abständen angelegt hat.
      </p>
      <p>
        (4) Im kostenlosen Tarif haften wir nur für Vorsatz, grobe Fahrlässigkeit und arglistig
        verschwiegene Mängel sowie nach Abs. 1; im Übrigen gelten §§ 521, 524 und 599 BGB
        entsprechend.
      </p>
      <p>
        (5) Für Inhalte der Nutzer und für Guthaben, Kasse und Zahlungen innerhalb einer Gruppe (§ 2
        Abs. 2) haften wir nicht, soweit nicht Abs. 1 greift.
      </p>
      <p>(6) Diese Regeln gelten auch für unsere Erfüllungsgehilfen.</p>

      <h2 id="maengel">§ 15 Mängel</h2>
      <p>
        Für Mängel gelten die gesetzlichen Vorschriften, gegenüber Verbrauchern insbesondere §§ 327
        ff. BGB. Bitte melden Sie Fehler an {{ operator.email }}; wir beheben sie in angemessener
        Frist. Gegenüber Unternehmern sind Ansprüche auf Ersatz von Schäden wegen Mängeln nach § 14
        begrenzt.
      </p>

      <h2 id="aenderungen">§ 16 Änderungen dieser AGB</h2>
      <p>
        (1) Wir dürfen diese AGB mit Wirkung für die Zukunft ändern, wenn dafür ein triftiger Grund
        besteht, insbesondere eine Änderung der Rechtslage oder Rechtsprechung, neue Funktionen oder
        geänderte Abläufe, und das Verhältnis von Leistung und Gegenleistung dadurch nicht zum
        Nachteil des Kunden verschoben wird.
      </p>
      <p>
        (2) Änderungen teilen wir mindestens sechs Wochen vor dem Wirksamwerden in Textform oder
        beim Anmelden in Vereint mit. Der Nutzer kann der Änderung bis zum Wirksamwerden
        widersprechen und den Vertrag bis dahin kostenfrei kündigen. Widerspricht er nicht, gilt die
        Änderung als angenommen; darauf weisen wir in der Mitteilung gesondert hin.
      </p>
      <p>
        (3) Änderungen der Hauptleistungen oder der Preise bedürfen gegenüber Verbrauchern immer der
        ausdrücklichen Zustimmung (§ 5 Abs. 6). Widerspricht ein Nutzer einer Änderung, gelten für
        ihn die bisherigen AGB weiter; wir können den Vertrag dann mit der Frist nach § 6 kündigen.
      </p>

      <h2 id="schluss">§ 17 Schlussbestimmungen</h2>
      <p>
        (1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Bei
        Verbrauchern gilt diese Rechtswahl nur, soweit dadurch nicht der Schutz durch zwingende
        Vorschriften des Staates entzogen wird, in dem sie ihren gewöhnlichen Aufenthalt haben.
      </p>
      <p>
        (2) Ist der Kunde Kaufmann, eine juristische Person des öffentlichen Rechts oder ein
        öffentlich-rechtliches Sondervermögen, ist Gerichtsstand für alle Streitigkeiten aus dem
        Vertrag unser Sitz.
      </p>
      <p>
        (3) Sollte eine Bestimmung dieser AGB unwirksam sein, bleiben die übrigen wirksam. An die
        Stelle der unwirksamen Bestimmung tritt die gesetzliche Regelung.
      </p>
    </app-legal-page>
  `,
})
export class AgbComponent {
  protected readonly operator = LEGAL_OPERATOR;
  protected readonly prices = LEGAL_PRICES;
  protected readonly graceDays = LEGAL_GRACE_DAYS;
  protected readonly backupDays = LEGAL_BACKUP_RETENTION_DAYS;
  protected readonly dateLabel = TERMS_DATE_LABEL;
}
