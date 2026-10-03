import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-password-reset',
  imports: [RouterLink],
  template: `
    <div class="vereint-shell">
      <aside class="vereint-brand" aria-hidden="true">
        <div class="vereint-brand-inner">
          <img src="vereint-logo-mono.svg" alt="" class="vereint-brand-logo" width="440" height="140" />
          <p class="vereint-brand-claim">Dein Verein. Vereint.</p>
          <p class="vereint-brand-sub">Mitglieder, Events, Kasse und Theke an einem Ort – sicher und auf jedem Gerät.</p>
        </div>
        <div class="vereint-brand-nodes"></div>
      </aside>

      <main class="vereint-main">
        <header class="vereint-mobile-header">
          <a class="vereint-mobile-brand" routerLink="/login">
            <img src="vereint-logo.svg" alt="vereint" class="vereint-logo vereint-logo-light" width="440" height="140" />
            <img src="vereint-logo-mono.svg" alt="vereint" class="vereint-logo vereint-logo-dark" width="440" height="140" />
          </a>
        </header>

        <section class="vereint-card" aria-labelledby="reset-title">
          <div class="vereint-card-header">
            <div class="vereint-card-heading">
              <p class="vereint-eyebrow">Konto-Verwaltung</p>
              <h1 class="vereint-title" id="reset-title">Passwort zurücksetzen</h1>
            </div>
          </div>

          <div class="vereint-card-body">
            <p class="vereint-subtitle">
              Aus Sicherheitsgründen wird die Authentifizierung zentral über Keycloak verwaltet.
            </p>

            <div class="info-box">
              <p>
                Falls Sie Ihr Passwort vergessen haben, wenden Sie sich bitte an einen Vorstand oder Administrator Ihres Vereins
                oder nutzen Sie den Keycloak-Account-Service zur Passwort-Rücksetzung.
              </p>
            </div>

            <div class="login-links" style="margin-top: 1.5rem;">
              <a routerLink="/login" class="btn btn-primary" style="display: inline-block; text-align: center; width: 100%;">Zurück zur Anmeldung</a>
            </div>
          </div>
        </section>
      </main>
    </div>
  `,
  styleUrl: './login.component.css',
  styles: [
    `
      .info-box {
        background: var(--color-surface-subtle, #f8fafc);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 0.5rem);
        padding: 1rem 1.25rem;
        font-size: 0.95rem;
        line-height: 1.6;
        color: var(--color-text, #0f172a);
      }
      .info-box p {
        margin: 0;
      }
    `,
  ],
})
export class PasswordResetComponent {}
