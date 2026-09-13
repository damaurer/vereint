import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { EventLedgerSummary, EventSummary, LedgerEntry, MemberBalance } from '../api/api.types';
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

interface TreasuryInternals {
  topupForm: { memberId: string; amount: string; note: string };
  topup(): void;
  loadSummary(eventId: string): void;
  lookupMemberId: string;
  lookupMember(): void;
}

describe('TreasuryComponent', () => {
  let api: {
    listEvents: ReturnType<typeof vi.fn>;
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

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      listEvents: vi.fn(() => of(events)),
      getEventSummary: vi.fn(() => of(summary)),
      getBalance: vi.fn(() => of(balance)),
      listEntries: vi.fn(() => of([entry])),
      topup: vi.fn(() => of(entry)),
      payout: vi.fn(() => of(entry)),
      correct: vi.fn(() => of(entry)),
    };
  });

  it('renders the events and their aggregated summary on demand', async () => {
    const fixture = await create();
    expect(html(fixture)).toContain('Sommerfest');
    const cmp = fixture.componentInstance as unknown as TreasuryInternals;
    cmp.loadSummary('e-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.getEventSummary).toHaveBeenCalledWith('e-1');
    expect(html(fixture)).toContain('Eventabrechnung');
  });

  it('looks up a member balance and entries', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TreasuryInternals;
    cmp.lookupMemberId = 'm-1';
    cmp.lookupMember();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.getBalance).toHaveBeenCalledWith('m-1');
    expect(api.listEntries).toHaveBeenCalledWith('m-1');
    expect(html(fixture)).toContain('12,50');
  });

  it('books a topup with a generated idempotency key', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as TreasuryInternals;
    cmp.topupForm = { memberId: 'm-1', amount: '5.00', note: '' };
    cmp.topup();
    expect(api.topup).toHaveBeenCalledTimes(1);
    const [payload, key] = api.topup.mock.calls[0];
    expect(payload.memberId).toBe('m-1');
    expect(payload.amount).toBe('5.00');
    expect(typeof key).toBe('string');
    expect((key as string).length).toBeGreaterThan(0);
  });

  it('shows a neutral error state when events cannot be loaded', async () => {
    api.listEvents.mockReturnValue(
      throwError(() => new ApiError(403, 'permission_denied', '')),
    );
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
