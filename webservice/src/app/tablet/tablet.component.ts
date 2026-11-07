import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
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
import { StrichlisteRowComponent } from './strichliste-row.component';
import { DrinkOverlayComponent } from './drink-overlay.component';
import { RevenueSheetComponent, type RevenueKind } from './revenue-sheet.component';
import { StatusBadgeComponent } from '../ui';
import type { EventDrink, EventFood } from '../events/event-manage.types';
import type { LedgerEntry, TabletEvent, TabletMember, TabletRevenuePayload } from '../api/api.types';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface EventContext {
  members: TabletMember[];
  drinks: EventDrink[];
  food: EventFood[];
}

/**
 * Tablet-Erfassung / Drink-Recorder (TICKET-026, Redesign TICKET-034).
 *
 * Der Recorder wählt ein aktives Event, ein tabletfähiges Getränk und erfasst
 * darüber die Strichliste je Mitglied sowie Runden und Abendaktionen. Preis,
 * Währung, Abrechnungsmodus und Herkunft bestimmt ausschließlich der
 * Fachservice; die Berechtigung `purchase.tablet` prüft er bei jedem Aufruf
 * (`deny by default`), unberechtigte Aufrufe erhalten `403`. Jeder
 * Schreibvorgang trägt einen Idempotency-Key; das Getränke-Overlay und das
 * Runden-/Abend-Sheet sind reine Client-UI vor den bestehenden
 * Buchungsaufrufen. Die Ansicht wird ausschließlich im Browser gerendert.
 */
@Component({
  selector: 'app-tablet',
  imports: [
    StateComponent,
    IconComponent,
    StatusBadgeComponent,
    StrichlisteRowComponent,
    DrinkOverlayComponent,
    RevenueSheetComponent,
    KioskStartDialogComponent,
    TranslatePipe,
  ],
  template: `
    <main class="page-shell" [class.terminal-standalone]="standalone()">
      <section class="page-card member-card" aria-labelledby="tablet-title">
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
            @if (ctx.members.length === 0 || ctx.drinks.length === 0) {
              <vereint-state
                kind="empty"
                [title]="'tablet.state.notPossibleTitle' | t"
                [message]="'tablet.state.notPossibleMessage' | t"
              />
            } @else {
              <div class="tally-head">
                <h2 class="member-subtitle">{{ 'tablet.tally.heading' | t }}</h2>
                <button type="button" class="member-button ghost" (click)="openDrinkOverlay()">
                  @if (activeItem(ctx); as item) {
                    {{ 'tablet.tally.activeItem' | t: { name: item.name, price: formatMoney(item.price, item.currency) } }}
                  } @else if (activeDrink(ctx); as drink) {
                    {{ 'tablet.tally.activeDrink' | t: { name: drink.drinkName, price: formatMoney(drink.price, drink.currency) } }}
                  } @else {
                    {{ 'tablet.tally.chooseItem' | t }}
                  }
                </button>
              </div>

              <div class="tally-list">
                @for (member of ctx.members; track member.memberId) {
                  <app-strichliste-row
                    [name]="member.displayName"
                    [count]="tallyFor(member.memberId)"
                    (increment)="quickBook(member.memberId)"
                    (decrement)="onTallyDecrease(member.memberId)"
                  />
                }
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

              <div class="quickbook-bar">
                <span class="quickbook-label">{{ 'tablet.tally.quickbookLabel' | t }}</span>
                <button
                  type="button"
                  class="member-button quickbook-drink"
                  (click)="openDrinkOverlay()"
                >
                  @if (activeItem(ctx); as item) {
                    {{ item.name }} · {{ formatMoney(item.price, item.currency) }}
                  } @else if (activeDrink(ctx); as drink) {
                    {{ drink.drinkName }} · {{ formatMoney(drink.price, drink.currency) }}
                  } @else {
                    {{ 'tablet.tally.chooseItem' | t }}
                  }
                </button>
              </div>

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
        color: #b91c1c;
        font-weight: 600;
      }
      .manage-action-info {
        color: #15803d;
        font-weight: 600;
      }
      .tally-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .tally-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
        gap: 0.6rem;
        margin: 0.75rem 0 1.25rem;
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
        border-radius: var(--radius-md, 0.75rem);
        background: var(--vereint-ink, #1b1f3b);
        color: #ffffff;
        box-shadow: 0 10px 24px -10px rgba(15, 23, 42, 0.5);
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
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 999px;
        background: transparent;
        color: #ffffff;
        font: inherit;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
      }
      .tally-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .member-button.ghost {
        background: transparent;
        border: 1px solid rgba(148, 163, 184, 0.5);
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
        background: var(--color-brand, #f59e0b);
      }
      .terminal-toggle {
        align-self: flex-start;
        min-height: 44px;
      }
      .quickbook-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 0.75rem;
        margin: 0 0 1.25rem;
        border: 1px solid rgba(148, 163, 184, 0.4);
        border-radius: var(--radius-md, 0.75rem);
      }
      .quickbook-label {
        font-weight: 600;
        opacity: 0.8;
      }
      .quickbook-drink {
        min-height: 44px;
        font-weight: 700;
      }
      .tally-actions .member-button {
        min-height: 44px;
      }
      /* Landscape-Optimierung: breites Grid und feste Aktionsleiste. */
      @media (min-width: 900px) and (orientation: landscape) {
        .tally-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .quickbook-drink {
          font-size: 1.05rem;
          padding-block: 0.75rem;
        }
      }
    `,
  ],
})
export class TabletComponent implements OnInit, OnDestroy {
  private readonly api = inject(TabletApiService);
  private readonly kiosk = inject(KioskModeService);

