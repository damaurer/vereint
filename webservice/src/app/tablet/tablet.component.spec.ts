import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { EventDrink, EventFood } from '../events/event-manage.types';
import type { LedgerEntry, Round, TabletBoard, TabletEvent, TabletMember } from '../api/api.types';
import { TabletApiService } from './tablet-api.service';
import { KioskModeService } from '../kiosk/kiosk-mode.service';
import { TabletComponent } from './tablet.component';
import type { TallyCell } from './tally-grid.component';
import type { TallyPickItem } from './tally-picker.component';

const events: TabletEvent[] = [
  {
    id: 'e-1',
    title: 'Vereinsabend',
    location: 'Halle',
    startsAt: '2026-06-01T18:00:00Z',
    status: 'active',
  },
];

const members: TabletMember[] = [
  { memberId: 'm-1', displayName: 'Alice' },
  { memberId: 'm-2', displayName: 'Bob' },
];

const eventDrink = (id: string, name: string, price: string, tallyCategoryId: string | null): EventDrink => ({
  id,
  eventId: 'e-1',
  drinkId: `g-${id}`,
  drinkName: name,
  price,
  effectivePrice: price,
  currency: 'EUR',
  selfServiceEnabled: true,
  tabletEnabled: true,
  catalogVersion: 1,
  imageSnapshot: null,
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-01T10:00:00Z',
  tallyCategoryId,
});

const drinks: EventDrink[] = [
  eventDrink('d-1', 'Helles', '3.50', 'c-bier'),
  eventDrink('d-2', 'Weißbier', '3.50', 'c-bier'),
  eventDrink('d-3', 'Obstler', '2.00', 'c-schnaps'),
  eventDrink('d-4', 'Wasser', '1.50', null),
];

const food: EventFood[] = [
  {
    id: 'f-1',
    eventId: 'e-1',
    foodId: 'x-1',
    foodName: 'Brezel',
    price: null,
    effectivePrice: '2.00',
    currency: 'EUR',
    selfServiceEnabled: true,
    tabletEnabled: true,
  } as unknown as EventFood,
];

const board = (): TabletBoard => ({
  columns: [
    {
      categoryId: 'c-bier',
      name: 'Bier',
      price: '3.50',
      currency: 'EUR',
      drinks: [
        { eventDrinkId: 'd-1', drinkName: 'Helles' },
        { eventDrinkId: 'd-2', drinkName: 'Weißbier' },
      ],
    },
    { categoryId: 'c-schnaps', name: 'Schnaps', price: '2.00', currency: 'EUR', drinks: [{ eventDrinkId: 'd-3', drinkName: 'Obstler' }] },
    { categoryId: 'c-wein', name: 'Wein', price: '4.00', currency: 'EUR', drinks: [] },
  ],
  members: [
    { memberId: 'm-1', displayName: 'Alice', counts: { 'c-bier': 3 }, otherCount: 0 },
    { memberId: 'm-2', displayName: 'Bob', counts: {}, otherCount: 0 },
  ],
  tallyCount: 3,
  revenue: '10.50',
  currency: 'EUR',
});

const entry = { id: 'l-1' } as LedgerEntry;

interface TabletInternals {
  selectEvent(eventId: string): void;
  onCellTap(cell: TallyCell): void;
  onPick(item: TallyPickItem): void;
  picker: () => { items: TallyPickItem[]; title: string } | null;
  board: () => TabletBoard | null;
  undoLast(): void;
  lastBooking: () => { entryId: string; label: string; cell: TallyCell } | null;
  actionError: () => string | null;
  payers: () => Record<string, string>;
  roundsOpen: { (): boolean; set(value: boolean): void };
  standalone: () => boolean;
  toggleStandalone(): void;
  kioskStartOpen: () => boolean;
  onKioskStarted(session: { id: string }): void;
}

