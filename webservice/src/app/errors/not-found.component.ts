import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../i18n';
import { IconComponent } from '../ui/icon.component';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, IconComponent, TranslatePipe],
  template: `
    <main class="error-page">
      <span class="error-icon" aria-hidden="true"><vereint-icon name="search" /></span>
      <span class="eyebrow">{{ 'errorPages.eyebrow' | t: { code: '404' } }}</span>
      <h1 class="error-title">{{ 'errorPages.notFound.title' | t }}</h1>
      <p class="error-description">{{ 'errorPages.notFound.description' | t }}</p>
      <a routerLink="/dashboard" class="member-button error-primary">{{ 'errorPages.toDashboard' | t }}</a>
    </main>
  `,
  styles: [
    `
      .error-page {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.5rem;
        min-height: 70vh;
        max-width: 28rem;
        margin: 0 auto;
        padding: 1.5rem var(--space-3);
      }
      .error-icon {
        display: inline-grid;
        place-items: center;
        width: 4.5rem;
        height: 4.5rem;
        margin-bottom: 1rem;
        border-radius: 999px;
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
        font-size: 1.6rem;
      }
      .error-title {
        margin: 0;
        font-size: clamp(1.75rem, 2.5vw, 2rem);
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 1.15;
      }
      .error-description {
        margin: 0 0 1rem;
        color: var(--color-text-muted);
        line-height: 1.5;
      }
      .error-primary {
        display: flex;
        justify-content: center;
        min-height: 3rem;
        align-items: center;
        text-decoration: none;
      }
      .error-secondary {
        align-self: center;
        margin-top: 0.5rem;
        color: var(--color-brand);
        font-weight: 600;
      }
    `,
  ],
})
export class NotFoundComponent {}
