import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError, describeApiError } from '../api/api-client.service';
import { newIdempotencyKey } from '../api/idempotency';
import type { ForeignDrink, LedgerEntry, PurchaseOption, PurchasePreview } from '../api/api.types';
import { TranslatePipe, translate } from '../i18n';
import { MemberApiService } from '../member/member-api.service';
import { formatMoney } from '../member/member-format';
import { BarcodeScannerComponent } from './barcode-scanner.component';

type Step =
  | 'scan'
  | 'loading'
  | 'confirm'
  | 'paying'
  | 'done'
  | 'undone'
  | 'recording'
  | 'recorded'
  | 'removed'
  | 'error';

/** Wahl ohne laufendes Event: mit Guthaben bezahlen oder nur für die Statistik erfassen. */
type Choice = 'credit' | 'foreign';

/** So lange darf ein Mitglied einen eigenen Kauf selbst zurücknehmen (wie am Tablet). */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

/**
 * Getränk per Strichcode bezahlen oder für die Statistik erfassen.
 *
 * Ablauf: Strichcode mit der Kamera scannen (oder Nummer eintippen), Getränk,
 * Preis und Guthaben danach ansehen, bestätigen. Erst die Bestätigung bucht.
 *
 * - Bei einem laufenden Event mit Selbstbedienung, an dem die Person
 *   teilnimmt, läuft der Kauf über das Event (wie bisher).
 * - Sonst wählt die Person (Issue #110): mit Guthaben zum Katalogpreis
 *   bezahlen, wahlweise ohne Statistikeintrag, oder das Getränk nur als
 *   Fremdgetränk in die Statistik aufnehmen. Das Fremdgetränk bietet die Seite
 *   nur an, wenn die Statistik eingeschaltet ist.
 *
 * Ein Kauf lässt sich wie ein Strich am Thekenterminal 10 Minuten lang
 * zurücknehmen, ein Fremdgetränk ebenso lange wieder entfernen. Preis,
 * Event-Zuordnung, Buchung und Schalter bestimmt der Fachservice; die Seite
 * rechnet nur das Guthaben danach zur Anzeige aus.
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

                @if (p.options.length === 0) {
                  <p class="member-muted">{{ 'scan.choice.intro' | t }}</p>
                  <fieldset class="scan-events">
                    <legend>{{ 'scan.choice.legend' | t }}</legend>
                    @if (p.creditPurchase; as credit) {
                      <label class="scan-event">
                        <input
                          type="radio"
                          name="choice"
                          value="credit"
                          [checked]="choice() === 'credit'"
                          (change)="choice.set('credit')"
                        />
                        <span class="scan-option">
                          <strong>{{ 'scan.choice.credit' | t }}</strong>
                          <span class="member-muted">{{ 'scan.choice.creditHint' | t }}</span>
                        </span>
                        <span class="member-amount">{{ money(credit.unitPrice, credit.currency) }}</span>
                      </label>
                    }
                    @if (p.foreignDrink) {
                      <label class="scan-event">
                        <input
                          type="radio"
                          name="choice"
                          value="foreign"
                          [checked]="choice() === 'foreign'"
                          (change)="choice.set('foreign')"
                        />
                        <span class="scan-option">
                          <strong>{{ 'scan.choice.foreign' | t }}</strong>
                          <span class="member-muted">{{ 'scan.choice.foreignHint' | t }}</span>
                        </span>
                      </label>
                    }
                  </fieldset>
                  @if (!p.creditPurchase) {
                    <p class="member-hint">{{ 'scan.choice.noPrice' | t }}</p>
                  }

                  @if (choice() === 'credit' && p.creditPurchase) {
                    <dl class="scan-facts">
                      <div>
                        <dt>{{ 'scan.confirm.price' | t }}</dt>
                        <dd class="scan-price">
                          {{ money(p.creditPurchase.unitPrice, p.creditPurchase.currency) }}
                        </dd>
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
                    @if (p.foreignDrink) {
                      <label class="scan-check">
                        <input
                          type="checkbox"
                          name="recordStatistics"
                          [checked]="recordStatistics()"
                          (change)="toggleStatistics($event)"
                        />
                        <span>{{ 'scan.choice.recordStatistics' | t }}</span>
                      </label>
                      <p class="member-muted">{{ 'scan.choice.recordStatisticsHint' | t }}</p>
                    } @else {
                      <p class="member-muted">{{ 'scan.choice.statisticsOff' | t }}</p>
                    }
                    @if (balanceAfterNegative()) {
                      <p class="member-hint member-hint-error">{{ 'scan.confirm.negative' | t }}</p>
                    }
                  }
                  @if (error()) {
                    <p class="member-hint member-hint-error" role="alert">{{ error() }}</p>
                  }
                  <div class="scan-actions">
                    @if (choice() === 'credit' && p.creditPurchase) {
                      <button type="button" class="member-button" (click)="pay()">
                        {{
                          'scan.confirm.pay'
                            | t: { price: money(p.creditPurchase.unitPrice, p.creditPurchase.currency) }
                        }}
                      </button>
                    }
                    @if (choice() === 'foreign') {
                      <button type="button" class="member-button" (click)="recordForeign()">
                        {{ 'scan.choice.submitForeign' | t }}
                      </button>
                    }
                    <button
                      type="button"
                      class="member-button member-button-ghost"
                      (click)="restart()"
                    >
                      {{ 'scan.confirm.cancel' | t }}
                    </button>
                  </div>
                }

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
                @if (paidWithoutStatistics()) {
                  <p class="member-muted">{{ 'scan.done.noStatistics' | t }}</p>
                }
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
          @case ('recording') {
            <p class="member-muted" role="status">{{ 'scan.recording' | t }}</p>
          }
          @case ('recorded') {
            @if (foreign(); as f) {
              <div class="scan-result" role="status">
                <h2 class="member-subtitle">{{ 'scan.foreign.title' | t }}</h2>
                <p>{{ 'scan.foreign.message' | t: { drink: f.drinkName } }}</p>
                @if (canUndo()) {
                  <p class="member-muted">{{ 'scan.foreign.removeHint' | t }}</p>
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
                      (click)="removeForeign()"
                    >
                      {{ 'scan.foreign.remove' | t }}
                    </button>
                  }
                </div>
              </div>
            }
          }
          @case ('removed') {
            <div class="scan-result" role="status">
              <h2 class="member-subtitle">{{ 'scan.foreign.removedTitle' | t }}</h2>
              <p>{{ 'scan.foreign.removedMessage' | t: { drink: foreign()?.drinkName ?? '' } }}</p>
              <button type="button" class="member-button" (click)="restart()">
                {{ 'scan.done.next' | t }}
              </button>
            </div>
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

      .scan-option {
        display: grid;
        gap: 0.15rem;
      }

      .scan-option .member-muted {
        font-size: 0.85rem;
      }

      .scan-check {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        font-weight: 600;
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
  /** Ohne laufendes Event: was mit dem Getränk passieren soll. */
  protected readonly choice = signal<Choice | null>(null);
  /** Guthabenkauf ohne Event: in die Statistik aufnehmen (nur wählbar, wenn sie an ist). */
  protected readonly recordStatistics = signal(true);
  protected readonly paidWithoutStatistics = signal(false);
  protected readonly foreign = signal<ForeignDrink | null>(null);
  protected manualCode = '';

  /** Ein Schlüssel je Bezahlvorgang: Wiederholen nach Netzfehler bucht nicht doppelt. */
  private payKey: string | null = null;
  private undoKey: string | null = null;
  private foreignKey: string | null = null;
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  /** Preis des gewählten Kaufs: über das Event oder ohne Event zum Katalogpreis. */
  protected readonly unitPrice = computed(() => {
    const p = this.preview();
    if (!p) return null;
    if (p.options.length > 0) return this.selected()?.unitPrice ?? null;
    return this.choice() === 'credit' ? (p.creditPurchase?.unitPrice ?? null) : null;
  });

  protected readonly balanceAfterValue = computed(() => {
    const p = this.preview();
    const price = this.unitPrice();
    if (!p || price === null) return null;
    return Math.round((Number(p.creditBalance) - Number(price)) * 100) / 100;
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
        this.choice.set(
          preview.options.length > 0
            ? null
            : preview.creditPurchase
              ? 'credit'
              : preview.foreignDrink
                ? 'foreign'
                : null,
        );
        this.recordStatistics.set(true);
        this.payKey = newIdempotencyKey();
        this.foreignKey = newIdempotencyKey();
        this.step.set('confirm');
      },
      error: (err: unknown) => {
        this.error.set(this.messageOf(err, 'scan.errors.lookup'));
        this.step.set('error');
      },
    });
  }

  /**
   * Bucht den Kauf; erst hier wird Guthaben abgebucht. Mit laufendem Event über
   * das Event, sonst ohne Event zum Katalogpreis.
   */
  pay(): void {
    const preview = this.preview();
    if (!preview || this.step() === 'paying') return;
    const option = this.selected();
    const atEvent = preview.options.length > 0;
    if (atEvent ? !option : this.choice() !== 'credit' || !preview.creditPurchase) return;
    this.payKey ??= newIdempotencyKey();
    this.error.set(null);
    this.step.set('paying');
    const withStatistics = !preview.foreignDrink || this.recordStatistics();
    const request = atEvent
      ? this.api.purchaseByBarcode(option!.eventId, preview.barcode, this.payKey)
      : this.api.purchaseWithCredit(preview.barcode, withStatistics, this.payKey);
    request.subscribe({
      next: (entry) => {
        this.receipt.set(entry);
        this.paidWithoutStatistics.set(!atEvent && !withStatistics);
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

  /** Erfasst das Getränk nur für die Statistik (Fremdgetränk); es wird nichts abgebucht. */
  recordForeign(): void {
    const preview = this.preview();
    if (!preview || !preview.foreignDrink || this.step() === 'recording') return;
    this.foreignKey ??= newIdempotencyKey();
    this.error.set(null);
    this.step.set('recording');
    this.api.recordForeignDrink(preview.barcode, this.foreignKey).subscribe({
      next: (drink) => {
        this.foreign.set(drink);
        this.foreignKey = null;
        this.startUndoWindow();
        this.step.set('recorded');
      },
      error: (err: unknown) => {
        this.error.set(this.messageOf(err, 'scan.errors.record'));
        this.step.set('confirm');
      },
    });
  }

  /** Entfernt das eben erfasste Fremdgetränk wieder. */
  removeForeign(): void {
    const drink = this.foreign();
    if (!drink || this.undoing()) return;
    this.undoing.set(true);
    this.error.set(null);
    this.api.removeForeignDrink(drink.id).subscribe({
      next: () => {
        this.undoing.set(false);
        this.clearUndoTimer();
        this.canUndo.set(false);
        this.step.set('removed');
      },
      error: (err: unknown) => {
        this.undoing.set(false);
        if (err instanceof ApiError && err.status === 400) {
          this.canUndo.set(false);
        }
        this.error.set(this.messageOf(err, 'scan.errors.remove'));
      },
    });
  }

  protected toggleStatistics(event: Event): void {
    this.recordStatistics.set((event.target as HTMLInputElement).checked);
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
    this.foreign.set(null);
    this.choice.set(null);
    this.recordStatistics.set(true);
    this.paidWithoutStatistics.set(false);
    this.error.set(null);
    this.payKey = null;
    this.undoKey = null;
    this.foreignKey = null;
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
