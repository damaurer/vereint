import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, describeApiError } from '../api/api-client.service';
import { TranslatePipe, translate } from '../i18n';
import {
  KIOSK_PIN_MAX_LENGTH,
  KIOSK_PIN_MIN_LENGTH,
  KioskApiService,
  type KioskStatus,
} from '../kiosk/kiosk-api.service';
import { formatDateTime } from '../member/member-format';
import { ModalComponent } from '../ui';
import { StateComponent } from '../ui/state.component';

const PIN_PATTERN = new RegExp(`^[0-9]{${KIOSK_PIN_MIN_LENGTH},${KIOSK_PIN_MAX_LENGTH}}$`);

/**
 * „Kiosk-PIN“ für Vorstand und Administration: legt die PIN fest, mit der sich
 * der Kiosk-Modus am Thekenterminal verlassen lässt. Die PIN gilt für alle
 * Terminals; der Fachservice speichert nur ihren Hash und zeigt sie nie wieder an.
 */
@Component({
  selector: 'app-board-kiosk-pin-modal',
  imports: [FormsModule, ModalComponent, StateComponent, TranslatePipe],
  template: `
    <vereint-modal [open]="open" [title]="'board.kioskPin.title' | t" (closed)="close()">
      <p class="member-hint">{{ 'board.kioskPin.intro' | t }}</p>

      @if (loading()) {
        <vereint-state kind="loading" [title]="'common.loading' | t" />
      } @else if (status(); as current) {
        <p class="member-list-meta" role="status">
          @if (current.pinConfigured) {
            {{
              (current.pinUpdatedByName ? 'board.kioskPin.setBy' : 'board.kioskPin.set')
                | t: { name: current.pinUpdatedByName ?? '', date: formatDateTime(current.pinUpdatedAt) }
            }}
          } @else {
            {{ 'board.kioskPin.notSet' | t }}
          }
        </p>
      }

      @if (saved()) {
        <p class="manage-action-info" role="status">{{ 'board.kioskPin.saved' | t }}</p>
      }

      <form class="kiosk-pin-form" (ngSubmit)="save()">
        <label class="manage-field">
          <span>{{ 'board.kioskPin.newPin' | t: { min: minLength, max: maxLength } }}</span>
          <input
            name="kioskNewPin"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="new-password"
            [attr.maxlength]="maxLength"
            [(ngModel)]="pin"
          />
        </label>
        <label class="manage-field">
          <span>{{ 'board.kioskPin.repeatPin' | t }}</span>
          <input
            name="kioskRepeatPin"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="new-password"
            [attr.maxlength]="maxLength"
            [(ngModel)]="repeat"
          />
        </label>

        @if (error(); as message) {
          <p class="manage-action-error" role="alert">{{ message }}</p>
        }

        <div class="kiosk-pin-actions">
          <button type="button" class="member-button member-button-ghost" (click)="close()">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="member-button" [disabled]="busy()">
            {{ 'board.kioskPin.save' | t }}
          </button>
        </div>
      </form>
    </vereint-modal>
  `,
  styles: [
    `
      .kiosk-pin-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .manage-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .manage-field input {
        padding: 0.5rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
        letter-spacing: 0.3em;
        background: var(--color-surface, #ffffff);
        color: inherit;
      }
      .kiosk-pin-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.5rem;
      }
    `,
  ],
})
export class KioskPinModalComponent implements OnChanges {
  private readonly api = inject(KioskApiService);

  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  protected readonly minLength = KIOSK_PIN_MIN_LENGTH;
  protected readonly maxLength = KIOSK_PIN_MAX_LENGTH;
  protected readonly formatDateTime = formatDateTime;

  protected readonly status = signal<KioskStatus | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected pin = '';
  protected repeat = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.reset();
      this.loadStatus();
    }
  }

  protected save(): void {
    if (this.busy()) return;
    const pin = this.pin.trim();
    this.saved.set(false);
    if (!PIN_PATTERN.test(pin)) {
      this.error.set(translate('board.kioskPin.format', { min: this.minLength, max: this.maxLength }));
      return;
    }
    if (pin !== this.repeat.trim()) {
      this.error.set(translate('board.kioskPin.mismatch'));
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.setPin(pin).subscribe({
      next: (status) => {
        this.busy.set(false);
        this.status.set(status);
        this.pin = '';
        this.repeat = '';
        this.saved.set(true);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(
          err instanceof ApiError && err.code === 'kiosk_pin_invalid_format' ? err.detail : describeApiError(err),
        );
      },
    });
  }

  protected close(): void {
    this.reset();
    this.closed.emit();
  }

  private loadStatus(): void {
    this.loading.set(true);
    this.api.status().subscribe({
      next: (status) => {
        this.loading.set(false);
        this.status.set(status);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(describeApiError(err));
      },
    });
  }

  private reset(): void {
    this.pin = '';
    this.repeat = '';
    this.error.set(null);
    this.saved.set(false);
  }
}
