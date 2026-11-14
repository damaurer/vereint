import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, describeApiError } from '../api/api-client.service';
import { TranslatePipe, translate } from '../i18n';
import { ModalComponent } from '../ui';
import {
  KIOSK_PIN_MAX_LENGTH,
  KIOSK_PIN_MIN_LENGTH,
  KIOSK_PIN_PATTERN,
  KioskApiService,
  type KioskSession,
} from './kiosk-api.service';

/** Zuletzt verwendeter Gerätename, damit er beim nächsten Start vorausgefüllt ist. */
const LABEL_KEY = 'vereint.kiosk.label';

/**
 * Startet den Kiosk-Modus auf diesem Gerät. Hier wird die PIN vergeben, mit der
 * sich der Modus später am Gerät wieder verlassen lässt; der Fachservice
 * speichert nur ihren Hash. Der Gerätename erscheint in der Übersicht, aus der
 * Vorstand und Administration ein Gerät jederzeit entsperren können.
 */
@Component({
  selector: 'app-kiosk-start-dialog',
  imports: [FormsModule, ModalComponent, TranslatePipe],
  template: `
    <vereint-modal [open]="open" [title]="'kiosk.start.title' | t" (closed)="close()">
      <form class="kiosk-start-form" (ngSubmit)="submit()">
        <p class="member-hint">{{ 'kiosk.start.intro' | t }}</p>
        <label class="kiosk-start-field">
          <span>{{ 'kiosk.start.label' | t }}</span>
          <input name="kioskLabel" maxlength="60" [(ngModel)]="label" [placeholder]="'kiosk.start.labelPlaceholder' | t" />
        </label>
        <label class="kiosk-start-field">
          <span>{{ 'kiosk.start.pin' | t: { min: minLength, max: maxLength } }}</span>
          <input
            name="kioskPin"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="new-password"
            [attr.maxlength]="maxLength"
            [(ngModel)]="pin"
          />
        </label>
        <label class="kiosk-start-field">
          <span>{{ 'kiosk.start.repeat' | t }}</span>
          <input
            name="kioskPinRepeat"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="new-password"
            [attr.maxlength]="maxLength"
            [(ngModel)]="repeat"
          />
        </label>
        <p class="member-hint">{{ 'kiosk.start.remoteHint' | t }}</p>
        @if (error(); as message) {
          <p class="manage-action-error" role="alert">{{ message }}</p>
        }
        <div class="kiosk-start-actions">
          <button type="button" class="member-button member-button-ghost" (click)="close()">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="member-button" [disabled]="busy()">
            {{ 'kiosk.start.submit' | t }}
          </button>
        </div>
      </form>
    </vereint-modal>
  `,
  styles: [
    `
      .kiosk-start-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .kiosk-start-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .kiosk-start-field input {
        padding: 0.5rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
        background: var(--color-surface, #ffffff);
        color: inherit;
      }
      .kiosk-start-field input[type='password'] {
        letter-spacing: 0.3em;
      }
      .kiosk-start-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.5rem;
      }
    `,
  ],
})
export class KioskStartDialogComponent implements OnChanges {
  private readonly api = inject(KioskApiService);

  @Input() open = false;
  @Output() started = new EventEmitter<KioskSession>();
  @Output() closed = new EventEmitter<void>();

  protected readonly minLength = KIOSK_PIN_MIN_LENGTH;
  protected readonly maxLength = KIOSK_PIN_MAX_LENGTH;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected label = '';
  protected pin = '';
  protected repeat = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.pin = '';
      this.repeat = '';
      this.error.set(null);
      this.label = readLabel();
    }
  }

  protected submit(): void {
    if (this.busy()) return;
    const pin = this.pin.trim();
    if (!KIOSK_PIN_PATTERN.test(pin)) {
      this.error.set(translate('kiosk.start.format', { min: this.minLength, max: this.maxLength }));
      return;
    }
    if (pin !== this.repeat.trim()) {
      this.error.set(translate('kiosk.start.mismatch'));
      return;
    }
    const label = this.label.trim();
    this.busy.set(true);
    this.error.set(null);
    this.api.start(pin, label).subscribe({
      next: (session) => {
        this.busy.set(false);
        this.pin = '';
        this.repeat = '';
        writeLabel(label);
        this.started.emit(session);
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
    this.pin = '';
    this.repeat = '';
    this.error.set(null);
    this.closed.emit();
  }
}

function readLabel(): string {
  try {
    return globalThis.localStorage?.getItem(LABEL_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeLabel(label: string): void {
  try {
    if (label) globalThis.localStorage?.setItem(LABEL_KEY, label);
  } catch {
    // Nur Komfort: ohne Speicher bleibt das Feld beim nächsten Mal leer.
  }
}
