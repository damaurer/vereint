import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type {
  EventLedgerSummary,
  EventSummary,
  LedgerEntry,
  MemberBalance,
  MemberBalanceOverview,
} from '../api/api.types';
import { BoardApiService } from './board-api.service';
import { TreasuryComponent } from './treasury.component';

const events: EventSummary[] = [
  {
    id: 'e-1',
    title: 'Sommerfest',
    status: 'active',
    startsAt: '2026-06-01T18:00:00Z',
    endsAt: null,
    ownerId: 'o-1',
    ownerDisplayName: 'Owner',
  },
];

const summary: EventLedgerSummary = {
  eventId: 'e-1',
  currency: 'EUR',
  revenueTotal: '42.00',
  creditConsumptionTotal: '10.00',
  entryCount: 5,
};

const balance: MemberBalance = {
  memberId: 'm-1',
  currency: 'EUR',
  creditBalance: '12.50',
  topupTotal: '20.00',
  payoutTotal: '0.00',
  purchaseTotal: '7.50',
  correctionTotal: '0.00',
  entryCount: 2,
};

const entry: LedgerEntry = {
  id: 'l-1',
  entryType: 'topup',
  eventId: null,
  memberId: 'm-1',
  memberDisplayName: 'Alice',
  drinkId: null,
  amount: '20.00',
  currency: 'EUR',
  accountingMode: 'credit',
  source: null,
  actorId: 'a-1',
  reversesEntryId: null,
  idempotencyKey: 'k-1',
  createdAt: '2026-01-01T10:00:00Z',
  snapshot: null,
};

const balances: MemberBalanceOverview[] = [
  {
    memberId: 'm-1',
    displayName: 'Alice',
    currency: 'EUR',
    creditBalance: '12.50',
    lastEntryAt: '2026-01-01T10:00:00Z',
  },
  {
    memberId: 'm-2',
    displayName: 'Bob',
    currency: 'EUR',
    creditBalance: '-4.00',
    lastEntryAt: null,
  },
];

const olderEntry: LedgerEntry = {
  ...entry,
  id: 'l-0',
  entryType: 'purchase',
  amount: '-7.50',
  createdAt: '2025-12-01T10:00:00Z',
};

