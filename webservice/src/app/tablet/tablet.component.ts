import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { forkJoin, type Observable } from 'rxjs';
import { AsyncState } from '../member/async-state';
import { describeApiError } from '../api/api-client.service';
import { eventStatusLabel, formatMoney } from '../member/member-format';
import { newIdempotencyKey, RetryableIdempotencyKey } from '../api/idempotency';
import { TabletApiService } from './tablet-api.service';
import type { KioskSession } from '../kiosk/kiosk-api.service';
import { KioskStartDialogComponent } from '../kiosk/kiosk-start-dialog.component';
import { KioskModeService } from '../kiosk/kiosk-mode.service';
import { DrinkOverlayComponent } from './drink-overlay.component';
import { RevenueSheetComponent, type RevenueKind } from './revenue-sheet.component';
import { TallyGridComponent, type TallyCell } from './tally-grid.component';
import { TallyPickerComponent, type TallyPickItem } from './tally-picker.component';
import { StatusBadgeComponent } from '../ui';
import type { EventDrink, EventFood } from '../events/event-manage.types';
import type {
  LedgerEntry,
  TabletBoard,
  TabletEvent,
  TabletMember,
  TabletRevenuePayload,
} from '../api/api.types';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface EventContext {
  members: TabletMember[];
  drinks: EventDrink[];
  food: EventFood[];
  board: TabletBoard;
}

/** Ein in dieser Sitzung gebuchter Strich (für die Rückgängig-Leiste). */
interface BookedTally {
  entryId: string;
  cell: TallyCell;
  label: string;
}

/** Offene Auswahl, wenn ein Feld mehrere Artikel umfasst. */
interface PickerState {
  cell: TallyCell;
  title: string;
  subtitle: string;
  items: TallyPickItem[];
}

/**
 * Thekenterminal mit der Strichliste nach Kategorien (Issue #80).
 *
 * Eine Zeile je Mitglied, eine Spalte je Strich-Kategorie, rechts „Sonstiges“
 * für Getränke ohne Kategorie und Speisen. Ein Tipp in ein Feld bucht ein
 * konkretes Getränk der Kategorie zum Kategoriepreis; liegen mehrere Getränke
 * in der Kategorie, wählt der Thekendienst eines aus. Preis, Währung,
 * Abrechnungsmodus und Herkunft bestimmt ausschließlich der Fachservice; die
 * Berechtigung `purchase.tablet` prüft er bei jedem Aufruf (`deny by default`).
 * Jeder Schreibvorgang trägt einen Idempotency-Key. Die Ansicht wird
 * ausschließlich im Browser gerendert.
 */
