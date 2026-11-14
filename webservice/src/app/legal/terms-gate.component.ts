import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthNavigationService } from '../auth/auth-navigation.service';
import { TranslatePipe } from '../i18n';
import { IconComponent } from '../ui/icon.component';
import { LegalLinksComponent } from './legal-links.component';
import { LEGAL_OPERATOR, TERMS_DATE_LABEL } from './legal-operator';
import { TermsStatusService } from './terms-status.service';

/**
 * AGB-Sperre nach dem Login (`/agb-zustimmen`).
 *
 * Erscheint, wenn das Konto der gültigen AGB-Fassung noch nicht zugestimmt
 * hat (bestehende und vom Admin angelegte Konten). „Zustimmen“ speichert
 * Fassung und Zeitpunkt im Fachservice und führt zurück zur gewünschten Seite.
 * Wer nicht zustimmt, kann sich nur abmelden; Impressum und AGB bleiben
 * erreichbar.
 */
@Component({
  selector: 'app-terms-gate',
  imports: [TranslatePipe, IconComponent, LegalLinksComponent],
  template: `
    <main class="gate">
      <span class="gate-icon" aria-hidden="true"><vereint-icon name="lock" /></span>
      <span class="eyebrow">{{ 'legal.consent.eyebrow' | t }}</span>
      <h1 class="gate-title">{{ 'legal.consent.title' | t }}</h1>
      <p>{{ 'legal.consent.intro' | t: { date: dateLabel } }}</p>
      <p>{{ 'legal.consent.statistics' | t }}</p>
      <p>
        <a class="gate-link" href="/agb" target="_blank" rel="noopener">{{ 'legal.consent.readTerms' | t }}</a>
      </p>

      @if (failed()) {
        <p class="gate-error" role="alert">{{ 'legal.consent.failed' | t }}</p>
      }

      <button type="button" class="member-button gate-primary" [disabled]="saving()" (click)="accept()" data-testid="accept-terms">
        {{ (saving() ? 'legal.consent.accepting' : 'legal.consent.accept') | t }}
      </button>
      <button type="button" class="gate-secondary" [disabled]="saving()" (click)="decline()" data-testid="decline-terms">
        {{ 'legal.consent.decline' | t }}
      </button>

      <p class="gate-hint">{{ 'legal.consent.deleteHint' | t: { email: email } }}</p>
      <app-legal-links />
    </main>
  `,
  styles: [
    `
      .gate {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        min-height: 70vh;
        justify-content: center;
        max-width: 32rem;
        margin: 0 auto;
        padding: 1.5rem var(--space-3);
        line-height: 1.5;
      }

      .gate p {
        margin: 0;
      }

      .gate-icon {
        display: inline-grid;
        place-items: center;
        width: 4rem;
        height: 4rem;
        margin-bottom: 0.5rem;
        border-radius: 999px;
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
        font-size: 1.5rem;
      }

      .gate-title {
        margin: 0;
        font-size: clamp(1.6rem, 2.5vw, 2rem);
        font-weight: 800;
        line-height: 1.15;
      }

      .gate-link {
        color: var(--color-brand);
        font-weight: 700;
      }

      .gate-primary {
        margin-top: 0.75rem;
      }

      .gate-secondary {
        min-height: var(--vereint-control-height);
        border: 1px solid var(--color-border-dark);
        border-radius: var(--vereint-control-radius);
        background: transparent;
        color: var(--color-text);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }

      .gate-error {
        padding: 0.6rem 0.8rem;
        border-radius: var(--radius-md);
        background: var(--color-danger-light);
        color: var(--color-danger);
      }

      .gate-hint {
        margin-top: 0.5rem;
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class TermsGateComponent {
  private readonly terms = inject(TermsStatusService);
  private readonly navigation = inject(AuthNavigationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly dateLabel = TERMS_DATE_LABEL;
  protected readonly email = LEGAL_OPERATOR.email;
  protected readonly saving = signal(false);
  protected readonly failed = signal(false);

  protected async accept(): Promise<void> {
    this.saving.set(true);
    this.failed.set(false);
    const ok = await this.terms.accept();
    this.saving.set(false);
    if (!ok) {
      this.failed.set(true);
      return;
    }
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    const target = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
    await this.router.navigateByUrl(target);
  }

  protected async decline(): Promise<void> {
    this.terms.clear();
    await this.navigation.logout();
  }
}
