import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiClient, describeApiError } from '../api/api-client.service';
import { StatusBadgeComponent } from '../ui';

interface AcceptInviteResponse {
  guestToken: string;
  eventId: string;
  eventTitle: string;
  displayName: string;
  status: string;
  expiresAt: string;
}

@Component({
  selector: 'app-invite-accept',
  imports: [FormsModule, RouterLink, StatusBadgeComponent],
  template: `
    <div class="invite-page-container">
      <div class="invite-card">
        <div class="invite-header">
          <vereint-status-badge label="Einladung" tone="neutral" />
          <h1 class="invite-title">Event-Einladung annehmen</h1>
        </div>

        @if (!token) {
          <div class="state-card state-error" role="alert">
            <strong>Ungültiger Einladungslink</strong>
            <p>Dieser Link enthält kein Einladungs-Token. Bitte nutzen Sie den vollständigen Link aus Ihrer Einladung.</p>
            <a routerLink="/" class="btn btn-secondary">Zurück zur Startseite</a>
          </div>
        } @else if (loading()) {
          <div class="state-loading" role="status">
            <p>Einladung wird geprüft und aktiviert …</p>
          </div>
        } @else if (error()) {
          <div class="state-card state-error" role="alert">
            <strong>Einladung konnte nicht eingelöst werden</strong>
            <p>{{ error() }}</p>
            <div class="action-buttons">
              <button type="button" class="btn btn-primary" (click)="accept()">Erneut versuchen</button>
              <a routerLink="/" class="btn btn-secondary">Zur Startseite</a>
            </div>
          </div>
        } @else {
          <form class="invite-form" (submit)="onSubmit($event)">
            <p class="invite-description">
              Geben Sie optional Ihren Namen ein, um dem Event als Gast beizutreten.
            </p>
            <div class="form-group">
              <label for="displayName" class="form-label">Ihr Name / Spitzname (optional)</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                class="form-input"
                [(ngModel)]="displayName"
                placeholder="z. B. Max Mustermann"
                maxlength="255"
              />
            </div>
            <div class="action-buttons">
              <button type="submit" class="btn btn-primary" [disabled]="submitting()">
                {{ submitting() ? 'Beitreten …' : 'Event beitreten' }}
              </button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .invite-page-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 70vh;
        padding: 1.5rem;
      }
      .invite-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-lg, 1rem);
        padding: 2.5rem;
        max-width: 32rem;
        width: 100%;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }
      .invite-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
        text-align: center;
      }
      .invite-title {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0;
        color: var(--color-text, #0f172a);
      }
      .invite-description {
        color: var(--color-text-muted, #64748b);
        margin: 0 0 1.5rem 0;
        line-height: 1.6;
        text-align: center;
      }
      .form-group {
        margin-bottom: 1.5rem;
      }
      .form-label {
        display: block;
        font-weight: 600;
        font-size: 0.9rem;
        margin-bottom: 0.5rem;
        color: var(--color-text, #0f172a);
      }
      .form-input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-md, 0.5rem);
        font: inherit;
        box-sizing: border-box;
      }
      .action-buttons {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 1rem;
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
        border: none;
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s;
      }
      .btn-primary {
        background-color: var(--color-brand, #3b82f6);
        color: #ffffff;
      }
      .btn-primary:hover:not(:disabled) {
        background-color: var(--color-brand-hover, #2563eb);
      }
      .btn-primary:disabled {
        opacity: 0.7;
        cursor: not-allowed;
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
      .state-loading {
        text-align: center;
        padding: 2rem 0;
        color: var(--color-text-muted, #64748b);
      }
    `,
  ],
})
export class InviteAcceptComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  protected displayName = '';
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (this.token) {
      // Automatische Einlösung, falls kein Name abgefragt werden muss
      this.accept();
    }
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.accept();
  }

  protected accept(): void {
    if (!this.token) return;

    this.loading.set(true);
    this.submitting.set(true);
    this.error.set(null);

    const payload: { token: string; displayName?: string } = {
      token: this.token,
    };
    if (this.displayName.trim()) {
      payload.displayName = this.displayName.trim();
    }

    this.api.post<AcceptInviteResponse>('/invites/accept', payload).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.submitting.set(false);
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('guestToken', response.guestToken);
        }
        void this.router.navigate(['/guest', response.eventId], {
          queryParams: {
            token: response.guestToken,
            title: response.eventTitle,
          },
        });
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.submitting.set(false);
        this.error.set(describeApiError(err));
      },
    });
  }
}
