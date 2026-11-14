import { Component, afterNextRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiError } from '../api/api-client.service';
import { MemberInvitesApiService, describeInviteError } from '../invites/member-invites-api.service';
import { formatDateTime } from '../member/member-format';
import { AuthService } from './auth.service';
import { EMAIL_PATTERN } from './auth.types';
import { TranslatePipe, translate } from '../i18n';
import { StammtischApiService } from '../stammtisch/stammtisch-api.service';
import { LegalLinksComponent } from '../legal/legal-links.component';
import { TermsConsentComponent } from '../legal/terms-consent.component';

type RegisterState = 'checking' | 'invalid' | 'form' | 'done';

/** Muss zu `MemberInviteService.MIN_PASSWORD_LENGTH` im Fachservice passen. */
export const MIN_PASSWORD_LENGTH = 10;

/** Format eines Einladungstokens (base64url, 32 Byte Zufall). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

/**
 * Öffentliche Registrierung per Einladungslink (`/register#<token>`).
 *
 * Das Token steht im URL-Fragment: Der Browser schickt es nie an den Server,
 * es landet daher weder in Zugriffslogs noch im Referer. Die Seite liest es
 * nach dem Rendern im Browser, entfernt es aus der Adresszeile und schickt es
 * nur im Body an den Fachservice. Dort entscheidet sich, ob der Link gilt; das
 * neue Konto erhält ausschließlich die Rolle `member`.
 */
