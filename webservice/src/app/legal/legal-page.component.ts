import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService, TranslatePipe } from '../i18n';
import { LegalLinksComponent } from './legal-links.component';
import { hasOpenPlaceholders } from './legal-operator';

/**
 * Rahmen der öffentlichen Rechtstexte (`/impressum`, `/agb`): Logo, Titel,
 * Hinweise und der Text selbst. Die Seiten liegen außerhalb der App-Shell und
 * sind ohne Anmeldung erreichbar.
 */
@Component({
  selector: 'app-legal-page',
  imports: [RouterLink, TranslatePipe, LegalLinksComponent],
  template: `
    <div class="legal-shell">
      <header class="legal-header">
        <a routerLink="/" class="legal-brand" [attr.aria-label]="'legal.home' | t">
          <img src="vereint-app-icon.svg" alt="" width="32" height="32" />
          <span>Vereint</span>
        </a>
      </header>

      <main class="legal-main">
        <article class="legal-card" [attr.aria-labelledby]="headingId">
          <h1 class="legal-title" [id]="headingId">{{ title() }}</h1>

          @if (placeholdersOpen) {
            <p class="legal-notice legal-notice-warning" role="note">
              {{ 'legal.placeholders' | t }}
            </p>
          }
          @if (germanOnly()) {
            <p class="legal-notice" role="note" lang="en">{{ 'legal.germanOnly' | t }}</p>
          }

          <div class="legal-text" lang="de">
            <ng-content />
          </div>
        </article>

        <app-legal-links />
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background-color: var(--color-bg);
        color: var(--color-text);
      }

      .legal-shell {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 1.5rem 1rem 2.5rem;
      }

      .legal-header {
        width: min(100%, 48rem);
        margin-bottom: 1.25rem;
      }

      .legal-brand {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        color: var(--color-text);
        font-size: 1.2rem;
        font-weight: 700;
        text-decoration: none;
      }

      .legal-main {
        width: min(100%, 48rem);
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }

      .legal-card {
        padding: 1.5rem;
        border: 1px solid var(--color-border);
        border-radius: 0.75rem;
        background-color: var(--color-surface);
        overflow-wrap: anywhere;
      }

      .legal-title {
        margin: 0 0 1rem;
        font-size: 1.6rem;
        line-height: 1.25;
      }

      .legal-notice {
        margin: 0 0 1rem;
        padding: 0.65rem 0.8rem;
        border-radius: 0.5rem;
        background-color: var(--color-brand-soft);
        font-size: 0.9rem;
      }

      .legal-notice-warning {
        border-left: 4px solid var(--color-warning);
        background-color: var(--color-warning-light);
        font-weight: 600;
      }

      .legal-text {
        line-height: 1.6;
        font-size: 0.97rem;
      }

      .legal-text ::ng-deep h2 {
        margin: 1.75rem 0 0.5rem;
        font-size: 1.15rem;
        line-height: 1.3;
      }

      .legal-text ::ng-deep h3 {
        margin: 1.25rem 0 0.4rem;
        font-size: 1rem;
      }

      .legal-text ::ng-deep p,
      .legal-text ::ng-deep ul,
      .legal-text ::ng-deep ol {
        margin: 0 0 0.75rem;
      }

      .legal-text ::ng-deep ul,
      .legal-text ::ng-deep ol {
        padding-left: 1.4rem;
      }

      .legal-text ::ng-deep li {
        margin-bottom: 0.3rem;
      }

      .legal-text ::ng-deep a {
        color: var(--color-brand);
        font-weight: 600;
      }

      .legal-text ::ng-deep table {
        width: 100%;
        margin: 0 0 0.75rem;
        border-collapse: collapse;
        font-size: 0.92rem;
      }

      .legal-text ::ng-deep th,
      .legal-text ::ng-deep td {
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--color-border);
        text-align: left;
        vertical-align: top;
      }

      .legal-text ::ng-deep .legal-box {
        margin: 0 0 0.75rem;
        padding: 0.9rem 1rem;
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        background-color: var(--color-surface-raised);
      }

      .legal-text ::ng-deep address {
        font-style: normal;
      }

      @media (max-width: 480px) {
        .legal-card {
          padding: 1.1rem;
        }

        .legal-text ::ng-deep table {
          display: block;
          overflow-x: auto;
        }
      }
    `,
  ],
})
export class LegalPageComponent {
  private readonly i18n = inject(I18nService);

  readonly title = input.required<string>();
  readonly headingId = 'legal-title';
  protected readonly placeholdersOpen = hasOpenPlaceholders();

  /** Die Rechtstexte gibt es nur auf Deutsch; in anderen Sprachen ein Hinweis. */
  protected readonly germanOnly = computed(() => this.i18n.language() !== 'de');
}
