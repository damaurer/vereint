import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../i18n';
import { StatusBadgeComponent } from '../ui';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, StatusBadgeComponent, TranslatePipe],
  template: `
    <div class="error-page-container">
      <div class="error-card">
        <div class="error-header">
          <vereint-status-badge label="404" tone="neutral" />
          <h1 class="error-title">{{ 'errorPages.notFound.title' | t }}</h1>
        </div>
        <p class="error-description">
          {{ 'errorPages.notFound.description' | t }}
        </p>
        <div class="error-actions">
          <a routerLink="/dashboard" class="btn btn-primary">{{ 'errorPages.toDashboard' | t }}</a>
          <a routerLink="/" class="btn btn-secondary">{{ 'errorPages.toHome' | t }}</a>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .error-page-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 70vh;
        padding: 1.5rem;
      }
      .error-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-lg, 1rem);
        padding: 2.5rem;
        max-width: 32rem;
        width: 100%;
        text-align: center;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }
      .error-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }
      .error-title {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0;
        color: var(--color-text, #0f172a);
      }
      .error-description {
        color: var(--color-text-muted, #64748b);
        margin: 0 0 2rem 0;
        line-height: 1.6;
      }
      .error-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.75rem 1.5rem;
        font-weight: 600;
        font-size: 0.95rem;
        border-radius: var(--radius-md, 0.5rem);
        text-decoration: none;
        transition: background-color 0.2s, color 0.2s;
      }
      .btn-primary {
        background-color: var(--color-brand, #3b82f6);
        color: #ffffff;
      }
      .btn-primary:hover {
        background-color: var(--color-brand-hover, #2563eb);
      }
      .btn-secondary {
        background-color: var(--color-surface-subtle, #f1f5f9);
        color: var(--color-text, #0f172a);
        border: 1px solid var(--color-border, #e2e8f0);
      }
      .btn-secondary:hover {
        background-color: var(--color-surface-hover, #e2e8f0);
      }
    `,
  ],
})
export class NotFoundComponent {}