@Component({
  selector: 'app-tablet',
  imports: [
    StateComponent,
    IconComponent,
    StatusBadgeComponent,
    TallyGridComponent,
    TallyPickerComponent,
    DrinkOverlayComponent,
    RevenueSheetComponent,
    KioskStartDialogComponent,
    TranslatePipe,
  ],
  template: `
    <main class="page-shell" [class.terminal-standalone]="standalone()">
      <section class="page-card member-card terminal-card" aria-labelledby="tablet-title">
        @if (standalone()) {
          <div class="terminal-bar">
            <span class="terminal-flag">
              <span class="terminal-dot" aria-hidden="true"></span> {{ 'tablet.terminal.kioskActive' | t }}
            </span>
          </div>
        } @else {
          <span class="eyebrow">{{ 'tablet.header.eyebrow' | t }}</span>
        }
        <h1 id="tablet-title">{{ (standalone() ? 'tablet.header.terminalTitle' : 'tablet.header.title') | t }}</h1>
        @if (!standalone()) {
          <p>{{ 'tablet.header.intro' | t }}</p>
        }
        <button
          type="button"
          class="member-button ghost terminal-toggle"
          [attr.aria-pressed]="standalone()"
          (click)="toggleStandalone()"
        >
          <vereint-icon name="lock" />
          {{ (standalone() ? 'tablet.terminal.leaveKiosk' : 'tablet.terminal.startKiosk') | t }}
        </button>
        @if (!standalone()) {
          <p class="member-hint">{{ 'tablet.terminal.startHint' | t }}</p>
        }
        <app-kiosk-start-dialog
          [open]="kioskStartOpen()"
          (started)="onKioskStarted($event)"
          (closed)="kioskStartOpen.set(false)"
        />

        @if (actionError(); as err) {
          <p class="manage-action-error" role="alert">{{ err }}</p>
        }
        @if (actionInfo(); as info) {
          <p class="manage-action-info" role="status">{{ info }}</p>
        }

        @if (events.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'tablet.state.eventsLoading' | t"
          />
        } @else if (events.isError()) {
          <vereint-state
            kind="error"
            [title]="'tablet.state.unavailable' | t"
            [message]="events.errorMessage()"
            (retry)="reload()"
          />
        } @else if (events.data(); as list) {
          <h2 class="member-subtitle">{{ 'tablet.events.heading' | t: { count: list.length } }}</h2>
          @if (list.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'tablet.events.emptyTitle' | t"
              [message]="'tablet.events.emptyMessage' | t"
            />
          } @else {
            <ul class="member-list">
              @for (event of list; track event.id) {
                <li class="member-list-item board-row">
                  <span class="member-list-title">{{ event.title }}</span>
                  <vereint-status-badge
                    [label]="eventStatusLabel(event.status)"
                    [tone]="'success'"
                  />
                  <button
                    type="button"
                    class="member-button"
                    [class.is-active]="selectedEventId() === event.id"
                    (click)="selectEvent(event.id)"
                  >
                    {{ 'tablet.events.select' | t }}
                  </button>
                </li>
              }
            </ul>
          }
        }

        @if (selectedEventId()) {
          @if (context.isLoading()) {
            <vereint-state
              kind="loading"
              [title]="'common.loading' | t"
              [message]="'tablet.state.contextLoading' | t"
            />
          } @else if (context.isError()) {
            <p class="manage-action-error" role="alert">{{ context.errorMessage() }}</p>
          } @else if (context.data(); as ctx) {
            @if (board(); as b) {
              @if (b.members.length === 0 || !hasBookableItems(b, ctx)) {
                <vereint-state
                  kind="empty"
                  [title]="'tablet.state.notPossibleTitle' | t"
                  [message]="'tablet.state.notPossibleMessage' | t"
                />
              } @else {
                <div class="terminal-layout">
                  <div class="terminal-main">
                    <p class="tally-hint">{{ 'tablet.board.hint' | t }}</p>
                    <app-tally-grid
                      [columns]="b.columns"
                      [rows]="b.members"
                      [showOther]="otherItems(ctx).length > 0"
                      [disabled]="busy()"
                      [payers]="payers()"
                      [last]="lastBooking()?.cell ?? null"
                      (cellTap)="onCellTap($event)"
                    />

                    <div class="tally-actions">
                      <button
                        type="button"
                        class="member-button"
                        [disabled]="busy()"
                        (click)="openRevenueSheet('round', ctx.members)"
                      >
                        <vereint-icon name="beer" /> {{ 'tablet.tally.round' | t }}
                      </button>
                      <button
                        type="button"
                        class="member-button ghost"
                        [disabled]="busy()"
                        (click)="openRevenueSheet('evening', ctx.members)"
                      >
                        <vereint-icon name="crown" /> {{ 'tablet.tally.evening' | t }}
                      </button>
                    </div>
                  </div>

                  <aside class="terminal-side" [attr.aria-label]="'tablet.board.todayTitle' | t">
                    <h2 class="side-title">{{ 'tablet.board.todayTitle' | t }}</h2>
                    <div class="side-stats">
                      <div class="side-stat">
                        <span class="side-label">{{ 'tablet.board.tallies' | t }}</span>
                        <span class="side-value">{{ b.tallyCount }}</span>
                      </div>
                      <div class="side-stat">
                        <span class="side-label">{{ 'tablet.board.revenue' | t }}</span>
                        <span class="side-value is-money">{{ formatMoney(b.revenue + '', b.currency) }}</span>
                      </div>
                    </div>
                  </aside>
                </div>

                @if (lastBooking(); as last) {
                  <div class="undo-bar" role="status">
                    <vereint-icon name="check" />
                    <span class="undo-text">{{ 'tablet.tally.booked' | t: { label: last.label } }}</span>
                    <button type="button" class="undo-button" [disabled]="busy()" (click)="undoLast()">
                      <vereint-icon name="arrow-left" /> {{ 'tablet.tally.undo' | t }}
                    </button>
                  </div>
                }

                <app-tally-picker
                  [open]="!!picker()"
                  [title]="picker()?.title ?? ''"
                  [subtitle]="picker()?.subtitle ?? ''"
                  [items]="picker()?.items ?? []"
                  (pick)="onPick($event)"
                  (closed)="picker.set(null)"
                />

                <app-drink-overlay
                  [open]="drinkOverlayOpen()"
                  [drinks]="ctx.drinks"
                  [foods]="ctx.food"
                  [selectedId]="activeDrinkId()"
                  (itemSelect)="selectActiveDrink($event)"
                  (confirm)="confirmDrink()"
                  (closed)="closeDrinkOverlay()"
                />

                <app-revenue-sheet
                  [open]="revenueSheetOpen()"
                  [kind]="revenueForm.kind"
                  [members]="ctx.members"
                  [selection]="revenueSelection"
                  [disabled]="busy() || !hasRevenueSelection()"
                  (kindChange)="setRevenueKind($event)"
                  (toggle)="toggleRevenueMember($event)"
                  (confirm)="confirmRevenue()"
                  (closed)="closeRevenueSheet()"
                />
              }
            }
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
      .board-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        justify-content: space-between;
      }
      .manage-action-error {
        color: var(--color-danger);
        font-weight: 600;
      }
      .manage-action-info {
        color: var(--color-success);
        font-weight: 600;
      }
      .terminal-card {
        max-width: none;
      }
      .terminal-layout {
        display: grid;
        gap: var(--space-3);
        margin: var(--space-2) 0 var(--space-3);
      }
      @media (min-width: 1000px) {
        .terminal-layout {
          grid-template-columns: minmax(0, 1fr) 20rem;
          align-items: start;
        }
      }
      .tally-hint {
        margin: 0 0 var(--space-2);
        color: var(--color-text-muted);
      }
      .terminal-side {
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: var(--color-surface-raised);
      }
      .side-title {
        margin: 0 0 var(--space-2);
        font-size: 1.15rem;
      }
      .side-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-1);
      }
      .side-stat {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: var(--space-2);
        border-radius: var(--radius-md);
        background: var(--color-surface-subtle);
      }
      .side-label {
        font-size: 0.75rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .side-value {
        font-size: 1.6rem;
        font-weight: 800;
      }
      .side-value.is-money {
        color: var(--color-brand);
      }
      .undo-bar {
        position: sticky;
        bottom: 0.75rem;
        z-index: 5;
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin: 0 0 1rem;
        padding: 0.6rem 0.6rem 0.6rem 1rem;
        border-radius: var(--radius-md);
        background: var(--vereint-ink);
        color: var(--color-on-brand);
        box-shadow: var(--vereint-shadow);
      }
      :host-context([data-viewport='mobile']) .undo-bar {
        bottom: calc(var(--shell-bottom-height) + env(safe-area-inset-bottom) + 0.5rem);
      }
      .undo-text {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .undo-button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        min-height: 3rem;
        padding: 0 1rem;
        border: 1px solid currentColor;
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
      }
      .tally-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: var(--space-3);
      }
      .tally-actions .member-button {
        min-height: 44px;
      }
      .member-button.ghost {
        background: transparent;
        border: 1px solid var(--color-border-dark);
        color: inherit;
      }
      .member-button.is-active {
        outline: 2px solid var(--color-brand);
      }
      .terminal-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
      }
      .terminal-flag {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-weight: 600;
        opacity: 0.85;
      }
      .terminal-dot {
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 50%;
        background: var(--color-brand);
      }
      .terminal-toggle {
        align-self: flex-start;
        min-height: 44px;
      }
    `,
  ],
})
export class TabletComponent implements OnInit, OnDestroy {
  private readonly api = inject(TabletApiService);
  private readonly kiosk = inject(KioskModeService);

