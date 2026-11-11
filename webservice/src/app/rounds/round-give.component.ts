import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { describeApiError } from '../api/api-client.service';
import type { Round, RoundKind, RoundOptions, RoundValidity } from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';
import { AsyncState } from '../member/async-state';
import { formatMoney } from '../member/member-format';
import { MemberApiService } from '../member/member-api.service';
import { StateComponent } from '../ui/state.component';
import { RoundApiService } from './round-api.service';
import { RoundCardComponent } from './round-card.component';

interface RoundGiveView {
  options: RoundOptions;
  rounds: Round[];
  myId: string;
}

/**
 * Runde am eigenen Handy ausgeben (Issue #81).
 *
 * Eine Runde (ein Getränk je Person) oder den ganzen Abend (bis zur
 * Höchstsumme), für ein Getränk oder alle, gültig 30 Minuten, 1 Stunde oder
 * bis Event-Ende, für die angehakten Personen. Abgebucht wird erst an der
 * Theke, und zwar vom eigenen Guthaben. Darunter die eigenen Runden dieses
 * Events mit „Beenden“.
 */
@Component({
  selector: 'app-round-give',
  imports: [FormsModule, TranslatePipe, StateComponent, RoundCardComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="round-title">
        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'rounds.loading' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'rounds.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as view) {
          <span class="eyebrow">{{ view.options.eventTitle }}</span>
          <h1 id="round-title">{{ 'rounds.title' | t }}</h1>
          <p class="round-balance">
            {{ 'rounds.fromBalance' | t }}
            <strong>{{ money(view.options.creditBalance, view.options.currency) }}</strong>
          </p>

          <form class="round-form" (ngSubmit)="submit(view)">
            <div class="round-kind" role="group" [attr.aria-label]="'rounds.kindLabel' | t">
              <button
                type="button"
                class="kind-option"
                [class.is-active]="kind() === 'round'"
                [attr.aria-pressed]="kind() === 'round'"
                (click)="kind.set('round')"
              >
                {{ 'rounds.kind.round' | t }}
              </button>
              <button
                type="button"
                class="kind-option"
                [class.is-active]="kind() === 'evening'"
                [attr.aria-pressed]="kind() === 'evening'"
                (click)="kind.set('evening')"
              >
                {{ 'rounds.kind.evening' | t }}
              </button>
            </div>

            <div class="round-row">
              <label class="round-field">
                <span>{{ 'rounds.drink' | t }}</span>
                <select name="drink" [ngModel]="drinkId()" (ngModelChange)="drinkId.set($event)">
                  <option value="">{{ 'rounds.allDrinks' | t }}</option>
                  @for (drink of view.options.drinks; track drink.eventDrinkId) {
                    <option [value]="drink.eventDrinkId">
                      {{ drink.drinkName }} · {{ money(drink.price, drink.currency) }}
                    </option>
                  }
                </select>
              </label>
              <label class="round-field">
                <span>{{ 'rounds.validity' | t }}</span>
                <select
                  name="validity"
                  [ngModel]="validity()"
                  (ngModelChange)="validity.set($event)"
                >
                  <option value="30m">{{ 'rounds.validity30m' | t }}</option>
                  <option value="1h">{{ 'rounds.validity1h' | t }}</option>
                  <option value="eventEnd">{{ 'rounds.validityEventEnd' | t }}</option>
                </select>
              </label>
            </div>

            @if (kind() === 'evening') {
              <label class="round-field">
                <span>{{ 'rounds.maxAmount' | t }}</span>
                <input
                  type="number"
                  name="maxAmount"
                  min="0.01"
                  step="0.50"
                  inputmode="decimal"
                  [ngModel]="maxAmount()"
                  (ngModelChange)="maxAmount.set($event)"
                />
              </label>
            }

            <fieldset class="round-people">
              <legend>{{ 'rounds.forWhom' | t: { count: selectedIds().length } }}</legend>
              @if (view.options.members.length === 0) {
                <p class="member-muted">{{ 'rounds.noMembers' | t }}</p>
              }
              @for (person of view.options.members; track person.memberId) {
                <label class="round-person">
                  <input
                    type="checkbox"
                    [name]="'p-' + person.memberId"
                    [checked]="selected()[person.memberId]"
                    (change)="toggle(person.memberId)"
                  />
                  <span class="person-name">{{ person.displayName }}</span>
                  <span class="person-state">
                    @if (person.present) {
                      {{ 'rounds.present' | t }}
                    } @else if (person.accepted) {
                      {{ 'rounds.accepted' | t }}
                    }
                  </span>
                </label>
              }
            </fieldset>

            <div class="round-sum">
              <p class="round-sum-main">
                {{
                  'rounds.maxHint'
                    | t: { amount: money(maxTotal(view) + '', view.options.currency) }
                }}
              </p>
              <p class="round-sum-hint">{{ 'rounds.chargeHint' | t }}</p>
            </div>

            @if (error(); as message) {
              <p class="round-error" role="alert">{{ message }}</p>
            }
            @if (info(); as message) {
              <p class="round-info" role="status">{{ message }}</p>
            }

            <button
              type="submit"
              class="member-button round-submit"
              [disabled]="busy() || !canSubmit()"
            >
              {{
                (kind() === 'evening' ? 'rounds.submitEvening' : 'rounds.submit')
                  | t: { count: selectedIds().length }
              }}
            </button>
          </form>

          @if (myRounds(view).length > 0) {
            <h2 class="member-subtitle">{{ 'rounds.mine' | t }}</h2>
            <div class="round-list">
              @for (round of myRounds(view); track round.id) {
                <app-round-card
                  [round]="round"
                  [endable]="round.status === 'running'"
                  [busy]="busy()"
                  (end)="endRound($event)"
                />
              }
            </div>
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
      .round-balance {
        margin: 0 0 var(--space-3);
        color: var(--color-text-muted);
      }
      .round-balance strong {
        color: var(--color-text);
      }
      .round-form {
        display: grid;
        gap: var(--space-3);
      }
      .round-kind {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: var(--radius-md);
        background: var(--color-surface-muted);
      }
      .kind-option {
        min-height: 44px;
        border: 0;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--color-text-muted);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .kind-option.is-active {
        background: var(--color-surface);
        color: var(--color-text);
        box-shadow: var(--vereint-shadow);
      }
      .round-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-2);
      }
      .round-field {
        display: grid;
        gap: 0.35rem;
        font-weight: 700;
      }
      .round-field select,
      .round-field input {
        min-height: var(--vereint-control-height);
        min-width: 0;
        font: inherit;
        font-weight: 400;
      }
      .round-people {
        display: grid;
        gap: 0.25rem;
        margin: 0;
        padding: var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
      }
      .round-people legend {
        padding: 0 0.4rem;
        font-weight: 700;
      }
      .round-person {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 44px;
      }
      .round-person input {
        width: 1.3rem;
        height: 1.3rem;
      }
      .person-name {
        flex: 1;
      }
      .person-state {
        color: var(--color-text-muted);
        font-size: 0.9rem;
      }
      .round-sum {
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        background: var(--color-brand-soft);
      }
      .round-sum-main {
        margin: 0;
        font-weight: 700;
      }
      .round-sum-hint {
        margin: 0.3rem 0 0;
        color: var(--color-text-muted);
      }
      .round-error {
        margin: 0;
        color: var(--color-danger);
        font-weight: 600;
      }
      .round-info {
        margin: 0;
        color: var(--color-success);
        font-weight: 600;
      }
      .round-submit {
        min-height: 3rem;
        font-size: 1.05rem;
      }
      .round-list {
        display: grid;
        gap: var(--space-2);
      }
      @media (max-width: 420px) {
        .round-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class RoundGiveComponent implements OnInit, OnDestroy {
  private readonly api = inject(RoundApiService);
  private readonly member = inject(MemberApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly load = new AsyncState<RoundGiveView>();
  protected readonly kind = signal<RoundKind>('round');
  protected readonly drinkId = signal('');
  protected readonly validity = signal<RoundValidity>('30m');
  protected readonly maxAmount = signal<number | null>(null);
  protected readonly selected = signal<Record<string, boolean>>({});
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);

  protected readonly selectedIds = computed(() =>
    Object.keys(this.selected()).filter((id) => this.selected()[id]),
  );

  private get eventId(): string {
    return this.route.snapshot.paramMap.get('eventId') ?? '';
  }

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    const eventId = this.eventId;
    this.load.run(
      forkJoin({
        options: this.api.options(eventId),
        rounds: this.api.list(eventId),
        profile: this.member.loadProfile(),
      }).pipe(map(({ options, rounds, profile }) => ({ options, rounds, myId: profile.id }))),
    );
  }

  protected toggle(memberId: string): void {
    this.selected.update((current) => ({ ...current, [memberId]: !current[memberId] }));
  }

  /** Höchstsumme: bei einer Runde Preis × Personen (alle Getränke: teuerstes), beim Abend die Eingabe. */
  protected maxTotal(view: RoundGiveView): number {
    if (this.kind() === 'evening') return Number(this.maxAmount()) || 0;
    const drinks = view.options.drinks;
    const chosen = drinks.find((drink) => drink.eventDrinkId === this.drinkId());
    const unit = chosen
      ? Number(chosen.price)
      : drinks.reduce((max, drink) => Math.max(max, Number(drink.price)), 0);
    return Math.round(unit * this.selectedIds().length * 100) / 100;
  }

  protected canSubmit(): boolean {
    if (this.selectedIds().length === 0) return false;
    return this.kind() !== 'evening' || (Number(this.maxAmount()) || 0) > 0;
  }

  protected myRounds(view: RoundGiveView): Round[] {
    return view.rounds.filter((round) => round.sponsorId === view.myId);
  }

  protected submit(view: RoundGiveView): void {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    const kind = this.kind();
    this.api
      .create(view.options.eventId, {
        kind,
        eventDrinkId: this.drinkId() || null,
        validity: this.validity(),
        memberIds: this.selectedIds(),
        maxAmount: kind === 'evening' ? Number(this.maxAmount()) : null,
      })
      .subscribe({
        next: (round) => {
          this.busy.set(false);
          this.selected.set({});
          this.info.set(translate('rounds.started'));
          const current = this.load.data();
          if (current) this.load.data.set({ ...current, rounds: [...current.rounds, round] });
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(describeApiError(err));
        },
      });
  }

  protected endRound(round: Round): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.end(round.eventId, round.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.info.set(translate('rounds.endedInfo'));
        const current = this.load.data();
        if (current) {
          this.load.data.set({
            ...current,
            rounds: current.rounds.map((r) => (r.id === updated.id ? updated : r)),
          });
        }
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(describeApiError(err));
      },
    });
  }

  protected money(amount: string, currency: string): string {
    return formatMoney(amount, currency);
  }
}
