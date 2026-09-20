import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { EventDrink } from '../events/event-manage.types';
import type { LedgerEntry, TabletEvent, TabletMember } from '../api/api.types';
import { TabletApiService } from './tablet-api.service';
import { TabletComponent } from './tablet.component';

const events: TabletEvent[] = [
  {
    id: 'e-1',
    title: 'Vereinsabend',
    location: 'Halle',
    startsAt: '2026-06-01T18:00:00Z',
    status: 'active',
  },
];

const members: TabletMember[] = [{ memberId: 'm-1', displayName: 'Alice' }];

const drinks: EventDrink[] = [
  {
    id: 'd-1',
    eventId: 'e-1',
    drinkId: 'g-1',
    drinkName: 'Bier',
    price: '2.50',
    currency: 'EUR',
    selfServiceEnabled: true,
    tabletEnabled: true,
    catalogVersion: 1,
    imageSnapshot: null,
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
  },
];

const entry = { id: 'l-1' } as LedgerEntry;

interface TabletInternals {
  selectEvent(eventId: string): void;
  purchaseForm: { memberId: string; eventDrinkId: string };
  recordPurchase(): void;
  revenueForm: { eventDrinkId: string; kind: 'round' | 'evening' };
  revenueSelection: Record<string, boolean>;
  recordRevenue(): void;
  activeDrinkId: () => string | null;
  selectActiveDrink(eventDrinkId: string): void;
  confirmDrink(): void;
  drinkOverlayOpen: () => boolean;
  onTallyIncrease(memberId: string): void;
  onTallyDecrease(memberId: string): void;
  tallyFor(memberId: string): number;
  openRevenueSheet(kind: 'round' | 'evening', members: TabletMember[]): void;
  confirmRevenue(): void;
  revenueSheetOpen: () => boolean;
  standalone: () => boolean;
  toggleStandalone(): void;
  quickBook(memberId: string): void;
}

describe('TabletComponent', () => {
  let api: {
    listEvents: ReturnType<typeof vi.fn>;
    listMembers: ReturnType<typeof vi.fn>;
    listDrinks: ReturnType<typeof vi.fn>;
    listFood: ReturnType<typeof vi.fn>;
    recordPurchase: ReturnType<typeof vi.fn>;
    recordRound: ReturnType<typeof vi.fn>;
    recordEvening: ReturnType<typeof vi.fn>;
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

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      listEvents: vi.fn(() => of(events)),
      listMembers: vi.fn(() => of(members)),
      listDrinks: vi.fn(() => of(drinks)),
      listFood: vi.fn(() => of([])),
      recordPurchase: vi.fn(() => of(entry)),
      recordRound: vi.fn(() => of([entry])),
      recordEvening: vi.fn(() => of([entry])),
    };
  });

  it('lists active events and loads members and drinks on selection', async () => {
    const fixture = await create();
    expect(html(fixture)).toContain('Vereinsabend');
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.listMembers).toHaveBeenCalledWith('e-1');
    expect(api.listDrinks).toHaveBeenCalledWith('e-1');
    expect(html(fixture)).toContain('Strichliste');
    expect(html(fixture)).toContain('Alice');
  });

  it('books exactly one purchase for the active drink on tally increase', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    cmp.selectActiveDrink('d-1');
    cmp.onTallyIncrease('m-1');
    expect(api.recordPurchase).toHaveBeenCalledTimes(1);
    const [eventId, payload, key] = api.recordPurchase.mock.calls[0];
    expect(eventId).toBe('e-1');
    expect(payload).toEqual({ memberId: 'm-1', eventDrinkId: 'd-1' });
    expect(typeof key).toBe('string');
    expect(cmp.tallyFor('m-1')).toBe(1);
  });

  it('opens the drink overlay instead of booking when no drink is active', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    cmp.onTallyIncrease('m-1');
    expect(api.recordPurchase).not.toHaveBeenCalled();
    expect(cmp.drinkOverlayOpen()).toBe(true);
  });

  it('confirms the active drink selection and closes the overlay', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    cmp.selectActiveDrink('d-1');
    cmp.confirmDrink();
    expect(cmp.activeDrinkId()).toBe('d-1');
    expect(cmp.drinkOverlayOpen()).toBe(false);
  });

  it('books a round via the revenue sheet for the preselected members', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    cmp.selectActiveDrink('d-1');
    cmp.openRevenueSheet('round', members);
    cmp.confirmRevenue();
    expect(api.recordRound).toHaveBeenCalledTimes(1);
    const [eventId, payload] = api.recordRound.mock.calls[0];
    expect(eventId).toBe('e-1');
    expect(payload).toEqual({ eventDrinkId: 'd-1', memberIds: ['m-1'] });
    expect(cmp.revenueSheetOpen()).toBe(false);
  });

  it('records a manual purchase with a generated idempotency key', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    cmp.purchaseForm = { memberId: 'm-1', eventDrinkId: 'd-1' };
    cmp.recordPurchase();
    expect(api.recordPurchase).toHaveBeenCalledTimes(1);
    const [eventId, payload, key] = api.recordPurchase.mock.calls[0];
    expect(eventId).toBe('e-1');
    expect(payload).toEqual({ memberId: 'm-1', eventDrinkId: 'd-1' });
    expect(typeof key).toBe('string');
    expect((key as string).length).toBeGreaterThan(0);
  });

  it('records an evening action for the selected members', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    cmp.revenueForm = { eventDrinkId: 'd-1', kind: 'evening' };
    cmp.revenueSelection = { 'm-1': true };
    cmp.recordRevenue();
    expect(api.recordEvening).toHaveBeenCalledTimes(1);
    const [eventId, payload] = api.recordEvening.mock.calls[0];
    expect(eventId).toBe('e-1');
    expect(payload).toEqual({ eventDrinkId: 'd-1', memberIds: ['m-1'] });
    expect(api.recordRound).not.toHaveBeenCalled();
  });

  it('toggles standalone mode and shows or hides the portal action', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    expect(cmp.standalone()).toBe(false);
    expect(html(fixture)).not.toContain('Zurück zum Stammtisch-Portal');

    cmp.toggleStandalone();
    fixture.detectChanges();
    expect(cmp.standalone()).toBe(true);
    expect(html(fixture)).toContain('Zurück zum Stammtisch-Portal');
    expect(html(fixture)).toContain('Standalone Terminal Modus');

    cmp.toggleStandalone();
    fixture.detectChanges();
    expect(cmp.standalone()).toBe(false);
    expect(html(fixture)).not.toContain('Zurück zum Stammtisch-Portal');
  });

  it('preserves the selected event and tallies across an orientation/mode toggle', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    cmp.selectActiveDrink('d-1');
    cmp.quickBook('m-1');
    expect(cmp.tallyFor('m-1')).toBe(1);
    cmp.toggleStandalone();
    fixture.detectChanges();
    expect(cmp.activeDrinkId()).toBe('d-1');
    expect(cmp.tallyFor('m-1')).toBe(1);
  });

  it('quick-book triggers exactly one purchase for the active drink', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TabletInternals;
    cmp.selectEvent('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    cmp.selectActiveDrink('d-1');
    cmp.quickBook('m-1');
    expect(api.recordPurchase).toHaveBeenCalledTimes(1);
    const [eventId, payload, key] = api.recordPurchase.mock.calls[0];
    expect(eventId).toBe('e-1');
    expect(payload).toEqual({ memberId: 'm-1', eventDrinkId: 'd-1' });
    expect(typeof key).toBe('string');
    expect(cmp.tallyFor('m-1')).toBe(1);
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