  protected readonly events = new AsyncState<TabletEvent[]>();
  protected readonly context = new AsyncState<EventContext>();

  protected readonly selectedEventId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionInfo = signal<string | null>(null);

  protected readonly activeDrinkId = signal<string | null>(null);
  /** Kiosk-Modus dieses Geräts; bleibt über Neuladen und Neustart erhalten. */
  protected readonly standalone = this.kiosk.active;
  protected readonly kioskStartOpen = signal(false);
  protected readonly drinkOverlayOpen = signal(false);
  protected readonly revenueSheetOpen = signal(false);
  protected readonly tallies = signal<Record<string, number>>({});

  /**
   * Schlüssel für Striche und Runden. Bricht eine Buchung ab (z. B. nach einer
   * Zeitüberschreitung), schickt ein erneuter Tipp mit denselben Daten denselben
   * Schlüssel, damit eine schon gespeicherte Buchung nicht doppelt entsteht.
   */
  private readonly purchaseKey = new RetryableIdempotencyKey();
  private readonly revenueKey = new RetryableIdempotencyKey();
  /** Buchungs-IDs der in dieser Sitzung erfassten Striche je Mitglied (für „−“/Rückgängig). */
  private readonly booked = signal<Record<string, string[]>>({});
  /** Letzter erfasster Strich für die Rückgängig-Leiste. */
  protected readonly lastBooking = signal<{ memberId: string; label: string } | null>(null);

