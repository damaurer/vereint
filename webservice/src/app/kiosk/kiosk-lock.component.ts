import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ApiError, describeApiError } from '../api/api-client.service';
import { TranslatePipe, translate } from '../i18n';
import { formatDateTime } from '../member/member-format';
import { ModalComponent } from '../ui';
import { IconComponent } from '../ui/icon.component';
import { KIOSK_PIN_MAX_LENGTH, KioskApiService, type KioskUnlockResult } from './kiosk-api.service';
import { KioskModeService } from './kiosk-mode.service';

/** Wie oft das Gerät nachsieht, ob die Sitzung aus der Ferne beendet wurde. */
export const KIOSK_REMOTE_CHECK_MS = 15_000;

/**
 * Schloss des Kiosk-Modus: ein kleiner Knopf oben rechts auf jeder Seite und
 * der PIN-Dialog zum Verlassen. Der Modus endet nur, wenn der Fachservice die
 * PIN dieses Geräts bestätigt (falsche Eingaben zählt und sperrt der Server)
 * oder wenn Vorstand bzw. Administration die Sitzung aus der Ferne beendet
 * haben. Das prüft das Gerät regelmäßig und beim Zurückkehren in den
 * Vordergrund; Netzfehler lassen den Modus unverändert.
 */
@Component({
  selector: 'app-kiosk-lock',
  // Bewusst ohne FormsModule: die Komponente liegt im Start-Bundle.
  imports: [ModalComponent, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (kiosk.active()) {
      <button
        type="button"
        class="kiosk-lock-button"
        [attr.aria-label]="'kiosk.lock.open' | t"
        [attr.title]="'kiosk.lock.open' | t"
        (click)="kiosk.requestUnlock()"
      >
        <vereint-icon name="lock" />
        <span class="kiosk-lock-label">{{ 'kiosk.lock.badge' | t }}</span>
      </button>

      <vereint-modal [open]="kiosk.unlockOpen()" [title]="'kiosk.lock.title' | t" (closed)="cancel()">
        <form class="kiosk-lock-form" (submit)="$event.preventDefault(); submit()">
          <p class="member-hint">{{ 'kiosk.lock.intro' | t }}</p>
          <label class="kiosk-lock-field">
            <span>{{ 'kiosk.lock.pinLabel' | t }}</span>
            <input
              #pinInput
              name="kioskPin"
              type="password"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              [attr.maxlength]="maxLength"
              [value]="pin()"
              (input)="onInput($event)"
              [disabled]="busy()"
            />
          </label>
          @if (error(); as message) {
            <p class="manage-action-error" role="alert">{{ message }}</p>
          }
          <div class="kiosk-lock-actions">
            <button type="button" class="member-button member-button-ghost" (click)="cancel()">
              {{ 'common.cancel' | t }}
            </button>
            <button type="submit" class="member-button" [disabled]="busy() || !pin()">
              {{ 'kiosk.lock.submit' | t }}
            </button>
          </div>
        </form>
      </vereint-modal>
    }
  `,
  styles: [
    `
      .kiosk-lock-button {
        position: fixed;
        top: calc(env(safe-area-inset-top, 0px) + 0.5rem);
        right: calc(env(safe-area-inset-right, 0px) + 0.75rem);
        z-index: 55;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        min-height: 44px;
        padding: 0 0.85rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: 999px;
        background: var(--color-surface, #ffffff);
        color: var(--color-text, inherit);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
      }
      .kiosk-lock-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .kiosk-lock-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .kiosk-lock-field input {
        padding: 0.6rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
        font-size: 1.5rem;
        letter-spacing: 0.4em;
        text-align: center;
        background: var(--color-surface, #ffffff);
        color: inherit;
      }
      .kiosk-lock-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.5rem;
      }
    `,
  ],
})
export class KioskLockComponent {
  protected readonly kiosk = inject(KioskModeService);
  private readonly api = inject(KioskApiService);
  private readonly pinInput = viewChild<ElementRef<HTMLInputElement>>('pinInput');

  protected readonly maxLength = KIOSK_PIN_MAX_LENGTH;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly pin = signal('');

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const check = () => this.checkRemoteEnd();
      const onVisible = () => {
        if (document.visibilityState === 'visible') check();
      };
      const timer = setInterval(check, KIOSK_REMOTE_CHECK_MS);
      document.addEventListener('visibilitychange', onVisible);
      globalThis.addEventListener?.('online', check);
      inject(DestroyRef).onDestroy(() => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
        globalThis.removeEventListener?.('online', check);
      });
      queueMicrotask(check);
    }

    // Beim Öffnen leeren und das Feld fokussieren, damit die Tastatur erscheint.
    effect(() => {
      if (!this.kiosk.unlockOpen()) return;
      this.pin.set('');
      this.error.set(null);
      queueMicrotask(() => this.pinInput()?.nativeElement.focus());
    });
  }

  protected onInput(event: Event): void {
    this.pin.set((event.target as HTMLInputElement).value);
  }

  protected cancel(): void {
    this.pin.set('');
    this.error.set(null);
    this.kiosk.cancelUnlock();
  }

  protected submit(): void {
    const pin = this.pin().trim();
    const sessionId = this.kiosk.sessionId();
    if (!pin || !sessionId || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.unlock(sessionId, pin).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.pin.set('');
        if (result.unlocked) {
          this.kiosk.deactivate();
          return;
        }
        this.error.set(this.failureMessage(result));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.pin.set('');
        // Die Sitzung gibt es nicht mehr: nichts mehr, das das Gerät sperren könnte.
        if (err instanceof ApiError && err.status === 404) {
          this.kiosk.deactivate();
          return;
        }
        this.error.set(describeApiError(err));
      },
    });
  }

  /** Beendet den Modus, wenn der Server die Sitzung nicht mehr als aktiv führt. */
  private checkRemoteEnd(): void {
    const sessionId = this.kiosk.sessionId();
    if (!sessionId) return;
    this.api.state(sessionId).subscribe({
      next: (session) => {
        if (!session.active && this.kiosk.sessionId() === sessionId) this.kiosk.deactivate();
      },
      error: (err: unknown) => {
        if (err instanceof ApiError && err.status === 404 && this.kiosk.sessionId() === sessionId) {
          this.kiosk.deactivate();
        }
      },
    });
  }

  private failureMessage(result: KioskUnlockResult): string {
    if (result.lockedUntil) {
      return translate('kiosk.lock.locked', { time: formatDateTime(result.lockedUntil) });
    }
    return translate('kiosk.lock.wrong', { count: result.remainingAttempts ?? 0 });
  }
}