@Component({
  selector: 'app-register',
  imports: [FormsModule, TranslatePipe, TermsConsentComponent, LegalLinksComponent],
  styleUrl: './auth-status.component.css',
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

        <section class="vereint-card" aria-labelledby="register-title">
          <div class="vereint-card-header">
            <div class="vereint-card-heading">
              <p class="vereint-eyebrow">{{ 'auth.register.eyebrow' | t }}</p>
              <h1 class="vereint-title" id="register-title">
                {{ (state() === 'done' ? 'auth.register.doneTitle' : state() === 'form' && signedIn() ? 'auth.register.joinTitle' : 'auth.register.title') | t }}
              </h1>
            </div>
          </div>

          <div class="vereint-card-body">
            @switch (state()) {
              @case ('checking') {
                <p class="vereint-subtitle" role="status">{{ 'auth.register.checking' | t }}</p>
              }
              @case ('invalid') {
                <div class="state-card state-error login-error" role="alert">
                  <strong>{{ 'auth.register.invalidTitle' | t }}</strong>
                  <span>{{ error() }}</span>
                </div>
                <div class="login-form">
                  <button type="button" (click)="login()">{{ 'auth.register.toLogin' | t }}</button>
                </div>
              }
              @case ('form') {
                @if (signedIn()) {
                  <p class="vereint-subtitle">{{ 'auth.register.joinIntro' | t }}</p>
                  @if (error()) {
                    <div class="state-card state-error login-error" role="alert">
                      <span>{{ error() }}</span>
                    </div>
                  }
                  <div class="login-form">
                    <button type="button" [disabled]="submitting()" (click)="join()">
                      {{ (submitting() ? 'auth.register.joining' : 'auth.register.join') | t }}
                    </button>
                  </div>
                } @else {
                <p class="vereint-subtitle">
                  {{ 'auth.register.intro' | t }}
                  @if (expiresAt()) {
                    {{ 'auth.register.validUntil' | t: { date: formatDateTime(expiresAt()!) } }}
                  }
                </p>
                <form class="register-form" (ngSubmit)="submit()" novalidate>
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

                  <app-terms-consent [(accepted)]="acceptTerms" />

                  @if (error()) {
                    <div class="state-card state-error login-error" role="alert">
                      <span>{{ error() }}</span>
                    </div>
                  }

                  <div class="login-form">
                    <button type="submit" [disabled]="submitting()">
                      {{ (submitting() ? 'auth.register.submitting' : 'auth.register.submit') | t }}
                    </button>
                  </div>
                </form>
                }
              }
              @case ('done') {
                <p class="vereint-subtitle">
                  {{ 'auth.register.done' | t: { email: registeredEmail() } }}
                </p>
                <div class="login-form">
                  <button type="button" (click)="login()">{{ 'auth.register.loginNow' | t }}</button>
                </div>
              }
            }
          </div>
        </section>

        <app-legal-links />
      </main>
    </div>
  `,
  styles: [
    `
      .register-form {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }
    `,
  ],
})
export class RegisterComponent {
  private readonly invites = inject(MemberInvitesApiService);
  private readonly auth = inject(AuthService);
  private readonly stammtische = inject(StammtischApiService);
  private readonly router = inject(Router);

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  protected readonly formatDateTime = formatDateTime;

  protected readonly state = signal<RegisterState>('checking');
  protected readonly error = signal<string | null>(null);
  protected readonly expiresAt = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly registeredEmail = signal('');
  /** Bereits angemeldet: statt eines neuen Kontos dem Stammtisch des Links beitreten. */
  protected readonly signedIn = signal(false);

  protected firstName = '';
  protected lastName = '';
  protected email = '';
  protected password = '';
  protected passwordRepeat = '';
  protected readonly acceptTerms = signal(false);

  private token = '';

  constructor() {
    afterNextRender(() => this.start(globalThis.location?.hash ?? ''));
  }

  /** Liest das Token aus dem Fragment und prüft den Link beim Fachservice. */
  start(hash: string): void {
    const token = hash.replace(/^#/, '').trim();
    // Das Token nicht in der Adresszeile oder im Verlauf stehen lassen.
    if (hash && typeof globalThis.history?.replaceState === 'function') {
      globalThis.history.replaceState(null, '', globalThis.location.pathname);
    }
    if (!TOKEN_PATTERN.test(token)) {
      this.fail(translate('auth.register.errors.noToken'));
      return;
    }
    this.token = token;
    void this.auth
      .getSession()
      .then((session) => this.signedIn.set(session !== null))
      .catch(() => undefined);
    this.invites.preview(token).subscribe({
      next: (preview) => {
        this.expiresAt.set(preview.expiresAt);
        this.state.set('form');
      },
      error: (err: unknown) => this.fail(this.describe(err)),
    });
  }

  protected submit(): void {
    if (this.submitting()) return;
    const firstName = this.firstName.trim();
    const lastName = this.lastName.trim();
    const email = this.email.trim();

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
    if (!this.acceptTerms()) {
      this.error.set(translate('legal.acceptRequired'));
      return;
    }

    this.error.set(null);
    this.submitting.set(true);
    this.invites
      .register({ token: this.token, firstName, lastName, email, password: this.password, acceptTerms: true })
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          this.password = '';
          this.passwordRepeat = '';
          this.registeredEmail.set(result.email);
          this.state.set('done');
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          const code = err instanceof ApiError ? err.code : '';
          // Ist der Link selbst nicht mehr gültig, hilft das Formular nicht weiter.
          if (['not_found', 'invitation_expired', 'invitation_revoked', 'invitation_used_up'].includes(code)) {
            this.fail(this.describe(err));
            return;
          }
          this.error.set(this.describe(err));
        },
      });
  }

  /** Angemeldet beitreten, den Stammtisch wählen und zur Startseite wechseln. */
  protected join(): void {
    if (this.submitting()) return;
    this.error.set(null);
    this.submitting.set(true);
    this.stammtische.join(this.token).subscribe({
      next: async (result) => {
        await this.auth.selectStammtisch(result.stammtischId);
        await this.auth.getSession(true);
        this.submitting.set(false);
        await this.router.navigateByUrl('/');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        const code = err instanceof ApiError ? err.code : '';
        const message =
          describeInviteError(code) ?? ((err instanceof ApiError && err.detail) || translate('admin.invite.errors.unavailable'));
        if (['not_found', 'invitation_expired', 'invitation_revoked', 'invitation_used_up'].includes(code)) {
          this.fail(message);
          return;
        }
        this.error.set(message);
      },
    });
  }

  protected login(): void {
    if (this.auth.isAvailable()) {
      this.auth.startLogin('/dashboard');
    }
  }

  private fail(message: string): void {
    this.error.set(message);
    this.state.set('invalid');
  }

  private describe(err: unknown): string {
    const code = err instanceof ApiError ? err.code : '';
    if (code === 'validation_failed' || code === 'invalid_request') {
      return translate('auth.register.errors.checkInput', { min: MIN_PASSWORD_LENGTH });
    }
    return describeInviteError(code) ?? translate('admin.invite.errors.unavailable');
  }
}