  protected readonly events = new AsyncState<TabletEvent[]>();
  protected readonly context = new AsyncState<EventContext>();
  /** Strichliste des gewählten Events; wird nach jeder Buchung neu geladen. */
  protected readonly board = signal<TabletBoard | null>(null);

  protected readonly selectedEventId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionInfo = signal<string | null>(null);

  /** Kiosk-Modus dieses Geräts; bleibt über Neuladen und Neustart erhalten. */
  protected readonly standalone = this.kiosk.active;
  protected readonly kioskStartOpen = signal(false);
  protected readonly picker = signal<PickerState | null>(null);

  /** Auf wessen Kosten je Mitglied getrunken wird; ohne Eintrag die eigene Rechnung. */
  protected readonly payers = computed<Record<string, string>>(() => ({}));

  /**
   * Schlüssel für Striche. Bricht eine Buchung ab (z. B. nach einer
   * Zeitüberschreitung), schickt ein erneuter Tipp mit denselben Daten denselben
   * Schlüssel, damit eine schon gespeicherte Buchung nicht doppelt entsteht.
   */
  private readonly purchaseKey = new RetryableIdempotencyKey();
  private readonly revenueKey = new RetryableIdempotencyKey();
  /** In dieser Sitzung gebuchte Striche, der letzte zuoberst (für Rückgängig). */
  private readonly booked = signal<BookedTally[]>([]);
  /** Letzter erfasster Strich für die Rückgängig-Leiste. */
  protected readonly lastBooking = signal<BookedTally | null>(null);

