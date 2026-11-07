import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, map, type Observable } from 'rxjs';
import { AsyncState } from '../member/async-state';
import { describeApiError } from '../api/api-client.service';
import { entryTypeLabel, eventStatusLabel, formatDateTime, formatMoney, formatShortDate } from '../member/member-format';
import { RetryableIdempotencyKey } from '../api/idempotency';
import { BoardApiService } from './board-api.service';
import type {
  EventLedgerSummary,
  EventStatus,
  EventSummary,
  LedgerEntry,
  MemberBalance,
  MemberBalanceOverview,
} from '../api/api.types';
import {
  AvatarBadgeComponent,
  BalanceCardComponent,
  StatCardComponent,
  StatusBadgeComponent,
  type StatusTone,
} from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface MemberLedger {
  balance: MemberBalance;
  /** Buchungen, neueste zuerst. */
  entries: LedgerEntry[];
}

/**
 * Kassen- und Finanzansicht des Vorstands (TICKET-026).
 *
 * Zeigt die Guthabenübersicht aller Mitglieder (`GET /ledger/balances`) mit
 * Suche und hervorgehobenen Minusständen. Nach Auswahl eines Mitglieds öffnet
 * sich ein Bereich mit Guthaben, Buchungshistorie und den Aktionen Aufladen,
 * Auszahlen und Korrektur; die zu korrigierende Buchung wird aus der Historie
 * gewählt. Darunter bleibt die Eventabrechnung. Alle finanziellen
 * Schreibvorgänge tragen einen Idempotency-Key; Preis, Modus und Autorisierung
 * bestimmt ausschließlich der Fachservice (`deny by default`). Die Ansicht wird
 * nur im Browser gerendert; es werden keine Guthaben in SSR-HTML ausgegeben.
 */
