import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, type Observable } from 'rxjs';
import { AsyncState } from '../member/async-state';
import { describeApiError } from '../api/api-client.service';
import { entryTypeLabel, eventStatusLabel, formatDateTime, formatMoney } from '../member/member-format';
import { newIdempotencyKey } from '../api/idempotency';
import { BoardApiService } from './board-api.service';
import type {
  EventLedgerSummary,
  EventStatus,
  EventSummary,
  LedgerEntry,
  MemberBalance,
} from '../api/api.types';
import {
  BalanceCardComponent,
  DataTableComponent,
  type DataTableColumn,
  InfoPanelComponent,
  StatCardComponent,
  StatusBadgeComponent,
  type StatusTone,
} from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface MemberLedger {
  balance: MemberBalance;
  entries: LedgerEntry[];
}

/**
 * Kassen- und Finanzansicht des Vorstands (TICKET-026).
 *
 * Zeigt die für den Aufrufer sichtbaren Events mit ihrer aggregierten
 * Eventabrechnung, erlaubt das Nachschlagen eines beliebigen Guthabens und das
 * Buchen von Aufladungen, Auszahlungen und Korrekturen. Alle finanziellen
 * Schreibvorgänge tragen einen Idempotency-Key; Preis, Modus und Autorisierung
 * bestimmt ausschließlich der Fachservice (`deny by default`), der
 * unberechtigte Aufrufe mit `403` beantwortet. Die Ansicht wird nur im Browser
 * gerendert; es werden keine Guthaben in SSR-HTML ausgegeben.
 */