describe('TreasuryComponent', () => {
  let api: {
    listEvents: ReturnType<typeof vi.fn>;
    listBalances: ReturnType<typeof vi.fn>;
    getEventSummary: ReturnType<typeof vi.fn>;
    getBalance: ReturnType<typeof vi.fn>;
    listEntries: ReturnType<typeof vi.fn>;
    topup: ReturnType<typeof vi.fn>;
    payout: ReturnType<typeof vi.fn>;
    correct: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [TreasuryComponent],
      providers: [provideRouter([]), { provide: BoardApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(TreasuryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const settle = async (fixture: ComponentFixture<TreasuryComponent>) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const html = (fixture: { nativeElement: unknown }) => root(fixture).textContent ?? '';

  const memberButton = (fixture: { nativeElement: unknown }, name: string) =>
    Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('.treasury-member')).find((b) =>
      b.textContent?.includes(name),
    )!;

  const formWith = (fixture: { nativeElement: unknown }, buttonText: string) =>
    Array.from(root(fixture).querySelectorAll('form')).find((form) =>
      Array.from(form.querySelectorAll('button')).some((b) => b.textContent?.trim() === buttonText),
    )!;

  const fill = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
  };

  const openAlice = async (fixture: ComponentFixture<TreasuryComponent>) => {
    memberButton(fixture, 'Alice').click();
    await settle(fixture);
  };

  beforeEach(() => {
    api = {
      listEvents: vi.fn(() => of(events)),
      listBalances: vi.fn(() => of(balances)),
      getEventSummary: vi.fn(() => of(summary)),
      getBalance: vi.fn(() => of(balance)),
      listEntries: vi.fn(() => of([olderEntry, entry])),
      topup: vi.fn(() => of(entry)),
      payout: vi.fn(() => of(entry)),
      correct: vi.fn(() => of(entry)),
    };
  });

  it('renders the events and their aggregated summary on demand', async () => {
    const fixture = await create();
    expect(html(fixture)).toContain('Sommerfest');
    const button = Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Abrechnung',
    )!;
    button.click();
    await settle(fixture);
    expect(api.getEventSummary).toHaveBeenCalledWith('e-1');
    expect(html(fixture)).toContain('Eventabrechnung');
  });

  it('lists all member balances with negative ones highlighted', async () => {
    const fixture = await create();
    expect(api.listBalances).toHaveBeenCalled();
    expect(html(fixture)).toContain('Alice');
    expect(html(fixture)).toContain('Noch keine Buchung');
    expect(memberButton(fixture, 'Bob').classList).toContain('treasury-member-negative');
    expect(memberButton(fixture, 'Alice').classList).not.toContain('treasury-member-negative');
    // No raw ID inputs anymore.
    expect(html(fixture)).not.toContain('Mitglieds-ID');
  });

  it('filters the overview by name', async () => {
    const fixture = await create();
    const search = root(fixture).querySelector<HTMLInputElement>('input[type="search"]')!;
    fill(search, 'bo');
    await settle(fixture);
    const names = Array.from(root(fixture).querySelectorAll('.treasury-member-name')).map((n) =>
      n.textContent?.trim(),
    );
    expect(names).toEqual(['Bob']);
  });

  it('opens the member panel with balance and newest-first history', async () => {
    const fixture = await create();
    await openAlice(fixture);
    expect(api.getBalance).toHaveBeenCalledWith('m-1');
    expect(api.listEntries).toHaveBeenCalledWith('m-1');
    const panel = root(fixture).querySelector('#treasury-panel')!;
    expect(panel.textContent).toContain('12,50');
    const titles = Array.from(panel.querySelectorAll('.treasury-entry .member-list-title')).map(
      (n) => n.textContent?.trim(),
    );
    expect(titles).toEqual(['Aufladung', 'Kauf']);
  });

  it('books a topup for the selected member and refreshes the views', async () => {
    const fixture = await create();
    await openAlice(fixture);
    api.listBalances.mockClear();
    api.listEntries.mockClear();

    const form = formWith(fixture, 'Aufladen');
    const [amount, note] = Array.from(form.querySelectorAll('input'));
    fill(amount, '5.00');
    fill(note, 'Bar');
    await settle(fixture);
    form.dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(api.topup).toHaveBeenCalledTimes(1);
    const [payload, key] = api.topup.mock.calls[0];
    expect(payload).toEqual({ memberId: 'm-1', amount: '5.00', note: 'Bar' });
    expect(typeof key).toBe('string');
    expect((key as string).length).toBeGreaterThan(0);
    expect(html(fixture)).toContain('Aufladung gebucht.');
    expect(api.listBalances).toHaveBeenCalledTimes(1);
    expect(api.listEntries).toHaveBeenCalledWith('m-1');
  });

  it('books a payout for the selected member', async () => {
    const fixture = await create();
    await openAlice(fixture);
    const form = formWith(fixture, 'Auszahlen');
    fill(form.querySelector('input')!, '2.00');
    await settle(fixture);
    form.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(api.payout.mock.calls[0][0]).toEqual({ memberId: 'm-1', amount: '2.00', note: undefined });
    expect(html(fixture)).toContain('Auszahlung gebucht.');
  });

  it('corrects a booking chosen from the history', async () => {
    const fixture = await create();
    await openAlice(fixture);
    const pick = root(fixture).querySelectorAll<HTMLButtonElement>('.treasury-pick');
    expect(pick.length).toBe(2);
    pick[1].click(); // older purchase
    await settle(fixture);

    const form = formWith(fixture, 'Korrigieren');
    const select = form.querySelector('select')!;
    expect(select.value).toBe('l-0');
    fill(form.querySelector('input')!, 'Falsch gebucht');
    await settle(fixture);
    form.dispatchEvent(new Event('submit'));
    await settle(fixture);

    const [payload, key] = api.correct.mock.calls[0];
    expect(payload).toEqual({ originalEntryId: 'l-0', reason: 'Falsch gebucht' });
    expect(typeof key).toBe('string');
    expect(html(fixture)).toContain('Korrektur gebucht.');
  });

  it('does not offer already corrected bookings or corrections for correction', async () => {
    const reversal: LedgerEntry = {
      ...entry,
      id: 'l-2',
      entryType: 'correction',
      amount: '7.50',
      reversesEntryId: 'l-0',
      createdAt: '2026-02-01T10:00:00Z',
    };
    api.listEntries.mockReturnValue(of([olderEntry, entry, reversal]));
    const fixture = await create();
    await openAlice(fixture);
    const options = Array.from(
      root(fixture).querySelectorAll<HTMLOptionElement>('select[name="correctionEntry"] option'),
    ).map((o) => o.value);
    expect(options).toEqual(['', 'l-1']);
    expect(html(fixture)).toContain('Korrigiert');
  });

  it('shows a neutral error state when events cannot be loaded', async () => {
    api.listEvents.mockReturnValue(
      throwError(() => new ApiError(403, 'permission_denied', '')),
    );
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