@Component({
  selector: 'app-board-treasury',
  imports: [
    StateComponent,
    FormsModule,
    RouterLink,
    BalanceCardComponent,
    AvatarBadgeComponent,
    StatCardComponent,
    StatusBadgeComponent,
    TranslatePipe,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="treasury-title">
        <span class="eyebrow">{{ 'board.treasury.eyebrow' | t }}</span>
        <h1 id="treasury-title">{{ 'board.treasury.title' | t }}</h1>
        <a class="member-back" data-topbar-back routerLink="/board">{{ 'board.backToBoard' | t }}</a>

        @if (actionError(); as err) {
          <p class="manage-action-error" role="alert">{{ err }}</p>
        }
        @if (actionInfo(); as info) {
          <p class="manage-action-info" role="status">{{ info }}</p>
        }

        <!-- Guthabenübersicht -->
        <h2 class="visually-hidden">{{ 'board.treasury.members.title' | t }}</h2>
        @if (balances.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'board.treasury.members.loading' | t" />
        } @else if (balances.isError()) {
          <vereint-state
            kind="error"
            [title]="'board.treasury.unavailable' | t"
            [message]="balances.errorMessage()"
            (retry)="reloadBalances()"
          />
        } @else if (balances.data(); as all) {
          <div class="treasury-stats">
            <vereint-stat-card [label]="'board.treasury.members.statTotal' | t" [value]="totalBalance()" />
            <vereint-stat-card [label]="'board.treasury.members.statMembers' | t" [value]="all.length" />
            <vereint-stat-card
              class="treasury-stat-negative"
              [class.has-negative]="negativeCount() > 0"
              [label]="'board.treasury.members.statNegative' | t"
              [value]="negativeCount()"
            />
          </div>
          <p class="treasury-note">{{ 'board.treasury.infoText' | t }}</p>

          <label class="treasury-search">
            <span class="visually-hidden">{{ 'board.treasury.members.search' | t }}</span>
            <input
              type="search"
              name="memberSearch"
              autocomplete="off"
              [placeholder]="'board.treasury.members.search' | t"
              [ngModel]="search()"
              (ngModelChange)="search.set($event)"
            />
          </label>

          @if (filteredBalances().length === 0) {
            <p class="member-muted">{{ 'board.treasury.members.empty' | t }}</p>
          } @else {
            <ul class="member-list treasury-members">
              @for (row of filteredBalances(); track row.memberId) {
                <li>
                  <button
                    type="button"
                    class="treasury-member"
                    [class.treasury-member-selected]="selected()?.memberId === row.memberId"
                    [class.treasury-member-negative]="isNegative(row.creditBalance)"
                    [attr.aria-pressed]="selected()?.memberId === row.memberId"
                    (click)="selectMember(row)"
                  >
                    <vereint-avatar-badge [name]="row.displayName" />
                    <span class="treasury-member-text">
                      <span class="treasury-member-name">{{ row.displayName }}</span>
                      <span class="treasury-member-meta">
                        @if (row.lastEntryAt) {
                          {{ 'board.treasury.members.lastEntry' | t: { date: formatShortDate(row.lastEntryAt) } }}
                        } @else {
                          {{ 'board.treasury.members.noEntry' | t }}
                        }
                      </span>
                    </span>
                    <span class="treasury-member-balance">
                      {{ formatSignedBalance(row.creditBalance, row.currency) }}
                    </span>
                  </button>
                </li>
              }
            </ul>
          }
        }

        <!-- Ausgewähltes Mitglied -->
        @if (selected(); as member) {
          <section id="treasury-panel" class="treasury-panel" aria-labelledby="treasury-panel-title">
            <div class="treasury-panel-head">
              <h2 id="treasury-panel-title" class="member-subtitle">{{ member.displayName }}</h2>
              <button type="button" class="member-button member-button-secondary" (click)="closePanel()">
                {{ 'common.close' | t }}
              </button>
            </div>
            <p class="treasury-id">{{ 'board.treasury.members.id' | t: { id: member.memberId } }}</p>

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

              <div class="treasury-actions">
                <form class="manage-form" (ngSubmit)="topup()">
                  <h3 class="treasury-form-title">{{ 'board.treasury.booking.topupTitle' | t }}</h3>
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

                <form class="manage-form" (ngSubmit)="payout()">
                  <h3 class="treasury-form-title">{{ 'board.treasury.booking.payoutTitle' | t }}</h3>
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

                <form class="manage-form" (ngSubmit)="correct()">
                  <h3 class="treasury-form-title">{{ 'board.treasury.booking.correctionTitle' | t }}</h3>
                  @if (correctable(view.entries).length === 0) {
                    <p class="member-muted">{{ 'board.treasury.booking.noCorrectable' | t }}</p>
                  } @else {
                    <label class="manage-field">
                      <span>{{ 'board.treasury.booking.correctionEntry' | t }}</span>
                      <select name="correctionEntry" [(ngModel)]="correctionForm.originalEntryId" required>
                        <option value="">{{ 'board.treasury.booking.correctionPlaceholder' | t }}</option>
                        @for (entry of correctable(view.entries); track entry.id) {
                          <option [value]="entry.id">{{ entryLabel(entry) }}</option>
                        }
                      </select>
                    </label>
                    <label class="manage-field">
                      <span>{{ 'board.treasury.booking.reason' | t }}</span>
                      <input name="correctionReason" [(ngModel)]="correctionForm.reason" maxlength="255" />
                    </label>
                    <button
                      type="submit"
                      class="member-button"
                      [disabled]="busy() || !correctionForm.originalEntryId"
                    >
                      {{ 'board.treasury.booking.correct' | t }}
                    </button>
                  }
                </form>
              </div>

              <h3 class="member-subtitle">{{ 'board.treasury.lookup.entriesHeading' | t: { count: view.entries.length } }}</h3>
              @if (view.entries.length === 0) {
                <p class="member-muted">{{ 'board.treasury.lookup.noEntries' | t }}</p>
              } @else {
                <ul class="member-list treasury-history">
                  @for (entry of view.entries; track entry.id) {
                    <li
                      class="member-list-item treasury-entry"
                      [class.treasury-entry-chosen]="correctionForm.originalEntryId === entry.id"
                    >
                      <span class="member-list-title">{{ entryTypeLabel(entry.entryType) }}</span>
                      <span class="member-list-meta">{{ formatDateTime(entry.createdAt) }}</span>
                      <span class="member-amount" [class.member-amount-negative]="isNegative(entry.amount)">
                        {{ formatMoney(entry.amount, entry.currency) }}
                      </span>
                      @if (isReversed(entry, view.entries)) {
                        <vereint-status-badge [label]="'board.treasury.booking.reversed' | t" tone="neutral" />
                      } @else if (isCorrectable(entry, view.entries)) {
                        <button
                          type="button"
                          class="member-button member-button-secondary treasury-pick"
                          [attr.aria-pressed]="correctionForm.originalEntryId === entry.id"
                          [attr.aria-label]="'board.treasury.booking.pickAria' | t: { entry: entryLabel(entry) }"
                          (click)="pickCorrection(entry)"
                        >
                          {{ 'board.treasury.booking.pick' | t }}
                        </button>
                      }
                    </li>
                  }
                </ul>
              }
            }
          </section>
        }

        <!-- Eventabrechnung -->
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
        margin: 0.75rem 0 1rem;
      }
      .manage-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: min(12rem, 100%);
        flex: 1 1 12rem;
      }
      .manage-field input,
      .manage-field select {
        padding: 0.5rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
        min-width: 0;
      }
      .treasury-note {
        margin: 0 0 var(--space-3);
        padding: 0.6rem 0.75rem;
        border-radius: var(--radius-md);
        background-color: var(--color-brand-soft);
        color: var(--color-text);
        font-size: 0.85rem;
      }
      .treasury-search {
        display: block;
        margin: 0 0 var(--space-3);
      }
      .treasury-search input {
        width: 100%;
        min-height: 2.75rem;
        padding: 0.6rem 0.9rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
      }
      .treasury-members {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-surface-raised);
        overflow: hidden;
      }
      .treasury-members > li + li {
        border-top: 1px solid var(--color-border);
      }
      .treasury-member {
        --avatar-size: 2.25rem;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem var(--space-3);
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .treasury-member:hover,
      .treasury-member:focus-visible {
        background-color: var(--color-surface-subtle);
      }
      .treasury-member-selected {
        background-color: var(--color-brand-soft);
      }
      .treasury-member-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .treasury-member-name {
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .treasury-member-balance {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .treasury-member-negative .treasury-member-balance {
        color: var(--color-danger);
      }
      .treasury-member-meta {
        color: var(--color-text-muted);
        font-size: 0.8rem;
      }
      .treasury-panel {
        margin: 1rem 0 1.5rem;
        padding: 1rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-md, 0.75rem);
        scroll-margin-top: 1rem;
      }
      .treasury-panel-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
      }
      .treasury-panel-head .member-subtitle {
        margin: 0;
      }
      .treasury-id {
        margin: 0.15rem 0 0.75rem;
        color: var(--color-text-muted);
        font-size: 0.75rem;
        overflow-wrap: anywhere;
      }
      .treasury-actions {
        display: grid;
        gap: 0.5rem;
        margin-top: 1rem;
      }
      .treasury-form-title {
        flex: 1 1 100%;
        margin: 0;
        font-size: 1rem;
      }
      .treasury-entry {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 0.75rem;
      }
      .treasury-entry .member-amount {
        margin-left: auto;
      }
      .treasury-entry-chosen {
        outline: 2px solid var(--color-brand);
        outline-offset: -2px;
      }
      .member-amount-negative {
        color: var(--color-danger, #b91c1c);
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
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin: 0 0 var(--space-2);
      }

      .member-button-secondary {
        background: transparent;
        color: var(--color-text);
        border: 1px solid var(--color-border, #cbd5e1);
      }
      .member-button-secondary:hover:not(:disabled) {
        background: var(--color-brand-soft, transparent);
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
  private readonly document = inject(DOCUMENT);

  protected readonly events = new AsyncState<EventSummary[]>();
  protected readonly balances = new AsyncState<MemberBalanceOverview[]>();
  protected readonly ledger = new AsyncState<MemberLedger>();

  protected readonly search = signal('');
  protected readonly selected = signal<MemberBalanceOverview | null>(null);
  protected readonly summary = signal<EventLedgerSummary | null>(null);
  protected readonly summaryError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionInfo = signal<string | null>(null);

  protected topupForm = { amount: '', note: '' };
  protected payoutForm = { amount: '', note: '' };
  protected correctionForm = { originalEntryId: '', reason: '' };

  /** Je Buchungsart ein Schlüssel, der eine Wiederholung nach Fehler nicht doppelt bucht. */
  private readonly topupKey = new RetryableIdempotencyKey();
  private readonly payoutKey = new RetryableIdempotencyKey();
  private readonly correctionKey = new RetryableIdempotencyKey();

  protected readonly formatMoney = formatMoney;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatShortDate = formatShortDate;
  protected readonly entryTypeLabel = entryTypeLabel;
  protected readonly eventStatusLabel = eventStatusLabel;

  /** Übersicht nach Name sortiert und nach Suchbegriff gefiltert. */
  protected readonly filteredBalances = computed(() => {
    const term = this.search().trim().toLocaleLowerCase();
    const rows = [...(this.balances.data() ?? [])].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
    return term ? rows.filter((row) => row.displayName.toLocaleLowerCase().includes(term)) : rows;
  });

  protected readonly totalBalance = computed(() => {
    const rows = this.balances.data() ?? [];
    const sum = rows.reduce((total, row) => total + (Number(row.creditBalance) || 0), 0);
    return formatMoney(sum.toFixed(2), rows[0]?.currency ?? 'EUR');
  });

  /** Guthaben mit echtem Minuszeichen. */
  protected formatSignedBalance(amount: string, currency: string): string {
    return formatMoney(amount, currency).replace('-', '−');
  }

  protected readonly negativeCount = computed(
    () => (this.balances.data() ?? []).filter((row) => this.isNegative(row.creditBalance)).length,
  );

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

  /** Lesbare Kurzform einer Buchung für die Korrekturauswahl. */
  protected entryLabel(entry: LedgerEntry): string {
    return translate('board.treasury.booking.correctionOption', {
      date: formatDateTime(entry.createdAt),
      type: entryTypeLabel(entry.entryType),
      amount: formatMoney(entry.amount, entry.currency),
    });
  }

  /** Wurde die Buchung bereits durch eine Korrektur aufgehoben? */
  protected isReversed(entry: LedgerEntry, entries: LedgerEntry[]): boolean {
    return entries.some((other) => other.reversesEntryId === entry.id);
  }

  /** Korrigierbar sind Buchungen, die selbst keine Korrektur sind und noch nicht aufgehoben wurden. */
  protected isCorrectable(entry: LedgerEntry, entries: LedgerEntry[]): boolean {
    return entry.reversesEntryId === null && !this.isReversed(entry, entries);
  }

  protected correctable(entries: LedgerEntry[]): LedgerEntry[] {
    return entries.filter((entry) => this.isCorrectable(entry, entries));
  }

  ngOnInit(): void {
    this.reload();
    this.reloadBalances();
  }

  ngOnDestroy(): void {
    this.events.destroy();
    this.balances.destroy();
    this.ledger.destroy();
  }

  protected reload(): void {
    this.events.run(this.api.listEvents());
  }

  protected reloadBalances(): void {
    this.balances.run(this.api.listBalances());
  }

  protected loadSummary(eventId: string): void {
    this.summaryError.set(null);
    this.summary.set(null);
    this.api.getEventSummary(eventId).subscribe({
      next: (sum) => this.summary.set(sum),
      error: (error: unknown) => this.summaryError.set(describeApiError(error)),
    });
  }

  /** Öffnet den Bereich eines Mitglieds mit Guthaben und Historie. */
  protected selectMember(row: MemberBalanceOverview): void {
    this.selected.set(row);
    this.actionError.set(null);
    this.actionInfo.set(null);
    this.topupForm = { amount: '', note: '' };
    this.payoutForm = { amount: '', note: '' };
    this.correctionForm = { originalEntryId: '', reason: '' };
    this.ledger.run(this.memberLedger(row.memberId), () => this.scrollToPanel());
  }

  protected closePanel(): void {
    this.selected.set(null);
    this.ledger.destroy();
    this.ledger.status.set('idle');
    this.ledger.data.set(null);
  }

  protected pickCorrection(entry: LedgerEntry): void {
    this.correctionForm = { ...this.correctionForm, originalEntryId: entry.id };
  }

  private memberLedger(memberId: string): Observable<MemberLedger> {
    return forkJoin({
      balance: this.api.getBalance(memberId),
      entries: this.api.listEntries(memberId),
    }).pipe(
      map(({ balance, entries }) => ({
        balance,
        entries: [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      })),
    );
  }

  private scrollToPanel(): void {
    const panel = this.document.getElementById?.('treasury-panel');
    if (panel && typeof panel.scrollIntoView === 'function') {
      setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  /** Lädt Übersicht und Historie nach einer Buchung still (ohne Ladezustand) neu. */
  private refreshAfterBooking(memberId: string): void {
    this.api.listBalances().subscribe({
      next: (rows) => {
        this.balances.data.set(rows);
        this.balances.status.set('success');
        const current = rows.find((row) => row.memberId === memberId);
        if (current && this.selected()?.memberId === memberId) this.selected.set(current);
      },
      error: () => undefined,
    });
    this.memberLedger(memberId).subscribe({
      next: (view) => {
        if (this.selected()?.memberId !== memberId) return;
        this.ledger.data.set(view);
        this.ledger.status.set('success');
      },
      error: () => undefined,
    });
  }

  /** Führt eine idempotente Buchung aus und meldet Erfolg oder Fehler neutral. */
  private runBooking(
    memberId: string,
    source: Observable<LedgerEntry>,
    successInfo: string,
    onSuccess: () => void,
    onError: () => void = () => undefined,
  ): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    source.subscribe({
      next: () => {
        this.busy.set(false);
        this.actionInfo.set(successInfo);
        onSuccess();
        this.refreshAfterBooking(memberId);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        onError();
        this.actionError.set(describeApiError(error));
      },
    });
  }

  protected topup(): void {
    const memberId = this.selected()?.memberId;
    const amount = this.topupForm.amount.trim();
    if (!memberId || !amount) return;
    const note = this.topupForm.note.trim();
    const payload = { memberId, amount, note: note || undefined };
    const key = this.topupKey.for(payload);
    this.runBooking(
      memberId,
      this.api.topup(payload, key),
      translate('board.treasury.booking.topupDone'),
      () => {
        this.topupKey.reset();
        this.topupForm = { amount: '', note: '' };
      },
      () => this.topupKey.failed(payload, key),
    );
  }

  protected payout(): void {
    const memberId = this.selected()?.memberId;
    const amount = this.payoutForm.amount.trim();
    if (!memberId || !amount) return;
    const note = this.payoutForm.note.trim();
    const payload = { memberId, amount, note: note || undefined };
    const key = this.payoutKey.for(payload);
    this.runBooking(
      memberId,
      this.api.payout(payload, key),
      translate('board.treasury.booking.payoutDone'),
      () => {
        this.payoutKey.reset();
        this.payoutForm = { amount: '', note: '' };
      },
      () => this.payoutKey.failed(payload, key),
    );
  }

  protected correct(): void {
    const memberId = this.selected()?.memberId;
    const originalEntryId = this.correctionForm.originalEntryId;
    if (!memberId || !originalEntryId) return;
    const reason = this.correctionForm.reason.trim();
    const payload = { originalEntryId, reason: reason || undefined };
    const key = this.correctionKey.for(payload);
    this.runBooking(
      memberId,
      this.api.correct(payload, key),
      translate('board.treasury.booking.correctionDone'),
      () => {
        this.correctionKey.reset();
        this.correctionForm = { originalEntryId: '', reason: '' };
      },
      () => this.correctionKey.failed(payload, key),
    );
  }
}