  protected purchaseForm: { memberId: string; eventDrinkId?: string; eventFoodId?: string } = {
    memberId: '',
    eventDrinkId: '',
    eventFoodId: '',
  };
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
    this.purchaseForm = { memberId: '', eventDrinkId: '', eventFoodId: '' };
    this.revenueForm = { eventDrinkId: '', eventFoodId: '', kind: 'round' };
    this.revenueSelection = {};
    this.activeDrinkId.set(null);
    this.drinkOverlayOpen.set(false);
    this.revenueSheetOpen.set(false);
    this.tallies.set({});
    this.actionError.set(null);
    this.actionInfo.set(null);
    this.context.run(
      forkJoin({
        members: this.api.listMembers(eventId),
        drinks: this.api.listDrinks(eventId),
        food: this.api.listFood(eventId),
      }),
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

  /**
   * Schnellbuchung: bucht das aktive Getränk oder die Speise mit genau einem Aufruf für ein
   * Mitglied. Nutzt die bestehende Strichlisten-/Buchungslogik aus TICKET-034
   * wieder (inkl. Idempotency-Key) und dupliziert sie nicht.
   */
  protected quickBook(memberId: string): void {
    this.onTallyIncrease(memberId);
  }

  /** Aktuell für die Strichliste gewählter Artikel (Getränk oder Speise) aus dem Kontext. */
  protected activeItem(ctx: EventContext): { name: string; price: string; currency: string } | null {
    const id = this.activeDrinkId();
    if (!id) return null;
    const drink = ctx.drinks.find((d) => d.id === id);
    if (drink) return { name: drink.drinkName, price: drink.price, currency: drink.currency };
    const food = ctx.food.find((f) => f.id === id);
    if (food) return { name: food.foodName, price: food.effectivePrice, currency: food.currency };
    return null;
  }

  /** Aktuell für die Strichliste gewähltes Getränk aus dem Kontext. */
  protected activeDrink(ctx: EventContext): EventDrink | null {
    const id = this.activeDrinkId();
    return ctx.drinks.find((drink) => drink.id === id) ?? null;
  }

  /** Aktuelle Strichanzahl eines Mitglieds. */
  protected tallyFor(memberId: string): number {
    return this.tallies()[memberId] ?? 0;
  }

  /** Öffnet das Getränke-Overlay. */
  protected openDrinkOverlay(): void {
    this.drinkOverlayOpen.set(true);
  }

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

  /**
   * Erhöht die Striche eines Mitglieds um eins und löst genau einen
   * Buchungsaufruf mit dem aktiven Artikel aus. Fehlt noch ein Artikel, öffnet
   * sich das Auswahl-Overlay statt einer Buchung.
   */
  protected onTallyIncrease(memberId: string): void {
    const itemId = this.activeDrinkId();
    if (!itemId) {
      this.drinkOverlayOpen.set(true);
      return;
    }
    const ctx = this.context.data();
    const isFood = ctx?.food.some((f) => f.id === itemId) ?? false;
    this.tallies.update((current) => ({
      ...current,
      [memberId]: (current[memberId] ?? 0) + 1,
    }));
    this.purchaseForm = isFood
      ? { memberId, eventDrinkId: '', eventFoodId: itemId }
      : { memberId, eventDrinkId: itemId, eventFoodId: '' };
    this.recordPurchase();
  }

  /**
   * Nimmt den letzten in dieser Sitzung erfassten Strich eines Mitglieds zurück.
   * Der Server bucht dafür eine Gegenbuchung (nur eigene, frische Striche).
   * Ohne eigenen Strich in dieser Sitzung bleibt die Anzeige unverändert und es
   * erscheint ein Hinweis auf die Korrektur durch den Vorstand.
   */
  protected onTallyDecrease(memberId: string): void {
    const eventId = this.selectedEventId();
    const stack = this.booked()[memberId] ?? [];
    const entryId = stack[stack.length - 1];
    if (!eventId || !entryId) {
      this.actionError.set(
        translate('tablet.messages.undoNotPossible'),
      );
      return;
    }
    this.booked.update((current) => ({ ...current, [memberId]: stack.slice(0, -1) }));
    this.tallies.update((current) => ({
      ...current,
      [memberId]: Math.max(0, (current[memberId] ?? 0) - 1),
    }));
    if (this.lastBooking()?.memberId === memberId) this.lastBooking.set(null);
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    this.api.undoPurchase(eventId, entryId, newIdempotencyKey()).subscribe({
      next: () => {
        this.busy.set(false);
        this.actionInfo.set(translate('tablet.messages.undone'));
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.booked.update((current) => ({ ...current, [memberId]: [...(current[memberId] ?? []), entryId] }));
        this.tallies.update((current) => ({ ...current, [memberId]: (current[memberId] ?? 0) + 1 }));
        this.actionError.set(describeApiError(error));
      },
    });
  }

  /** Rückgängig-Leiste: nimmt den zuletzt erfassten Strich zurück. */
  protected undoLast(): void {
    const last = this.lastBooking();
    if (last) this.onTallyDecrease(last.memberId);
  }

  /** Öffnet das Runden-/Abend-Sheet und wählt zunächst alle Mitglieder vor. */
  protected openRevenueSheet(kind: RevenueKind, members: TabletMember[]): void {
    const itemId = this.activeDrinkId() ?? '';
    const ctx = this.context.data();
    const isFood = ctx?.food.some((f) => f.id === itemId) ?? false;
    this.revenueForm = {
      eventDrinkId: isFood ? '' : itemId,
      eventFoodId: isFood ? itemId : '',
      kind,
    };
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

  /** Bestätigt das Sheet: setzt das aktive Getränk/Speise und bucht die Aktion. */
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
      },
      error: (error: unknown) => {
        this.busy.set(false);
        onError?.();
        this.actionError.set(describeApiError(error));
      },
    });
  }

  protected recordPurchase(): void {
    const eventId = this.selectedEventId();
    const { memberId, eventDrinkId, eventFoodId } = this.purchaseForm;
    if (!eventId || !memberId || (!eventDrinkId && !eventFoodId)) return;
    const label = this.bookingLabel(memberId, eventDrinkId || eventFoodId || '');
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    const payload = {
      memberId,
      eventDrinkId: eventDrinkId || undefined,
      eventFoodId: eventFoodId || undefined,
    };
    const keyData = { eventId, ...payload };
    const key = this.purchaseKey.for(keyData);
    this.api
      .recordPurchase(eventId, payload, key)
      .subscribe({
        next: (entry) => {
          this.busy.set(false);
          this.purchaseKey.reset();
          if (entry?.id && this.booked()[memberId]?.includes(entry.id)) {
            // Der Server hat eine schon gezählte Buchung als Wiederholung
            // zurückgegeben: den eben optimistisch gesetzten Strich zurücknehmen.
            this.tallies.update((current) => ({
              ...current,
              [memberId]: Math.max(0, (current[memberId] ?? 0) - 1),
            }));
            return;
          }
          if (entry?.id) {
            this.booked.update((current) => ({
              ...current,
              [memberId]: [...(current[memberId] ?? []), entry.id],
            }));
            this.lastBooking.set({ memberId, label });
          }
          this.actionInfo.set(translate('tablet.messages.purchaseRecorded'));
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.purchaseKey.failed(keyData, key);
          // Fehlgeschlagene Buchung: den optimistisch gezählten Strich wieder entfernen.
          this.tallies.update((current) => ({
            ...current,
            [memberId]: Math.max(0, (current[memberId] ?? 0) - 1),
          }));
          this.actionError.set(describeApiError(error));
        },
      });
    this.purchaseForm = { memberId: '', eventDrinkId: '', eventFoodId: '' };
  }

  /** „Bob · Helles“ für die Rückgängig-Leiste. */
  private bookingLabel(memberId: string, itemId: string): string {
    const ctx = this.context.data();
    const member = ctx?.members.find((m) => m.memberId === memberId)?.displayName ?? translate('tablet.fallback.member');
    const item =
      ctx?.drinks.find((d) => d.id === itemId)?.drinkName ??
      ctx?.food.find((f) => f.id === itemId)?.foodName ??
      translate('tablet.fallback.item');
    return `${member} · ${item}`;
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
