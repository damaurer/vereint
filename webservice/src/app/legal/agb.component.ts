import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalPageComponent } from './legal-page.component';
import { LEGAL_BACKUP_RETENTION_DAYS, LEGAL_OPERATOR, TERMS_DATE_LABEL } from './legal-operator';

/**
 * Allgemeine Geschäftsbedingungen für die unentgeltliche Nutzung, öffentlich
 * unter `/agb`. Sie gelten für Gruppen und für jedes Konto.
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
          <li><a routerLink="/agb" fragment="kuendigung">Laufzeit und Kündigung</a></li>
          <li><a routerLink="/agb" fragment="pflichten">Pflichten der Nutzer</a></li>
          <li><a routerLink="/agb" fragment="inhalte">Umgang mit rechtswidrigen Inhalten</a></li>
          <li><a routerLink="/agb" fragment="sperrung">Sperrung und Ausschluss</a></li>
          <li><a routerLink="/agb" fragment="verfuegbarkeit">Verfügbarkeit und Änderungen</a></li>
          <li><a routerLink="/agb" fragment="daten">Daten, Sicherung, Export und Löschung</a></li>
          <li><a routerLink="/agb" fragment="statistiken">Statistiken</a></li>
          <li><a routerLink="/agb" fragment="haftung">Haftung</a></li>
          <li><a routerLink="/agb" fragment="maengel">Mängel</a></li>
          <li><a routerLink="/agb" fragment="aenderungen">Änderungen dieser AGB</a></li>
          <li><a routerLink="/agb" fragment="schluss">Schlussbestimmungen</a></li>
        </ol>
      </nav>

      <h2 id="geltung">§ 1 Geltungsbereich und Begriffe</h2>
      <p>
        (1) Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die unentgeltliche Nutzung der
        Web-App
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
          <strong>Kunde:</strong> wer eine Gruppe eröffnet und damit den Nutzungsvertrag über diese
          Gruppe mit uns schließt. Das ist die eröffnende Person; handelt sie erkennbar für einen Verein
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
        (1) Vereint ist eine Software, mit der Gruppen sich organisieren. Je nach Rolle gehören dazu
        insbesondere: Mitgliederverwaltung mit Einladungslinks und Rollen, Termine mit Zu- und
        Absagen, Gruppen-, Termin- und Direktnachrichten, Push-Benachrichtigungen, ein Katalog für
        Getränke und Speisen, Strichlisten und ein Thekenterminal, das Bezahlen per Barcode mit
        Guthaben, Moments mit Bildern und Videos, Statistiken, ein Protokoll der
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
        (3) <strong>Unentgeltlich:</strong> Vereint ist ein privat betriebenes Hobbyprojekt. Die
        Nutzung ist kostenlos; es gibt keine bezahlten Tarife und keine Grenzen für Mitglieder,
        Speicher, Videos oder Thekenterminals. Der Quellcode ist unter der GNU Affero General Public
        License v3.0 veröffentlicht.
      </p>
      <p>
        (4) Wir stellen Vereint als Web-App bereit, die im Browser läuft und auf dem Gerät
        installiert werden kann. Für die Nutzung braucht es ein aktuelles Gerät mit aktuellem
        Browser und eine Internetverbindung. Kosten für Gerät und Internet trägt der Nutzer.
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
        (1) Mit dem Absenden des Formulars „Gruppe eröffnen“ bzw. der Registrierung über einen
        Einladungslink gibt der Nutzer ein Angebot zum Abschluss eines unentgeltlichen
        Nutzungsvertrags zu diesen AGB ab. Der Vertrag kommt zustande, sobald das Konto bzw. die
        Gruppe angelegt ist und Vereint das bestätigt.
      </p>
      <p>
        (2) Vertragssprache ist Deutsch. Den Vertragstext speichern wir nicht gesondert für den
        einzelnen Nutzer. Die jeweils gültigen AGB stehen jederzeit unter {{ operator.appUrl }}/agb
        und lassen sich dort ausdrucken oder speichern. Vereint speichert, wann ein Konto welcher
        Fassung dieser AGB zugestimmt hat.
      </p>

      <h2 id="kuendigung">§ 5 Laufzeit und Kündigung</h2>
      <p>
        (1) Der Nutzungsvertrag läuft auf unbestimmte Zeit. Der Nutzer kann ihn jederzeit ohne Frist
        kündigen, etwa per E-Mail an {{ operator.email }}. Wir können ihn mit einer Frist von vier
        Wochen kündigen.
      </p>
      <p>
        (2) Das Recht jeder Seite zur außerordentlichen Kündigung aus wichtigem Grund bleibt
        unberührt. Ein wichtiger Grund für uns ist insbesondere ein schwerer oder trotz Abmahnung
        wiederholter Verstoß gegen § 6.
      </p>

      <h2 id="pflichten">§ 6 Pflichten der Nutzer</h2>
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
        und dass sie die Daten ihrer Mitglieder rechtmäßig verarbeitet (§ 10 Abs. 4).
      </p>
      <p>
        (5) Verstößt ein Nutzer schuldhaft gegen diese Pflichten, stellt er uns von Ansprüchen
        Dritter frei, die wegen des Verstoßes gegen uns geltend gemacht werden, einschließlich
        angemessener Kosten der Rechtsverteidigung.
      </p>

      <h2 id="inhalte">§ 7 Umgang mit rechtswidrigen Inhalten</h2>
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
        oder entfernen und je nach Schwere des Verstoßes den Nutzer verwarnen oder nach § 8
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

      <h2 id="sperrung">§ 8 Sperrung und Ausschluss</h2>
      <p>
        (1) Bei einem Verstoß gegen diese AGB oder geltendes Recht, bei begründetem Verdacht auf
        Missbrauch eines Kontos oder zur Abwehr einer Gefahr für Vereint oder andere Nutzer können
        wir ein Konto oder eine Gruppe vorübergehend sperren. Dabei wählen wir das mildeste
        geeignete Mittel und berücksichtigen, ob der Verstoß schuldhaft war.
      </p>
      <p>(2) Bei schweren oder wiederholten Verstößen können wir den Vertrag nach § 5 Abs. 2 kündigen.</p>
      <p>
        (3) Gruppen können Mitglieder nach ihren eigenen Regeln aus der Gruppe entfernen. Das Konto
        des Mitglieds bleibt davon unberührt.
      </p>

      <h2 id="verfuegbarkeit">§ 9 Verfügbarkeit und Änderungen</h2>
      <p>
        (1) Wir betreiben Vereint mit der gebotenen Sorgfalt und sichern die Daten täglich. Eine
        bestimmte Verfügbarkeit schulden wir nicht. Wartungen kündigen wir nach Möglichkeit vorher
        an und legen sie möglichst in die Nachtstunden.
      </p>
      <p>
        (2) Wir entwickeln Vereint weiter und dürfen es ändern, wenn dafür ein triftiger Grund
        besteht, insbesondere neue rechtliche Anforderungen, die Sicherheit, technische Neuerungen
        oder eine bessere Bedienung, und die Änderung dem Nutzer zumutbar ist.
      </p>
      <p>
        (3) Wir dürfen den Betrieb von Vereint auch ganz einstellen. Das kündigen wir mindestens drei
        Monate vorher an; die Gruppenverwaltung kann die Daten ihrer Gruppe bis dahin exportieren.
      </p>

      <h2 id="daten">§ 10 Daten, Sicherung, Export und Löschung</h2>
      <p>
        (1) Vereint läuft auf Servern in Frankfurt am Main (EU). Nachrichten, Benachrichtigungen,
        Bilder und Videos speichern wir verschlüsselt. Wir sichern die Datenbank täglich und
        bewahren die Sicherungen
        {{ backupDays }} Tage auf.
      </p>
      <p>
        (2) Die Gruppenverwaltung kann die Daten ihrer Gruppe jederzeit als Datei exportieren. Der
        Export enthält Rollen, Mitglieder, Termine, Katalog, Buchungen, Chats und Moments; Bilder
        und Videos sind nicht enthalten. Wir empfehlen, die Daten regelmäßig zu exportieren.
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

      <h2 id="statistiken">§ 11 Statistiken</h2>
      <p>
        (1) Vereint wertet zur Unterhaltung aus, was in einer Gruppe passiert, und zeigt die
        Ergebnisse allen Mitgliedern derselben Gruppe <strong>mit Namen</strong> an: Striche und
        Käufe, Zusagen und Absagen zu Events, die Anwesenheit bei Events (mindestens ein Strich oder
        Kauf), welche Getränke jemand wie oft genommen hat, mit Menge und Kalorien, sowie Ranglisten
        und Rekorde daraus. Den Umsatz der Gruppe sehen nur Mitglieder mit Zugriff auf die Kasse.
      </p>
      <p>
        (2) Die Statistiken sind Spaß-Fakten. Insbesondere Mengen und Kalorien beruhen auf
        Angaben je Portion aus dem Katalog der Gruppe oder aus Open Food Facts, können ungenau sein
        und sind <strong>keine Gesundheitsangabe</strong> und keine Ernährungs- oder medizinische
        Beratung.
      </p>
      <p>
        (3) Die Statistiken bleiben innerhalb der jeweiligen Gruppe. Wir zeigen keiner Gruppe Daten
        aus einer anderen. Gruppenübergreifend sieht jeder Nutzer nur seine eigenen Werte und
        Summen ohne Namen anderer Personen über die Events, die er ohnehin sehen darf.
      </p>
      <p>
        (4) Für die Statistiken hält Vereint fest, welche Funktion jemand ausgelöst oder worauf er
        geantwortet hat, etwa einen Kauf, eine Zusage, einen Moment oder eine Chatnachricht, mit
        Gruppe, Event und Zeitpunkt. Direktnachrichten werden nicht erfasst.
      </p>
      <p>
        (5) Die Erfassung lässt sich abschalten: jeder Nutzer für sich in „Mein Konto“, die
        Verwaltung einer Gruppe für die ganze Gruppe und die Organisation eines Events für dieses
        Event. Ist einer dieser Schalter aus, wird nichts erfasst; der Schalter des Nutzers geht dem
        der Gruppe vor, der der Gruppe dem des Events. Abschalten wirkt nur für die Zukunft. Jeder
        Nutzer kann seine erfassten Statistikdaten jederzeit löschen, die Verwaltung einer Gruppe
        die der ganzen Gruppe; das Löschen wird im Protokoll der Gruppe vermerkt. Buchungen der
        Kasse bleiben davon unberührt.
      </p>
      <p>
        (6) Mit der Zustimmung zu diesen AGB willigt der Nutzer in diese Anzeige ein. Wer nicht
        zustimmen möchte, kann die Erfassung nach Abs. 5 abschalten, sich abmelden und die Löschung
        seines Kontos nach § 10 Abs. 3 verlangen.
      </p>

      <h2 id="haftung">§ 12 Haftung</h2>
      <p>
        (1) Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung von
        Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz und soweit wir eine Garantie
        übernommen haben.
      </p>
      <p>
        (2) Da Vereint unentgeltlich ist, haften wir im Übrigen nur für arglistig verschwiegene
        Mängel; §§ 521, 524 und 599 BGB gelten entsprechend.
      </p>
      <p>
        (3) Für Inhalte der Nutzer und für Guthaben, Kasse und Zahlungen innerhalb einer Gruppe (§ 2
        Abs. 2) haften wir nicht, soweit nicht Abs. 1 greift.
      </p>
      <p>(4) Diese Regeln gelten auch für unsere Erfüllungsgehilfen.</p>

      <h2 id="maengel">§ 13 Mängel</h2>
      <p>
        Bitte melden Sie Fehler an {{ operator.email }}; wir bemühen uns, sie in angemessener Frist
        zu beheben. Ansprüche wegen Mängeln richten sich nach § 12.
      </p>

      <h2 id="aenderungen">§ 14 Änderungen dieser AGB</h2>
      <p>
        (1) Wir dürfen diese AGB mit Wirkung für die Zukunft ändern, wenn dafür ein triftiger Grund
        besteht, insbesondere eine Änderung der Rechtslage oder Rechtsprechung, neue Funktionen oder
        geänderte Abläufe.
      </p>
      <p>
        (2) Änderungen teilen wir mindestens sechs Wochen vor dem Wirksamwerden in Textform oder
        beim Anmelden in Vereint mit. Der Nutzer kann der Änderung bis zum Wirksamwerden
        widersprechen und den Vertrag bis dahin kostenfrei kündigen. Widerspricht er nicht, gilt die
        Änderung als angenommen; darauf weisen wir in der Mitteilung gesondert hin.
      </p>
      <p>
        (3) Widerspricht ein Nutzer einer Änderung, gelten für ihn die bisherigen AGB weiter; wir
        können den Vertrag dann mit der Frist nach § 5 Abs. 1 kündigen.
      </p>

      <h2 id="schluss">§ 15 Schlussbestimmungen</h2>
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
  protected readonly backupDays = LEGAL_BACKUP_RETENTION_DAYS;
  protected readonly dateLabel = TERMS_DATE_LABEL;
}
