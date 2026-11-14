import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalPageComponent } from './legal-page.component';
import { LEGAL_OPERATOR } from './legal-operator';

/** Impressum nach § 5 DDG, öffentlich unter `/impressum`. */
@Component({
  selector: 'app-impressum',
  imports: [RouterLink, LegalPageComponent],
  template: `
    <app-legal-page title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <address>
        {{ operator.name }}<br />
        @if (operator.tradingName) {
          {{ operator.tradingName }}<br />
        }
        {{ operator.street }}<br />
        {{ operator.postalCodeAndCity }}<br />
        {{ operator.country }}
      </address>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a [href]="'mailto:' + operator.email">{{ operator.email }}</a
        ><br />
        Telefon: {{ operator.phone }}
      </p>

      @if (operator.vatId || operator.economicId) {
        <h2>Steuerliche Angaben</h2>
        <p>
          @if (operator.vatId) {
            Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: {{ operator.vatId
            }}<br />
          }
          @if (operator.economicId) {
            Wirtschafts-Identifikationsnummer gemäß § 139c Abgabenordnung: {{ operator.economicId }}
          }
        </p>
      }

      <h2>Kontaktstelle nach dem Digital Services Act</h2>
      <p>
        Zentrale Kontaktstelle für Behörden, die EU-Kommission und Nutzer nach Art. 11 und 12 der
        Verordnung (EU) 2022/2065 ist die oben genannte E-Mail-Adresse. Sie erreichen uns dort auf
        Deutsch und Englisch.
      </p>

      <h2>Rechtswidrige Inhalte melden</h2>
      <p>
        Inhalte in Gruppen (Chats, Moments, Bilder, Videos) stammen von deren Mitgliedern. Wenn Sie
        einen Inhalt für rechtswidrig halten, schreiben Sie bitte an die oben genannte
        E-Mail-Adresse. Nennen Sie dabei die Gruppe, den Inhalt so genau wie möglich und warum er
        aus Ihrer Sicht rechtswidrig ist. Wie wir mit Meldungen umgehen, steht in den
        <a routerLink="/agb" fragment="inhalte">AGB unter § 10</a>.
      </p>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </app-legal-page>
  `,
})
export class ImpressumComponent {
  protected readonly operator = LEGAL_OPERATOR;
}
