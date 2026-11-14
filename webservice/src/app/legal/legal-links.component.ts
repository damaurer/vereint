import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../i18n';

/** Fußzeile mit Impressum und AGB für öffentliche Seiten und das Menü. */
@Component({
  selector: 'app-legal-links',
  imports: [RouterLink, TranslatePipe],
  template: `
    <nav class="legal-links" [attr.aria-label]="'legal.nav' | t">
      <a routerLink="/impressum">{{ 'legal.imprint' | t }}</a>
      <span aria-hidden="true">·</span>
      <a routerLink="/agb">{{ 'legal.terms' | t }}</a>
    </nav>
  `,
  styles: [
    `
      .legal-links {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }

      .legal-links a {
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 0.15em;
      }

      .legal-links a:hover,
      .legal-links a:focus-visible {
        color: var(--color-brand);
      }
    `,
  ],
})
export class LegalLinksComponent {}