@Component({
  selector: 'app-board-treasury',
  imports: [StateComponent, 
    FormsModule,
    RouterLink,
    BalanceCardComponent,
    DataTableComponent,
    InfoPanelComponent,
    StatCardComponent,
    StatusBadgeComponent,
    TranslatePipe,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="treasury-title">
        <span class="eyebrow">{{ 'board.treasury.eyebrow' | t }}</span>
        <h1 id="treasury-title">{{ 'board.treasury.title' | t }}</h1>
        <p>{{ 'board.treasury.intro' | t }}</p>
        <a class="member-back" routerLink="/board">{{ 'board.backToBoard' | t }}</a>

        <vereint-info-panel icon="treasury" [title]="'board.treasury.infoTitle' | t">
          {{ 'board.treasury.infoText' | t }}
        </vereint-info-panel>

        @if (actionError(); as err) {
          <p class="manage-action-error" role="alert">{{ err }}</p>
        }
        @if (actionInfo(); as info) {
          <p class="manage-action-info" role="status">{{ info }}</p>
        }

        @if (events.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'board.treasury.eventsLoading' | t" />
        } @else if (events.isError()) {
          <vereint-state
            kind="error"
            [title]="'board.treasury.unavailable' | t"
            [message]="events.errorMessage()"
            (retry)="reload()"
          />
        } @else if (events.data(); as list) {
          <div class="treasury-stats">
            <vereint-stat-card icon="events" [label]="'board.treasury.statEvents' | t" [value]="list.length" />
          </div>

          <h2 class="member-subtitle">{{ 'board.treasury.eventsHeading' | t: { count: list.length } }}</h2>
          @if (list.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'board.overview.eventsEmptyTitle' | t"
              [message]="'board.treasury.eventsEmpty' | t"
            />
          } @else {
            <ul class="member-list">
              @for (event of list; track event.id) {
                <li class="member-list-item board-row">
                  <span class="member-list-title">{{ event.title }}</span>
                  <vereint-status-badge
                    [label]="eventStatusLabel(event.status)"
                    [tone]="eventTone(event.status)"
                  />
                  <button
                    type="button"
                    class="member-button"
                    [disabled]="busy()"
                    (click)="loadSummary(event.id)"
                  >
                    {{ 'board.treasury.summaryButton' | t }}
                  </button>
                </li>
              }
            </ul>
          }

          @if (summaryError(); as serr) {
            <p class="manage-action-error" role="alert">{{ serr }}</p>
          }
          @if (summary(); as sum) {
            <div class="state-card" role="status">
              <strong>{{ 'board.treasury.summary.title' | t }}</strong>
              <span>{{ 'board.treasury.summary.revenue' | t: { amount: formatMoney(sum.revenueTotal, sum.currency) } }}</span>
              @if (sum.costTotal) {
                <span>{{ 'board.treasury.summary.cost' | t: { amount: formatMoney(sum.costTotal, sum.currency) } }}</span>
              }
              @if (sum.profitTotal) {
                <span>{{ 'board.treasury.summary.profit' | t: { amount: formatMoney(sum.profitTotal, sum.currency) } }}</span>
              }
              <span>{{ 'board.treasury.summary.credit' | t: { amount: formatMoney(sum.creditConsumptionTotal, sum.currency) } }}</span>
              <span>{{ 'board.treasury.summary.entries' | t: { count: sum.entryCount } }}</span>
            </div>
          }
        }

        <!-- Guthaben nachschlagen -->
        <h2 class="member-subtitle">{{ 'board.treasury.lookup.title' | t }}</h2>
        <form class="manage-form manage-inline" (ngSubmit)="lookupMember()">
          <label class="manage-field">
            <span>{{ 'board.treasury.lookup.memberId' | t }}</span>
            <input name="lookupMemberId" [(ngModel)]="lookupMemberId" required />
          </label>
          <button type="submit" class="member-button" [disabled]="busy()">{{ 'board.treasury.lookup.show' | t }}</button>
        </form>
        @if (ledger.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'board.treasury.lookup.loading' | t"
          />
        } @else if (ledger.isError()) {
          <p class="manage-action-error" role="alert">{{ ledger.errorMessage() }}</p>
        } @else if (ledger.data(); as view) {
          <vereint-balance-card
            [label]="'board.treasury.lookup.balance' | t"
            [amount]="formatMoney(view.balance.creditBalance, view.balance.currency)"
            [negative]="isNegative(view.balance.creditBalance)"
          />
          <h3 class="member-subtitle">{{ 'board.treasury.lookup.entriesHeading' | t: { count: view.entries.length } }}</h3>
          <vereint-data-table
            [columns]="entryColumns()"
            [rows]="view.entries"
            [trackBy]="trackEntry"
            [emptyLabel]="'board.treasury.lookup.noEntries' | t"
          />
        }

        <!-- Buchungen -->
        <h2 class="member-subtitle">{{ 'board.treasury.booking.title' | t }}</h2>
        <form class="manage-form manage-inline" (ngSubmit)="topup()">
          <label class="manage-field">
            <span>{{ 'board.treasury.booking.topupMemberId' | t }}</span>
            <input name="topupMemberId" [(ngModel)]="topupForm.memberId" required />
          </label>
          <label class="manage-field">
            <span>{{ 'board.treasury.booking.amount' | t }}</span>
            <input name="topupAmount" [(ngModel)]="topupForm.amount" inputmode="decimal" required />
          </label>
          <label class="manage-field">
            <span>{{ 'board.treasury.booking.note' | t }}</span>
            <input name="topupNote" [(ngModel)]="topupForm.note" maxlength="255" />
          </label>
          <button type="submit" class="member-button" [disabled]="busy()">{{ 'board.treasury.booking.topup' | t }}</button>
        </form>
        <form class="manage-form manage-inline" (ngSubmit)="payout()">
          <label class="manage-field">
            <span>{{ 'board.treasury.booking.payoutMemberId' | t }}</span>
            <input name="payoutMemberId" [(ngModel)]="payoutForm.memberId" required />
          </label>
          <label class="manage-field">
            <span>{{ 'board.treasury.booking.amount' | t }}</span>
            <input name="payoutAmount" [(ngModel)]="payoutForm.amount" inputmode="decimal" required />
          </label>
          <label class="manage-field">
            <span>{{ 'board.treasury.booking.note' | t }}</span>
            <input name="payoutNote" [(ngModel)]="payoutForm.note" maxlength="255" />
          </label>
          <button type="submit" class="member-button" [disabled]="busy()">{{ 'board.treasury.booking.payout' | t }}</button>
        </form>
        <form class="manage-form manage-inline" (ngSubmit)="correct()">
          <label class="manage-field">
            <span>{{ 'board.treasury.booking.correctionEntryId' | t }}</span>
            <input name="correctionEntryId" [(ngModel)]="correctionForm.originalEntryId" required />
          </label>
          <label class="manage-field">
            <span>{{ 'board.treasury.booking.reason' | t }}</span>
            <input name="correctionReason" [(ngModel)]="correctionForm.reason" maxlength="255" />
          </label>
          <button type="submit" class="member-button" [disabled]="busy()">{{ 'board.treasury.booking.correct' | t }}</button>
        </form>
      </section>
    </main>
  `,
  styles: [
    `
      .manage-form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: end;
        margin: 0.75rem 0 1.5rem;
      }
      .manage-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 12rem;
      }
      .manage-field input {
        padding: 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        font: inherit;
      }
      .board-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        justify-content: space-between;
      }
      .treasury-stats {
        display: grid;
        gap: var(--space-2);
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        margin: 0.5rem 0 1rem;
      }
      .manage-action-error {
        color: #b91c1c;
        font-weight: 600;
      }
      .manage-action-info {
        color: #15803d;
        font-weight: 600;
      }
    `,
  ],
})
export class TreasuryComponent implements OnInit, OnDestroy {
  private readonly api = inject(BoardApiService);

  protected readonly events = new AsyncState<EventSummary[]>();
  protected readonly ledger = new AsyncState<MemberLedger>();

  protected readonly summary = signal<EventLedgerSummary | null>(null);
  protected readonly summaryError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionInfo = signal<string | null>(null);

  protected lookupMemberId = '';
  protected topupForm = { memberId: '', amount: '', note: '' };
  protected payoutForm = { memberId: '', amount: '', note: '' };
  protected correctionForm = { originalEntryId: '', reason: '' };

  protected readonly formatMoney = formatMoney;
  protected readonly formatDateTime = formatDateTime;
  protected readonly entryTypeLabel = entryTypeLabel;
  protected readonly eventStatusLabel = eventStatusLabel;

  /** Spalten der Mitglieder-Guthabenliste (geteilte `DataTable`). */
  protected readonly entryColumns = computed<DataTableColumn<LedgerEntry>[]>(() => [
    {
      key: 'type',
      header: translate('board.treasury.columns.type'),
      value: (entry) => entryTypeLabel(entry.entryType),
    },
    {
      key: 'date',
      header: translate('board.treasury.columns.date'),
      value: (entry) => formatDateTime(entry.createdAt),
    },
    {
      key: 'amount',
      header: translate('board.treasury.columns.amount'),
      value: (entry) => formatMoney(entry.amount, entry.currency),
    },
  ]);

  protected readonly trackEntry = (_index: number, entry: LedgerEntry): string => entry.id;

  /** Negatives Guthaben (dezimale Zeichenkette) für rote Darstellung. */
  protected isNegative(amount: string): boolean {
    return Number(amount) < 0;
  }

  /** Ordnet den Eventstatus einer Badge-Farbe der geteilten Primitive zu. */
  protected eventTone(status: EventStatus): StatusTone {
    switch (status) {
      case 'active':
      case 'published':
        return 'success';
      case 'cancelled':
        return 'danger';
      case 'draft':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.events.destroy();
    this.ledger.destroy();
  }

  protected reload(): void {
    this.events.run(this.api.listEvents());
  }

  protected loadSummary(eventId: string): void {
    this.summaryError.set(null);
    this.summary.set(null);
    this.api.getEventSummary(eventId).subscribe({
      next: (sum) => this.summary.set(sum),
      error: (error: unknown) => this.summaryError.set(describeApiError(error)),
    });
  }

  protected lookupMember(): void {
    const memberId = this.lookupMemberId.trim();
    if (!memberId) return;
    this.ledger.run(
      forkJoin({
        balance: this.api.getBalance(memberId),
        entries: this.api.listEntries(memberId),
      }),
    );
  }

  /** Führt eine idempotente Buchung aus und meldet Erfolg oder Fehler neutral. */
  private runBooking(source: Observable<LedgerEntry>, successInfo: string): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    source.subscribe({
      next: () => {
        this.busy.set(false);
        this.actionInfo.set(successInfo);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(describeApiError(error));
      },
    });
  }

  protected topup(): void {
    const memberId = this.topupForm.memberId.trim();
    const amount = this.topupForm.amount.trim();
    if (!memberId || !amount) return;
    const note = this.topupForm.note.trim();
    this.runBooking(
      this.api.topup(
        { memberId, amount, note: note || undefined },
        newIdempotencyKey(),
      ),
      translate('board.treasury.booking.topupDone'),
    );
    this.topupForm = { memberId: '', amount: '', note: '' };
  }

  protected payout(): void {
    const memberId = this.payoutForm.memberId.trim();
    const amount = this.payoutForm.amount.trim();
    if (!memberId || !amount) return;
    const note = this.payoutForm.note.trim();
    this.runBooking(
      this.api.payout(
        { memberId, amount, note: note || undefined },
        newIdempotencyKey(),
      ),
      translate('board.treasury.booking.payoutDone'),
    );
    this.payoutForm = { memberId: '', amount: '', note: '' };
  }

  protected correct(): void {
    const originalEntryId = this.correctionForm.originalEntryId.trim();
    if (!originalEntryId) return;
    const reason = this.correctionForm.reason.trim();
    this.runBooking(
      this.api.correct(
        { originalEntryId, reason: reason || undefined },
        newIdempotencyKey(),
      ),
      translate('board.treasury.booking.correctionDone'),
    );
    this.correctionForm = { originalEntryId: '', reason: '' };
  }
}
