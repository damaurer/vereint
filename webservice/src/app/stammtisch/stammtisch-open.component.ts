import { Component, afterNextRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../api/api-client.service';
import { MIN_PASSWORD_LENGTH } from '../auth/register.component';
import { AuthService } from '../auth/auth.service';
import { EMAIL_PATTERN } from '../auth/auth.types';
import { TranslatePipe, translate } from '../i18n';
import { describeInviteError } from '../invites/member-invites-api.service';
import { StammtischApiService, apiErrorText } from './stammtisch-api.service';

type OpenState = 'checking' | 'signup' | 'create' | 'done';

/** Grenzen des Fachservice (`SignupRequest`, `CreateStammtischRequest`). */
export const MAX_STAMMTISCH_NAME_LENGTH = 80;

/** Fehler beim Anlegen des Kontos; die Texte teilt sich die Seite mit der Einladung. */
const ACCOUNT_ERROR_CODES = new Set(['email_already_registered', 'password_rejected', 'registration_unavailable']);

/** Nach dem Eröffnen geht es zu Tarif und Einladungen des neuen Stammtischs. */
const AFTER_OPEN_ROUTE = '/gruppe';

/**
 * Eigenen Stammtisch eröffnen (`/gruppe-eroeffnen`), außerhalb der App-Shell.
 *
 * Ohne Session legt die Seite Konto und Stammtisch in einem Schritt an
 * (`POST /signup`, öffentlich); danach meldet sich die Person ganz normal über
 * Keycloak an. Mit Session genügt der Name (`POST /stammtische`): Die Seite
 * wählt den neuen Stammtisch für diese Session und öffnet seine Einstellungen.
 * In beiden Fällen ist die Person Admin des neuen Stammtischs.
 */
@Component({
  selector: 'app-stammtisch-open',
  imports: [FormsModule, RouterLink, TranslatePipe],
  styleUrl: '../auth/auth-status.component.css',
  template: `
    <div class="vereint-shell">
      <aside class="vereint-brand" aria-hidden="true">
        <div class="vereint-brand-inner">
          <img src="vereint-logo-mono.svg" alt="" class="vereint-brand-logo" width="440" height="140" />
          <p class="vereint-brand-claim">{{ 'auth.status.brandClaim' | t }}</p>
          <p class="vereint-brand-sub">{{ 'auth.status.brandSub' | t }}</p>
        </div>
        <div class="vereint-brand-nodes"></div>
      </aside>

      <main class="vereint-main">
        <header class="vereint-mobile-header">
          <span class="vereint-mobile-brand">
            <img src="vereint-logo.svg" alt="vereint" class="vereint-logo vereint-logo-light" width="440" height="140" />
            <img src="vereint-logo-mono.svg" alt="vereint" class="vereint-logo vereint-logo-dark" width="440" height="140" />
          </span>
        </header>

        <section class="vereint-card" aria-labelledby="open-title">
          <div class="vereint-card-header">
            <div class="vereint-card-heading">
              <p class="vereint-eyebrow">{{ 'stammtisch.open.eyebrow' | t }}</p>
              <h1 class="vereint-title" id="open-title">
                {{ (state() === 'done' ? 'stammtisch.open.doneTitle' : 'stammtisch.open.title') | t }}
              </h1>
            </div>
          </div>

          <div class="vereint-card-body">
            @switch (state()) {
              @case ('checking') {
                <p class="vereint-subtitle" role="status">{{ 'stammtisch.open.checking' | t }}</p>
              }
              @case ('create') {
                <p class="vereint-subtitle">{{ 'stammtisch.open.createIntro' | t }}</p>
                <p class="open-plan">{{ 'stammtisch.open.planInfo' | t }}</p>
                <form class="open-form" (ngSubmit)="create()" novalidate>
                  <label class="member-field">
                    <span>{{ 'stammtisch.open.name' | t }}</span>
                    <input name="stammtischName" required [attr.maxlength]="maxNameLength" [(ngModel)]="stammtischName" />
                  </label>

                  @if (error()) {
                    <div class="state-card state-error login-error" role="alert">
                      <span>{{ error() }}</span>
                    </div>
                  }

                  <div class="login-form">
                    <button type="submit" [disabled]="submitting()">
                      {{ (submitting() ? 'stammtisch.open.submitting' : 'stammtisch.open.submit') | t }}
                    </button>
                  </div>
                </form>
                <p class="open-links">
                  <a routerLink="/gruppen">{{ 'stammtisch.open.back' | t }}</a>
                </p>
              }
              @case ('signup') {
                <p class="vereint-subtitle">{{ 'stammtisch.open.intro' | t }}</p>
                <p class="open-plan">{{ 'stammtisch.open.planInfo' | t }}</p>
                <form class="open-form" (ngSubmit)="signup()" novalidate>
                  <label class="member-field">
                    <span>{{ 'stammtisch.open.name' | t }}</span>
                    <input name="stammtischName" required [attr.maxlength]="maxNameLength" [(ngModel)]="stammtischName" />
                  </label>
                  <label class="member-field">
                    <span>{{ 'auth.register.firstName' | t }}</span>
                    <input name="firstName" autocomplete="given-name" required maxlength="100" [(ngModel)]="firstName" />
                  </label>
                  <label class="member-field">
                    <span>{{ 'auth.register.lastName' | t }}</span>
                    <input name="lastName" autocomplete="family-name" required maxlength="100" [(ngModel)]="lastName" />
                  </label>
                  <label class="member-field">
                    <span>{{ 'auth.register.email' | t }}</span>
                    <input name="email" type="email" autocomplete="email" required maxlength="254" [(ngModel)]="email" />
                  </label>
                  <label class="member-field">
                    <span>{{ 'auth.register.password' | t: { min: minPasswordLength } }}</span>
                    <input
                      name="password"
                      type="password"
                      autocomplete="new-password"
                      required
                      [attr.minlength]="minPasswordLength"
                      maxlength="128"
                      [(ngModel)]="password"
                    />
                  </label>
                  <label class="member-field">
                    <span>{{ 'auth.register.passwordRepeat' | t }}</span>
                    <input
                      name="passwordRepeat"
                      type="password"
                      autocomplete="new-password"
                      required
                      maxlength="128"
                      [(ngModel)]="passwordRepeat"
                    />
                  </label>

                  @if (error()) {
                    <div class="state-card state-error login-error" role="alert">
                      <span>{{ error() }}</span>
                    </div>
                  }

                  <div class="login-form">
                    <button type="submit" [disabled]="submitting()">
                      {{ (submitting() ? 'stammtisch.open.submitting' : 'stammtisch.open.submit') | t }}
                    </button>
                  </div>
                </form>
                <p class="open-links">
                  {{ 'stammtisch.open.haveAccount' | t }}
                  <button type="button" class="open-link-button" (click)="login('/gruppe-eroeffnen')">
                    {{ 'stammtisch.open.loginFirst' | t }}
                  </button>
                </p>
              }
              @case ('done') {
                <p class="vereint-subtitle">
                  {{ 'stammtisch.open.done' | t: { name: openedName(), email: registeredEmail() } }}
                </p>
                <div class="login-form">
                  <button type="button" (click)="login(afterOpenRoute)">{{ 'auth.register.loginNow' | t }}</button>
                </div>
              }
            }
          </div>
        </section>
      </main>
    </div>
  `,
  styles: [
    `
      .open-form {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }

      .open-plan {
        margin: 0 0 1rem;
        padding: 0.65rem 0.8rem;
        border-radius: 0.5rem;
        background-color: var(--color-brand-soft);
        color: var(--color-text);
        font-size: 0.9rem;
      }

      .open-links {
        margin: 0;
        font-size: 0.9rem;
        color: var(--color-text-muted);
      }

      .open-links a,
      .open-link-button {
        padding: 0;
        border: none;
        background: none;
        color: var(--color-brand);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
    `,
  ],
})
export class StammtischOpenComponent {
  private readonly api = inject(StammtischApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  protected readonly maxNameLength = MAX_STAMMTISCH_NAME_LENGTH;
  protected readonly afterOpenRoute = AFTER_OPEN_ROUTE;

  protected readonly state = signal<OpenState>('checking');
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly registeredEmail = signal('');
  protected readonly openedName = signal('');

  protected stammtischName = '';
  protected firstName = '';
  protected lastName = '';
  protected email = '';
  protected password = '';
  protected passwordRepeat = '';

  constructor() {
    afterNextRender(() => void this.start());
  }

  /** Angemeldet genügt der Name; sonst entsteht zusätzlich ein Konto. */
  async start(): Promise<void> {
    const session = await this.auth.getSession().catch(() => null);
    this.state.set(session ? 'create' : 'signup');
  }

  protected signup(): void {
    if (this.submitting()) return;
    const stammtischName = this.stammtischName.trim();
    const firstName = this.firstName.trim();
    const lastName = this.lastName.trim();
    const email = this.email.trim();

    if (!stammtischName) {
      this.error.set(translate('stammtisch.open.errors.nameRequired'));
      return;
    }
    if (!firstName || !lastName) {
      this.error.set(translate('auth.register.errors.nameRequired'));
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      this.error.set(translate('auth.register.errors.emailInvalid'));
      return;
    }
    if (this.password.length < MIN_PASSWORD_LENGTH) {
      this.error.set(translate('auth.register.errors.passwordTooShort', { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (this.password !== this.passwordRepeat) {
      this.error.set(translate('auth.register.errors.passwordMismatch'));
      return;
    }

    this.error.set(null);
    this.submitting.set(true);
    this.api.signup({ stammtischName, firstName, lastName, email, password: this.password }).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.password = '';
        this.passwordRepeat = '';
        this.registeredEmail.set(result.email);
        this.openedName.set(result.stammtischName);
        this.state.set('done');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(this.describe(err));
      },
    });
  }

  /** Angemeldet eröffnen, den neuen Stammtisch wählen und seine Einstellungen öffnen. */
  protected create(): void {
    if (this.submitting()) return;
    const name = this.stammtischName.trim();
    if (!name) {
      this.error.set(translate('stammtisch.open.errors.nameRequired'));
      return;
    }

    this.error.set(null);
    this.submitting.set(true);
    this.api.createOwn(name).subscribe({
      next: async (created) => {
        const ok = await this.auth.selectStammtisch(created.id);
        if (!ok) {
          this.submitting.set(false);
          this.error.set(translate('stammtisch.open.errors.selectFailed'));
          return;
        }
        await this.auth.getSession(true);
        this.submitting.set(false);
        await this.router.navigateByUrl(AFTER_OPEN_ROUTE);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(this.describe(err));
      },
    });
  }

  protected login(returnTo: string): void {
    if (this.auth.isAvailable()) {
      this.auth.startLogin(returnTo);
    }
  }

  private describe(err: unknown): string {
    const code = err instanceof ApiError ? err.code : '';
    if (code === 'validation_failed' || code === 'invalid_request') {
      return translate('stammtisch.open.errors.checkInput', { min: MIN_PASSWORD_LENGTH, max: MAX_STAMMTISCH_NAME_LENGTH });
    }
    // Konto-Fehler (E-Mail vergeben, Passwort abgelehnt) wie bei der Einladung.
    if (ACCOUNT_ERROR_CODES.has(code)) return describeInviteError(code)!;
    return apiErrorText(err);
  }
}
