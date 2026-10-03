import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '../ui';

@Component({
  selector: 'app-register-invite',
  imports: [RouterLink, StatusBadgeComponent],
  template: `
    <div class="register-page-container">
      <div class="register-card">
        <div class="register-header">
          <vereint-status-badge label="Mitgliedschaft" tone="neutral" />
          <h1 class="register-title">Einladung zum Verein</h1>
        </div>

        @if (!inviteCode) {
          <div class="state-card state-error" role="alert">
            <strong>Ungültiger Registrierungscode</strong>
            <p>Dieser Link enthält keinen gültigen Einladungscode.</p>
            <a routerLink="/login" class="btn btn-secondary">Zur Startseite</a>
          </div>
        } @else {
          <div class="invite-content">
            <p class="register-description">
              Du wurdest eingeladen, Mitglied bei den „Durstigen Ebern“ zu werden!
            </p>

            <div class="code-box">
              <span class="code-label">Dein Einladungscode:</span>
              <strong class="code-value">{{ inviteCode }}</strong>
            </div>

            <p class="register-hint">
              Klicke auf den unten stehenden Button, um deine Registrierung über Keycloak abzuschließen oder wende dich an den Vereinsvorstand.
            </p>

            <div class="action-buttons">
              <a routerLink="/login" class="btn btn-primary">Weiter zur Anmeldung & Registrierung</a>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .register-page-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 70vh;
        padding: 1.5rem;
      }
      .register-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-lg, 1rem);
        padding: 2.5rem;
        max-width: 32rem;
        width: 100%;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }
      .register-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
        text-align: center;
      }
      .register-title {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0;
        color: var(--color-text, #0f172a);
      }
      .register-description {
        color: var(--color-text-muted, #64748b);
        margin: 0 0 1.5rem 0;
        line-height: 1.6;
        text-align: center;
      }
      .code-box {
        background: var(--color-surface-subtle, #f8fafc);
        border: 2px dashed var(--color-brand, #3b82f6);
        border-radius: var(--radius-md, 0.5rem);
        padding: 1rem;
        text-align: center;
        margin-bottom: 1.5rem;
      }
      .code-label {
        display: block;
        font-size: 0.85rem;
        color: var(--color-text-muted, #64748b);
        margin-bottom: 0.25rem;
      }
      .code-value {
        font-size: 1.25rem;
        letter-spacing: 0.05em;
        color: var(--color-brand, #3b82f6);
      }
      .register-hint {
        font-size: 0.9rem;
        color: var(--color-text-muted, #64748b);
        line-height: 1.5;
        text-align: center;
        margin-bottom: 1.5rem;
      }
      .action-buttons {
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
      .state-card {
        padding: 1.25rem;
        border-radius: var(--radius-md, 0.5rem);
        margin-bottom: 1rem;
        text-align: center;
      }
      .state-error {
        background-color: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
      }
    `,
  ],
})
export class RegisterInviteComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly inviteCode = this.route.snapshot.paramMap.get('inviteCode') ?? '';
}
