import { Component, model } from '@angular/core';
import { TranslatePipe } from '../i18n';

/**
 * Pflicht-Häkchen „AGB gelesen und zugestimmt“ für Registrierung und
 * Eröffnen einer Gruppe. Die AGB öffnen sich in einem neuen Tab, damit das
 * Formular erhalten bleibt.
 */
@Component({
  selector: 'app-terms-consent',
  imports: [TranslatePipe],
  template: `
    <label class="terms-consent">
      <input type="checkbox" name="acceptTerms" [checked]="accepted()" (change)="toggle($event)" />
      <span>
        {{ 'legal.acceptPrefix' | t }}
        <a href="/agb" target="_blank" rel="noopener">{{ 'legal.acceptLink' | t }}</a
        >{{ 'legal.acceptSuffix' | t }}
      </span>
    </label>
  `,
  styles: [
    `
      .terms-consent {
        display: flex;
        align-items: flex-start;
        gap: 0.6rem;
        font-size: 0.9rem;
        line-height: 1.45;
        cursor: pointer;
      }

      .terms-consent input {
        flex: none;
        width: 1.1rem;
        height: 1.1rem;
        margin: 0.1rem 0 0;
        accent-color: var(--color-brand);
      }

      .terms-consent a {
        color: var(--color-brand);
        font-weight: 600;
      }
    `,
  ],
})
export class TermsConsentComponent {
  readonly accepted = model(false);

  protected toggle(event: Event): void {
    this.accepted.set((event.target as HTMLInputElement).checked);
  }
}
