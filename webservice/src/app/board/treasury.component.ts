import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
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
  imports: [
    FormsModule,
    RouterLink,
    BalanceCardComponent,
    DataTableComponent,
    InfoPanelComponent,
    StatCardComponent,
    StatusBadgeComponent,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="treasury-title">
        <span class="eyebrow">Kassenwart</span>
        <h1 id="treasury-title">Bierkasse verwalten</h1>
        <p>Eventabrechnungen, Guthaben und Kassenbuchungen.</p>
        <a class="member-back" routerLink="/board">← Zum Vorstand</a>

        <vereint-info-panel icon="💰" title="Bierkasse">
          Buchungen sind idempotent. Preis, Modus und Freigabe bestimmt
          ausschließlich der Fachservice.
        </vereint-info-panel>

        @if (actionError(); as err) {
          <p class="manage-action-error" role="alert">{{ err }}</p>
        }
        @if (actionInfo(); as info) {
          <p class="manage-action-info" role="status">{{ info }}</p>
        }

        @if (events.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Events werden abgerufen.</span>
          </div>
        } @else if (events.isError()) {
          <div class="state-card state-error" role="alert">
            <strong>Kasse nicht verfügbar</strong>
            <span>{{ events.errorMessage() }}</span>
            <button type="button" class="member-button" (click)="reload()">Erneut versuchen</button>
          </div>
        } @else if (events.data(); as list) {
          <div class="treasury-stats">
            <vereint-stat-card icon="📅" label="Events mit Abrechnung" [value]="list.length" />
          </div>

          <h2 class="member-subtitle">Events ({{ list.length }})</h2>
          @if (list.length === 0) {
            <div class="state-card" role="status">
              <strong>Keine Events</strong>
              <span>Es sind keine Events mit Abrechnung sichtbar.</span>
            </div>
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
                    Abrechnung
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
              <strong>Eventabrechnung</strong>
              <span>Umsatz: {{ formatMoney(sum.revenueTotal, sum.currency) }}</span>
              <span>Kreditverzehr: {{ formatMoney(sum.creditConsumptionTotal, sum.currency) }}</span>
              <span>Buchungen: {{ sum.entryCount }}</span>
            </div>
          }
        }

        <!-- Guthaben nachschlagen -->
        <h2 class="member-subtitle">Guthaben nachschlagen</h2>
        <form class="manage-form manage-inline" (ngSubmit)="lookupMember()">
          <label class="manage-field">
            <span>Mitglieds-ID</span>
            <input name="lookupMemberId" [(ngModel)]="lookupMemberId" required />
          </label>
          <button type="submit" class="member-button" [disabled]="busy()">Anzeigen</button>
        </form>
        @if (ledger.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Guthaben und Buchungen werden abgerufen.</span>
          </div>
        } @else if (ledger.isError()) {
          <p class="manage-action-error" role="alert">{{ ledger.errorMessage() }}</p>
        } @else if (ledger.data(); as view) {
          <vereint-balance-card
            label="Guthaben"
            [amount]="formatMoney(view.balance.creditBalance, view.balance.currency)"
            [negative]="isNegative(view.balance.creditBalance)"
          />
          <h3 class="member-subtitle">Buchungen ({{ view.entries.length }})</h3>
          <vereint-data-table
            [columns]="entryColumns"
            [rows]="view.entries"
            [trackBy]="trackEntry"
            emptyLabel="Keine Buchungen."
          />
        }

        <!-- Buchungen -->
        <h2 class="member-subtitle">Buchen</h2>
        <form class="manage-form manage-inline" (ngSubmit)="topup()">
          <label class="manage-field">
            <span>Aufladen · Mitglieds-ID</span>
            <input name="topupMemberId" [(ngModel)]="topupForm.memberId" required />
          </label>
          <label class="manage-field">
            <span>Betrag</span>
            <input name="topupAmount" [(ngModel)]="topupForm.amount" inputmode="decimal" required />
          </label>
          <label class="manage-field">
            <span>Notiz</span>
            <input name="topupNote" [(ngModel)]="topupForm.note" maxlength="255" />
          </label>
          <button type="submit" class="member-button" [disabled]="busy()">Aufladen</button>
        </form>
        <form class="manage-form manage-inline" (ngSubmit)="payout()">
          <label class="manage-field">
            <span>Auszahlen · Mitglieds-ID</span>
            <input name="payoutMemberId" [(ngModel)]="payoutForm.memberId" required />
          </label>
          <label class="manage-field">
            <span>Betrag</span>
            <input name="payoutAmount" [(ngModel)]="payoutForm.amount" inputmode="decimal" required />
          </label>
          <label class="manage-field">
            <span>Notiz</span>
            <input name="payoutNote" [(ngModel)]="payoutForm.note" maxlength="255" />
          </label>
          <button type="submit" class="member-button" [disabled]="busy()">Auszahlen</button>
        </form>
        <form class="manage-form manage-inline" (ngSubmit)="correct()">
          <label class="manage-field">
            <span>Korrektur · Ursprungsbuchung</span>
            <input name="correctionEntryId" [(ngModel)]="correctionForm.originalEntryId" required />
          </label>
          <label class="manage-field">
            <span>Grund</span>
            <input name="correctionReason" [(ngModel)]="correctionForm.reason" maxlength="255" />
          </label>
          <button type="submit" class="member-button" [disabled]="busy()">Korrigieren</button>
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
  protected readonly entryColumns: DataTableColumn<LedgerEntry>[] = [
    { key: 'type', header: 'Art', value: (entry) => entryTypeLabel(entry.entryType) },
    { key: 'date', header: 'Datum', value: (entry) => formatDateTime(entry.createdAt) },
    { key: 'amount', header: 'Betrag', value: (entry) => formatMoney(entry.amount, entry.currency) },
  ];

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
      'Aufladung gebucht.',
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
      'Auszahlung gebucht.',
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
      'Korrektur gebucht.',
    );
    this.correctionForm = { originalEntryId: '', reason: '' };
  }
}