  // Runde/Abend am Terminal (bis zur Umstellung auf Runden am eigenen Handy).
  protected readonly activeDrinkId = signal<string | null>(null);
  protected readonly drinkOverlayOpen = signal(false);
  protected readonly revenueSheetOpen = signal(false);
  protected revenueForm: { eventDrinkId?: string; eventFoodId?: string; kind: RevenueKind } = {
    eventDrinkId: '',
    eventFoodId: '',
    kind: 'round',
  };
  protected revenueSelection: Record<string, boolean> = {};

  protected readonly formatMoney = formatMoney;
  protected readonly eventStatusLabel = eventStatusLabel;

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.events.destroy();
    this.context.destroy();
  }

  protected reload(): void {
    this.events.run(this.api.listEvents(), (list) => {
      // Im Kiosk-Modus nach dem Neuöffnen beim zuletzt gewählten Event weitermachen.
      const remembered = this.kiosk.active() ? this.kiosk.eventId() : null;
      if (remembered && !this.selectedEventId() && list.some((event) => event.id === remembered)) {
        this.selectEvent(remembered);
      }
    });
  }

  protected selectEvent(eventId: string): void {
    this.selectedEventId.set(eventId);
    this.kiosk.rememberEvent(eventId);
    this.revenueForm = { eventDrinkId: '', eventFoodId: '', kind: 'round' };
    this.revenueSelection = {};
    this.activeDrinkId.set(null);
    this.drinkOverlayOpen.set(false);
    this.revenueSheetOpen.set(false);
    this.picker.set(null);
    this.board.set(null);
    this.booked.set([]);
    this.lastBooking.set(null);
    this.actionError.set(null);
    this.actionInfo.set(null);
    this.context.run(
      forkJoin({
        members: this.api.listMembers(eventId),
        drinks: this.api.listDrinks(eventId),
        food: this.api.listFood(eventId),
        board: this.api.loadBoard(eventId),
      }),
      (data) => this.board.set(data.board),
    );
  }

  /**
   * Öffnet den Start-Dialog, in dem das Gerät seine PIN vergibt, oder fragt zum
   * Verlassen die PIN ab. Event- und Strichlisten-Zustand bleiben beim
   * Umschalten erhalten.
   */
  protected toggleStandalone(): void {
    if (this.kiosk.active()) {
      this.kiosk.requestUnlock();
      return;
    }
    this.actionError.set(null);
    this.kioskStartOpen.set(true);
  }

  protected onKioskStarted(session: KioskSession): void {
    this.kioskStartOpen.set(false);
    this.kiosk.activate(session.id, this.selectedEventId());
  }

  /** Getränke ohne Kategorie und Speisen: Spalte „Sonstiges“. */
  protected otherItems(ctx: EventContext): TallyPickItem[] {
    const drinks = ctx.drinks
      .filter((drink) => !drink.tallyCategoryId)
      .map<TallyPickItem>((drink) => ({
        kind: 'drink',
        id: drink.id,
        name: drink.drinkName,
        price: String(drink.effectivePrice ?? drink.price),
        currency: drink.currency,
      }));
    const food = ctx.food.map<TallyPickItem>((item) => ({
      kind: 'food',
      id: item.id,
      name: item.foodName,
      price: String(item.effectivePrice),
      currency: item.currency,
    }));
    return [...drinks, ...food];
  }

  /** Buchbar ist das Terminal, sobald eine Spalte ein Getränk hat oder „Sonstiges“ etwas anbietet. */
  protected hasBookableItems(board: TabletBoard, ctx: EventContext): boolean {
    return board.columns.some((column) => column.drinks.length > 0) || this.otherItems(ctx).length > 0;
  }

  /**
   * Tipp in ein Feld: Liegt in der Kategorie genau ein Getränk des Events,
   * wird es sofort gebucht; bei mehreren öffnet sich die Auswahl, damit die
   * Statistik das richtige Getränk zählt. „Sonstiges“ öffnet die Auswahl der
   * Getränke ohne Kategorie und der Speisen.
   */
  protected onCellTap(cell: TallyCell): void {
    const ctx = this.context.data();
    const board = this.board();
    if (!ctx || !board) return;
    const member = board.members.find((m) => m.memberId === cell.memberId);
    const memberName = member?.displayName ?? translate('tablet.fallback.member');
    this.actionError.set(null);

    if (cell.categoryId) {
      const column = board.columns.find((c) => c.categoryId === cell.categoryId);
      if (!column) return;
      const items = column.drinks.map<TallyPickItem>((drink) => ({
        kind: 'drink',
        id: drink.eventDrinkId,
        name: drink.drinkName,
        price: String(column.price),
        currency: column.currency,
      }));
      if (items.length === 0) {
        this.actionError.set(translate('tablet.messages.noDrinksInCategory', { name: column.name }));
        return;
      }
      if (items.length === 1) {
        this.book(cell, items[0]);
        return;
      }
      this.picker.set({
        cell,
        title: translate('tablet.picker.categoryTitle', { name: column.name }),
        subtitle: translate('tablet.picker.forMember', { name: memberName }),
        items,
      });
      return;
    }

    const items = this.otherItems(ctx);
    if (items.length === 1) {
      this.book(cell, items[0]);
      return;
    }
    this.picker.set({
      cell,
      title: translate('tablet.picker.otherTitle'),
      subtitle: translate('tablet.picker.forMember', { name: memberName }),
      items,
    });
  }

  protected onPick(item: TallyPickItem): void {
    const state = this.picker();
    this.picker.set(null);
    if (state) this.book(state.cell, item);
  }

  /** Zählt den Strich sofort im Feld; der Server bestätigt oder es wird zurückgenommen. */
  private adjustCount(cell: TallyCell, delta: number): void {
    this.board.update((board) => {
      if (!board) return board;
      const members = board.members.map((row) => {
        if (row.memberId !== cell.memberId) return row;
        if (!cell.categoryId) return { ...row, otherCount: Math.max(0, row.otherCount + delta) };
        const current = row.counts?.[cell.categoryId] ?? 0;
        return { ...row, counts: { ...row.counts, [cell.categoryId]: Math.max(0, current + delta) } };
      });
      return { ...board, members, tallyCount: Math.max(0, board.tallyCount + delta) };
    });
  }

  /** Bucht genau einen Strich (Idempotency-Key, Wiederholung nach Abbruch mit gleichem Schlüssel). */
  private book(cell: TallyCell, item: TallyPickItem): void {
    const eventId = this.selectedEventId();
    if (!eventId) return;
    const member =
      this.board()?.members.find((m) => m.memberId === cell.memberId)?.displayName ?? translate('tablet.fallback.member');
    const column = cell.categoryId
      ? this.board()?.columns.find((c) => c.categoryId === cell.categoryId)?.name
      : null;
    const label = column ? `${member} · ${column} (${item.name})` : `${member} · ${item.name}`;
    const payload = {
      memberId: cell.memberId,
      eventDrinkId: item.kind === 'drink' ? item.id : undefined,
      eventFoodId: item.kind === 'food' ? item.id : undefined,
    };
    const keyData = { eventId, ...payload };
    const key = this.purchaseKey.for(keyData);
    this.adjustCount(cell, 1);
    this.busy.set(true);
    this.actionInfo.set(null);
    this.api.recordPurchase(eventId, payload, key).subscribe({
      next: (entry: LedgerEntry) => {
        this.busy.set(false);
        this.purchaseKey.reset();
        if (entry?.id && this.booked().some((b) => b.entryId === entry.id)) {
          // Der Server hat eine schon gezählte Buchung als Wiederholung geliefert.
          this.adjustCount(cell, -1);
          return;
        }
        if (entry?.id) {
          const booking: BookedTally = { entryId: entry.id, cell, label };
          this.booked.update((list) => [booking, ...list]);
          this.lastBooking.set(booking);
        }
        this.refreshBoard();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.purchaseKey.failed(keyData, key);
        this.adjustCount(cell, -1);
        this.actionError.set(describeApiError(error));
      },
    });
  }

  /**
   * Rückgängig-Leiste: nimmt den zuletzt erfassten Strich zurück. Der Server
   * bucht eine Gegenbuchung (nur eigene Striche dieses Terminals, 10 Minuten).
   */
  protected undoLast(): void {
    const eventId = this.selectedEventId();
    const last = this.lastBooking();
    if (!eventId || !last) {
      this.actionError.set(translate('tablet.messages.undoNotPossible'));
      return;
    }
    this.adjustCount(last.cell, -1);
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    this.api.undoPurchase(eventId, last.entryId, newIdempotencyKey()).subscribe({
      next: () => {
        this.busy.set(false);
        const rest = this.booked().filter((b) => b.entryId !== last.entryId);
        this.booked.set(rest);
        this.lastBooking.set(rest[0] ?? null);
        this.actionInfo.set(translate('tablet.messages.undone'));
        this.refreshBoard();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.adjustCount(last.cell, 1);
        this.actionError.set(describeApiError(error));
      },
    });
  }

  /** Lädt Striche und Umsatz still nach; Fehler lassen die bisherige Anzeige stehen. */
  private refreshBoard(): void {
    const eventId = this.selectedEventId();
    if (!eventId) return;
    this.api.loadBoard(eventId).subscribe({
      next: (board) => {
        if (this.selectedEventId() === eventId) this.board.set(board);
      },
      error: () => undefined,
    });
  }

  // --- Runde/Abend am Terminal -------------------------------------------

  protected closeDrinkOverlay(): void {
    this.drinkOverlayOpen.set(false);
  }

  protected selectActiveDrink(eventDrinkId: string): void {
    this.activeDrinkId.set(eventDrinkId);
  }

  protected confirmDrink(): void {
    if (!this.activeDrinkId()) return;
    this.drinkOverlayOpen.set(false);
  }

  /** Öffnet das Runden-/Abend-Sheet und wählt zunächst alle Mitglieder vor. */
  protected openRevenueSheet(kind: RevenueKind, members: TabletMember[]): void {
    this.revenueForm = { ...this.revenueForm, kind };
    this.revenueSelection = members.reduce<Record<string, boolean>>((acc, member) => {
      acc[member.memberId] = true;
      return acc;
    }, {});
    this.revenueSheetOpen.set(true);
  }

  protected closeRevenueSheet(): void {
    this.revenueSheetOpen.set(false);
  }

  protected setRevenueKind(kind: RevenueKind): void {
    this.revenueForm = { ...this.revenueForm, kind };
  }

  protected toggleRevenueMember(memberId: string): void {
    this.revenueSelection = {
      ...this.revenueSelection,
      [memberId]: !this.revenueSelection[memberId],
    };
  }

  protected hasRevenueSelection(): boolean {
    return Object.values(this.revenueSelection).some(Boolean);
  }

  /** Bestätigt das Sheet; fehlt noch ein Artikel, öffnet sich zuerst die Auswahl. */
  protected confirmRevenue(): void {
    const itemId = this.activeDrinkId() ?? '';
    const ctx = this.context.data();
    const isFood = ctx?.food.some((f) => f.id === itemId) ?? false;
    this.revenueForm = {
      ...this.revenueForm,
      eventDrinkId: isFood ? '' : itemId,
      eventFoodId: isFood ? itemId : '',
    };
    if (!this.revenueForm.eventDrinkId && !this.revenueForm.eventFoodId) {
      this.drinkOverlayOpen.set(true);
      return;
    }
    this.recordRevenue();
    this.revenueSheetOpen.set(false);
  }

  private runAction(
    source: Observable<unknown>,
    successInfo: string,
    onSuccess?: () => void,
    onError?: () => void,
  ): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    source.subscribe({
      next: () => {
        this.busy.set(false);
        onSuccess?.();
        this.actionInfo.set(successInfo);
        this.refreshBoard();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        onError?.();
        this.actionError.set(describeApiError(error));
      },
    });
  }

  protected recordRevenue(): void {
    const eventId = this.selectedEventId();
    const { eventDrinkId, eventFoodId } = this.revenueForm;
    const memberIds = Object.keys(this.revenueSelection).filter((id) => this.revenueSelection[id]);
    if (!eventId || (!eventDrinkId && !eventFoodId) || memberIds.length === 0) return;
    const payload: TabletRevenuePayload = {
      eventDrinkId: eventDrinkId || undefined,
      eventFoodId: eventFoodId || undefined,
      memberIds,
    };
    const keyData = {
      eventId,
      kind: this.revenueForm.kind,
      ...payload,
      memberIds: [...memberIds].sort(),
    };
    const key = this.revenueKey.for(keyData);
    const source: Observable<LedgerEntry[]> =
      this.revenueForm.kind === 'evening'
        ? this.api.recordEvening(eventId, payload, key)
        : this.api.recordRound(eventId, payload, key);
    this.runAction(
      source,
      translate(this.revenueForm.kind === 'evening' ? 'tablet.messages.eveningBooked' : 'tablet.messages.roundBooked'),
      () => this.revenueKey.reset(),
      () => this.revenueKey.failed(keyData, key),
    );
    this.revenueForm = { eventDrinkId: '', eventFoodId: '', kind: this.revenueForm.kind };
    this.revenueSelection = {};
  }
}
