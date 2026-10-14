import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError, describeApiError } from '../api/api-client.service';
import { newIdempotencyKey } from '../api/idempotency';
import type { LedgerEntry, PurchaseOption, PurchasePreview } from '../api/api.types';
import { TranslatePipe, translate } from '../i18n';
import { MemberApiService } from '../member/member-api.service';
import { formatMoney } from '../member/member-format';
import { BarcodeScannerComponent } from './barcode-scanner.component';

type Step = 'scan' | 'loading' | 'confirm' | 'paying' | 'done' | 'undone' | 'error';

/** So lange darf ein Mitglied einen eigenen Kauf selbst zurücknehmen (wie am Tablet). */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

/**
 * Getränk per Strichcode mit Guthaben bezahlen.
 *
 * Ablauf: Strichcode mit der Kamera scannen (oder Nummer eintippen), Getränk,
 * Preis und Guthaben danach ansehen, bestätigen. Erst die Bestätigung bucht.
 * Danach kann der Kauf wie ein Strich am Thekenterminal 10 Minuten lang
 * zurückgenommen werden. Preis, Event-Zuordnung und Buchung bestimmt der
 * Fachservice; die Seite rechnet nur das Guthaben danach zur Anzeige aus.
 */
@Component({
  selector: 'app-scan',
  imports: [FormsModule, RouterLink, TranslatePipe, BarcodeScannerComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="scan-title">
        <span class="eyebrow">{{ 'scan.eyebrow' | t }}</span>
        <h1 id="scan-title">{{ 'scan.title' | t }}</h1>

        @switch (step()) {
          @case ('scan') {
            <p class="member-muted">{{ 'scan.intro' | t }}</p>
            <vereint-barcode-scanner (detected)="lookup($event)" />
            <form class="member-form scan-manual" (submit)="submitManual($event)">
              <label class="member-field">
                <span>{{ 'scan.manual.label' | t }}</span>
                <input
                  [(ngModel)]="manualCode"
                  name="barcode"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="128"
                  [placeholder]="'scan.manual.placeholder' | t"
                />
              </label>
              <button
                type="submit"
                class="member-button member-button-ghost"
                [disabled]="!manualCode.trim()"
              >
                {{ 'scan.manual.submit' | t }}
              </button>
            </form>
          }
          @case ('loading') {
            <p class="member-muted" role="status">{{ 'scan.loading' | t }}</p>
          }
          @case ('error') {
            <div class="scan-result" role="alert">
              <h2 class="member-subtitle">{{ 'scan.notFound.title' | t }}</h2>
              <p class="member-hint member-hint-error">{{ error() }}</p>
              <button type="button" class="member-button" (click)="restart()">
                {{ 'scan.retry' | t }}
              </button>
            </div>
          }
          @case ('confirm') {
            @if (preview(); as p) {
              <div class="scan-result">
                <h2 class="scan-drink">{{ p.drinkName }}</h2>

                @if (p.options.length > 1) {
                  <fieldset class="scan-events">
                    <legend>{{ 'scan.confirm.chooseEvent' | t }}</legend>
                    @for (option of p.options; track option.eventId) {
                      <label class="scan-event">
                        <input
                          type="radio"
                          name="event"
                          [checked]="selected()?.eventId === option.eventId"
                          (change)="selected.set(option)"
                        />
                        <span>{{ option.eventTitle }}</span>
                        <span class="member-amount">{{
                          money(option.unitPrice, option.currency)
                        }}</span>
                      </label>
                    }
                  </fieldset>
                }

                @if (selected(); as option) {
                  <dl class="scan-facts">
                    @if (p.options.length === 1) {
                      <div>
                        <dt>{{ 'scan.confirm.event' | t }}</dt>
                        <dd>{{ option.eventTitle }}</dd>
                      </div>
                    }
                    <div>
                      <dt>{{ 'scan.confirm.price' | t }}</dt>
                      <dd class="scan-price">{{ money(option.unitPrice, option.currency) }}</dd>
                    </div>
                    <div>
                      <dt>{{ 'scan.confirm.balanceNow' | t }}</dt>
                      <dd>{{ money(p.creditBalance, p.balanceCurrency) }}</dd>
                    </div>
                    <div>
                      <dt>{{ 'scan.confirm.balanceAfter' | t }}</dt>
                      <dd [class.member-hint-error]="balanceAfterNegative()">
                        {{ balanceAfter() }}
                      </dd>
                    </div>
                  </dl>
                  @if (balanceAfterNegative()) {
                    <p class="member-hint member-hint-error">{{ 'scan.confirm.negative' | t }}</p>
                  }
                  @if (error()) {
                    <p class="member-hint member-hint-error" role="alert">{{ error() }}</p>
                  }
                  <div class="scan-actions">
                    <button type="button" class="member-button" (click)="pay()">
                      {{
                        'scan.confirm.pay' | t: { price: money(option.unitPrice, option.currency) }
                      }}
                    </button>
                    <button
                      type="button"
                      class="member-button member-button-ghost"
                      (click)="restart()"
                    >
                      {{ 'scan.confirm.cancel' | t }}
                    </button>
                  </div>
                }
              </div>
            }
          }
          @case ('paying') {
            <p class="member-muted" role="status">{{ 'scan.paying' | t }}</p>
          }
          @case ('done') {
            @if (receipt(); as r) {
              <div class="scan-result" role="status">
                <h2 class="member-subtitle">{{ 'scan.done.title' | t }}</h2>
                <p>
                  {{
                    'scan.done.message'
                      | t: { drink: preview()?.drinkName ?? '', price: money(r.amount, r.currency) }
                  }}
                </p>
                @if (canUndo()) {
                  <p class="member-muted">{{ 'scan.done.undoHint' | t }}</p>
                }
                @if (error()) {
                  <p class="member-hint member-hint-error" role="alert">{{ error() }}</p>
                }
                <div class="scan-actions">
                  <button type="button" class="member-button" (click)="restart()">
                    {{ 'scan.done.next' | t }}
                  </button>
                  @if (canUndo()) {
                    <button
                      type="button"
                      class="member-button member-button-ghost"
                      [disabled]="undoing()"
                      (click)="undo()"
                    >
                      {{ 'scan.done.undo' | t }}
                    </button>
                  }
                </div>
                <a routerLink="/wallet" class="scan-link">{{ 'scan.done.toWallet' | t }}</a>
              </div>
            }
          }
          @case ('undone') {
            <div class="scan-result" role="status">
              <h2 class="member-subtitle">{{ 'scan.undone.title' | t }}</h2>
              <p>
                {{
                  'scan.undone.message'
                    | t: { price: money(receipt()?.amount ?? '0', receipt()?.currency ?? 'EUR') }
                }}
              </p>
              <button type="button" class="member-button" (click)="restart()">
                {{ 'scan.done.next' | t }}
              </button>
            </div>
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
      .scan-manual {
        grid-template-columns: 1fr auto;
        align-items: end;
      }

      .scan-result {
        display: grid;
        gap: 0.75rem;
        margin-top: 1rem;
      }

      .scan-drink {
        margin: 0;
        font-size: 1.5rem;
      }

      .scan-events {
        display: grid;
        gap: 0.5rem;
        margin: 0;
        padding: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
      }

      .scan-event {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 0.5rem;
        align-items: center;
      }

      .scan-facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        gap: 0.75rem;
        margin: 0;
      }

      .scan-facts dt {
        color: var(--color-text-muted);
        font-size: 0.8rem;
      }

      .scan-facts dd {
        margin: 0.15rem 0 0;
        font-weight: 700;
      }

      .scan-price {
        color: var(--color-brand);
        font-size: 1.35rem;
      }

      .scan-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .scan-link {
        justify-self: start;
      }
    `,
  ],
})
export class ScanComponent implements OnDestroy {
  private readonly api = inject(MemberApiService);

  protected readonly step = signal<Step>('scan');
  protected readonly preview = signal<PurchasePreview | null>(null);
  protected readonly selected = signal<PurchaseOption | null>(null);
  protected readonly receipt = signal<LedgerEntry | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly undoing = signal(false);
  protected readonly canUndo = signal(false);
  protected manualCode = '';

  /** Ein Schlüssel je Bezahlvorgang: Wiederholen nach Netzfehler bucht nicht doppelt. */
  private payKey: string | null = null;
  private undoKey: string | null = null;
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly balanceAfterValue = computed(() => {
    const p = this.preview();
    const option = this.selected();
    if (!p || !option) return null;
    return Math.round((Number(p.creditBalance) - Number(option.unitPrice)) * 100) / 100;
  });

  protected readonly balanceAfterNegative = computed(() => (this.balanceAfterValue() ?? 0) < 0);

  protected readonly balanceAfter = computed(() => {
    const value = this.balanceAfterValue();
    const p = this.preview();
    return value === null || !p ? '' : formatMoney(value.toFixed(2), p.balanceCurrency);
  });

  protected readonly money = formatMoney;

  ngOnDestroy(): void {
    this.clearUndoTimer();
  }

  protected submitManual(event: Event): void {
    event.preventDefault();
    const code = this.manualCode.replace(/\s+/g, '');
    if (code) this.lookup(code);
  }

  /** Sucht das Getränk zum Strichcode und zeigt Preis und Guthaben zur Bestätigung. */
  lookup(barcode: string): void {
    this.step.set('loading');
    this.error.set(null);
    this.api.previewPurchase(barcode).subscribe({
      next: (preview) => {
        this.preview.set(preview);
        this.selected.set(preview.options.length === 1 ? preview.options[0] : null);
        this.payKey = newIdempotencyKey();
        this.step.set('confirm');
      },
      error: (err: unknown) => {
        this.error.set(this.messageOf(err, 'scan.errors.lookup'));
        this.step.set('error');
      },
    });
  }

  /** Bucht den Kauf; erst hier wird Guthaben abgebucht. */
  pay(): void {
    const preview = this.preview();
    const option = this.selected();
    if (!preview || !option || this.step() === 'paying') return;
    this.payKey ??= newIdempotencyKey();
    this.error.set(null);
    this.step.set('paying');
    this.api.purchaseByBarcode(option.eventId, preview.barcode, this.payKey).subscribe({
      next: (entry) => {
        this.receipt.set(entry);
        this.payKey = null;
        this.undoKey = newIdempotencyKey();
        this.startUndoWindow();
        this.step.set('done');
      },
      error: (err: unknown) => {
        this.error.set(this.messageOf(err, 'scan.errors.pay'));
        this.step.set('confirm');
      },
    });
  }

  /** Gegenbuchung zum eben bezahlten Kauf. */
  undo(): void {
    const entry = this.receipt();
    if (!entry || this.undoing()) return;
    this.undoKey ??= newIdempotencyKey();
    this.undoing.set(true);
    this.error.set(null);
    this.api.undoPurchase(entry.id, this.undoKey).subscribe({
      next: () => {
        this.undoing.set(false);
        this.clearUndoTimer();
        this.canUndo.set(false);
        this.step.set('undone');
      },
      error: (err: unknown) => {
        this.undoing.set(false);
        if (err instanceof ApiError && err.status === 400) {
          this.canUndo.set(false);
        }
        this.error.set(this.messageOf(err, 'scan.errors.undo'));
      },
    });
  }

  /** Zurück zur Kamera für das nächste Getränk. */
  restart(): void {
    this.clearUndoTimer();
    this.canUndo.set(false);
    this.preview.set(null);
    this.selected.set(null);
    this.receipt.set(null);
    this.error.set(null);
    this.payKey = null;
    this.undoKey = null;
    this.manualCode = '';
    this.step.set('scan');
  }

  /** Rückgängig bleibt so lange angeboten, wie der Server es zulässt (gemessen ab jetzt). */
  private startUndoWindow(): void {
    this.clearUndoTimer();
    this.canUndo.set(true);
    this.undoTimer = setTimeout(() => this.canUndo.set(false), UNDO_WINDOW_MS);
  }

  private clearUndoTimer(): void {
    if (this.undoTimer !== null) {
      clearTimeout(this.undoTimer);
      this.undoTimer = null;
    }
  }

  /** Fachliche Meldungen des Servers (bereits übersetzt) zeigen, sonst einen allgemeinen Text. */
  private messageOf(err: unknown, fallbackKey: string): string {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.detail) {
      return err.detail;
    }
    if (err instanceof ApiError) {
      return `${translate(fallbackKey)} ${describeApiError(err)}`;
    }
    return translate(fallbackKey);
  }
}