describe('TabletComponent', () => {
  let api: {
    listEvents: ReturnType<typeof vi.fn>;
    listMembers: ReturnType<typeof vi.fn>;
    listDrinks: ReturnType<typeof vi.fn>;
    listFood: ReturnType<typeof vi.fn>;
    loadBoard: ReturnType<typeof vi.fn>;
    recordPurchase: ReturnType<typeof vi.fn>;
    undoPurchase: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [TabletComponent],
      providers: [provideRouter([]), { provide: TabletApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(TabletComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const open = async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp };
  };

  const html = (fixture: { nativeElement: unknown }) => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const count = (cmp: TabletInternals, memberId: string, categoryId: string) =>
    cmp.board()?.members.find((m) => m.memberId === memberId)?.counts[categoryId] ?? 0;

  beforeEach(() => {
    localStorage.clear();
    api = {
      listEvents: vi.fn(() => of(events)),
      listMembers: vi.fn(() => of(members)),
      listDrinks: vi.fn(() => of(drinks)),
      listFood: vi.fn(() => of(food)),
      loadBoard: vi.fn(() => of(board())),
      recordPurchase: vi.fn(() => of(entry)),
      undoPurchase: vi.fn(() => of({ id: 'l-2' } as LedgerEntry)),
    };
  });

  it('shows one row per member and one column per category with price and tally bundles', async () => {
    const { fixture } = await open();
    expect(api.loadBoard).toHaveBeenCalledWith('e-1');
    const text = html(fixture);
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
    expect(text).toContain('Bier');
    expect(text).toContain('je Strich');
    expect(text).toContain('Sonstiges');
    expect(text).toContain('Heute an der Theke');
    const el = fixture.nativeElement as HTMLElement;
    // Alice hat drei Striche Bier: drei senkrechte Striche, ein Bündel.
    expect(el.querySelectorAll('tbody tr')[0].querySelectorAll('.stroke').length).toBe(3);
    // Leere Felder zeigen ein Plus.
    expect(el.querySelectorAll('tbody tr')[1].querySelector('.cell-count')?.textContent?.trim()).toBe('+');
  });

  it('books the only drink of a category directly at a single tap', async () => {
    const { cmp } = await open();
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    expect(api.recordPurchase).toHaveBeenCalledTimes(1);
    const [eventId, payload, key] = api.recordPurchase.mock.calls[0];
    expect(eventId).toBe('e-1');
    expect(payload).toEqual({ memberId: 'm-2', eventDrinkId: 'd-3' });
    expect(typeof key).toBe('string');
    expect(cmp.lastBooking()?.label).toContain('Bob · Schnaps');
    expect(api.loadBoard).toHaveBeenCalledTimes(2);
  });

  it('asks which drink when a category holds several and books the chosen one', async () => {
    const { cmp } = await open();
    cmp.onCellTap({ memberId: 'm-1', categoryId: 'c-bier' });
    expect(api.recordPurchase).not.toHaveBeenCalled();
    const picker = cmp.picker();
    expect(picker?.items.map((i) => i.name)).toEqual(['Helles', 'Weißbier']);
    expect(picker?.items.every((i) => i.price === '3.50')).toBe(true);
    cmp.onPick(picker!.items[1]);
    expect(cmp.picker()).toBeNull();
    expect(api.recordPurchase.mock.calls[0][1]).toEqual({ memberId: 'm-1', eventDrinkId: 'd-2' });
  });

  it('offers drinks without category and food in the column "Sonstiges"', async () => {
    const { cmp } = await open();
    cmp.onCellTap({ memberId: 'm-1', categoryId: null });
    expect(cmp.picker()?.items.map((i) => `${i.kind}:${i.name}`)).toEqual(['drink:Wasser', 'food:Brezel']);
    cmp.onPick(cmp.picker()!.items[1]);
    expect(api.recordPurchase.mock.calls[0][1]).toEqual({ memberId: 'm-1', eventFoodId: 'f-1' });
  });

  it('explains an empty category instead of booking', async () => {
    const { cmp } = await open();
    cmp.onCellTap({ memberId: 'm-1', categoryId: 'c-wein' });
    expect(api.recordPurchase).not.toHaveBeenCalled();
    expect(cmp.actionError()).toContain('Wein');
  });

  it('counts the mark at once and takes it back when the booking fails', async () => {
    const pending = new Subject<LedgerEntry>();
    api.recordPurchase.mockReturnValue(pending);
    const { cmp } = await open();
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    expect(count(cmp, 'm-2', 'c-schnaps')).toBe(1);
    pending.error(new ApiError(500, 'internal_error', ''));
    expect(count(cmp, 'm-2', 'c-schnaps')).toBe(0);
    expect(cmp.lastBooking()).toBeNull();
    expect(cmp.actionError()).toBeTruthy();
  });

  it('retries a failed mark with the same key and counts a replayed booking only once', async () => {
    api.recordPurchase
      .mockReturnValueOnce(throwError(() => new ApiError(503, 'upstream_unavailable', '')))
      .mockReturnValueOnce(of({ id: 'l-9' } as LedgerEntry))
      .mockReturnValueOnce(of({ id: 'l-9' } as LedgerEntry));
    api.loadBoard.mockReturnValue(new Subject<TabletBoard>());
    api.loadBoard.mockReturnValueOnce(of(board()));
    const { cmp } = await open();
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    expect(api.recordPurchase.mock.calls[1][2]).toBe(api.recordPurchase.mock.calls[0][2]);
    expect(count(cmp, 'm-2', 'c-schnaps')).toBe(1);
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    expect(count(cmp, 'm-2', 'c-schnaps')).toBe(1);
  });

  it('two quick taps are two bookings with separate keys', async () => {
    const first = new Subject<LedgerEntry>();
    const second = new Subject<LedgerEntry>();
    api.recordPurchase.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { cmp } = await open();
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    expect(api.recordPurchase.mock.calls[1][2]).not.toBe(api.recordPurchase.mock.calls[0][2]);
    expect(count(cmp, 'm-2', 'c-schnaps')).toBe(2);
  });

  it('undo takes back the last mark with a counter-booking', async () => {
    const { fixture, cmp } = await open();
    api.loadBoard.mockReturnValue(new Subject<TabletBoard>());
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    fixture.detectChanges();
    expect(html(fixture)).toContain('Strich: Bob · Schnaps');
    expect(html(fixture)).toContain('Rückgängig');
    cmp.undoLast();
    expect(api.undoPurchase).toHaveBeenCalledTimes(1);
    const [eventId, entryId, key] = api.undoPurchase.mock.calls[0];
    expect(eventId).toBe('e-1');
    expect(entryId).toBe('l-1');
    expect(typeof key).toBe('string');
    expect(count(cmp, 'm-2', 'c-schnaps')).toBe(0);
    expect(cmp.lastBooking()).toBeNull();
  });

  it('keeps the mark when the undo fails', async () => {
    api.undoPurchase.mockReturnValue(throwError(() => new ApiError(409, 'ledger_already_corrected', '')));
    const { cmp } = await open();
    api.loadBoard.mockReturnValue(new Subject<TabletBoard>());
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    cmp.undoLast();
    expect(count(cmp, 'm-2', 'c-schnaps')).toBe(1);
    expect(cmp.lastBooking()).not.toBeNull();
    expect(cmp.actionError()).toBeTruthy();
  });

  it('shows the empty state when nothing can be booked', async () => {
    api.listDrinks.mockReturnValue(of([]));
    api.listFood.mockReturnValue(of([]));
    api.loadBoard.mockReturnValue(of({ ...board(), columns: [] }));
    const { fixture } = await open();
    expect(html(fixture)).toContain('Erfassung nicht möglich');
  });

  it('shows running rounds and who pays in the row header, without buttons to buy a round', async () => {
    const round: Round = {
      id: 'r-1',
      eventId: 'e-1',
      sponsorId: 'm-3',
      sponsorName: 'Thomas',
      kind: 'round',
      eventDrinkId: 'd-1',
      drinkName: 'Helles',
      maxAmount: '7.00',
      usedAmount: '3.50',
      currency: 'EUR',
      validUntil: new Date(Date.now() + 18 * 60_000).toISOString(),
      endedAt: null,
      status: 'running',
      createdAt: '2026-06-01T18:00:00Z',
      invitees: [
        { memberId: 'm-1', displayName: 'Alice', redeemedCount: 1, redeemed: true },
        { memberId: 'm-2', displayName: 'Bob', redeemedCount: 0, redeemed: false },
      ],
    };
    const withRound = board();
    withRound.members[1] = { ...withRound.members[1], fundedBy: { roundId: 'r-1', sponsorName: 'Thomas', kind: 'round' } };
    api.loadBoard.mockReturnValue(of({ ...withRound, rounds: [round] }));
    const { fixture, cmp } = await open();
    const text = html(fixture);
    expect(cmp.payers()).toEqual({ 'm-2': 'Runde von Thomas' });
    expect(text).toContain('Runde von Thomas');
    expect(text).toContain('Eigene Rechnung');
    expect(text).toContain('Laufende Runden');
    expect(text).toContain('Eine Runde Helles');
    expect(text).toContain('1 von 2');
    expect(text).not.toContain('Ganzen Abend stiften');

    cmp.roundsOpen.set(true);
    fixture.detectChanges();
    expect(html(fixture)).toContain('Gibt aus');
    expect(html(fixture)).toContain('noch 18 Min');
  });

  it('says that no round is running', async () => {
    const { fixture } = await open();
    expect(html(fixture)).toContain('Gerade läuft keine Runde.');
  });

  it('starts kiosk mode after the device chose its PIN and keeps it on the device', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    expect(cmp.standalone()).toBe(false);
    expect(html(fixture)).toContain('Kiosk-Modus starten');

    cmp.toggleStandalone();
    fixture.detectChanges();
    expect(cmp.kioskStartOpen()).toBe(true);

    cmp.onKioskStarted({ id: 's-1' });
    fixture.detectChanges();
    expect(cmp.standalone()).toBe(true);
    expect(html(fixture)).toContain('Kiosk-Modus aktiv');
    expect(JSON.parse(localStorage.getItem('vereint.kiosk')!)).toEqual({ active: true, sessionId: 's-1', eventId: 'e-1' });

    cmp.toggleStandalone();
    fixture.detectChanges();
    expect(cmp.standalone()).toBe(true);
    expect(TestBed.inject(KioskModeService).unlockOpen()).toBe(true);
  });

  it('reopens the remembered event when the device is in kiosk mode', async () => {
    localStorage.setItem('vereint.kiosk', JSON.stringify({ active: true, sessionId: 's-1', eventId: 'e-1' }));
    const fixture = await create();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.listMembers).toHaveBeenCalledWith('e-1');
    expect(api.loadBoard).toHaveBeenCalledWith('e-1');
  });

  it('keeps the marks across a kiosk mode toggle', async () => {
    const { fixture, cmp } = await open();
    cmp.onCellTap({ memberId: 'm-2', categoryId: 'c-schnaps' });
    cmp.onKioskStarted({ id: 's-1' });
    fixture.detectChanges();
    expect(count(cmp, 'm-1', 'c-bier')).toBe(3);
    expect(cmp.board()).not.toBeNull();
  });

  it('shows an empty state when no active events exist', async () => {
    api.listEvents.mockReturnValue(of([]));
    const fixture = await create();
    expect(html(fixture)).toContain('Keine aktiven Events');
  });

  it('shows a neutral error state when access is denied', async () => {
    api.listEvents.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
