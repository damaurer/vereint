import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { LedgerEntry, MemberBalance, MemberProfile } from '../api/api.types';
import { MemberApiService } from './member-api.service';
import { WalletComponent } from './wallet.component';

const profile = { id: 'm-1', displayName: 'Alice' } as MemberProfile;

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

const entries: LedgerEntry[] = [
  {
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
  },
  {
    id: 'l-2',
    entryType: 'purchase',
    eventId: 'e-1',
    memberId: 'm-1',
    memberDisplayName: 'Alice',
    drinkId: 'd-1',
    amount: '-7.50',
    currency: 'EUR',
    accountingMode: 'credit',
    source: 'pwaBarcode',
    actorId: 'a-1',
    reversesEntryId: null,
    idempotencyKey: 'k-2',
    createdAt: '2026-01-02T10:00:00Z',
    snapshot: null,
  },
];

describe('WalletComponent', () => {
  let api: {
    loadProfile: ReturnType<typeof vi.fn>;
    getBalance: ReturnType<typeof vi.fn>;
    listEntries: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [WalletComponent],
      providers: [provideRouter([]), { provide: MemberApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      loadProfile: vi.fn(() => of(profile)),
      getBalance: vi.fn(() => of(balance)),
      listEntries: vi.fn(() => of(entries)),
    };
  });

  it('renders the balance and entries after resolving the profile', async () => {
    const fixture = await create();
    expect(api.getBalance).toHaveBeenCalledWith('m-1');
    expect(api.listEntries).toHaveBeenCalledWith('m-1');
    expect(html(fixture)).toContain('12,50');
    expect(html(fixture)).toContain('Aufladung');
    // Balance is rendered through the shared ui/ primitive.
    expect((fixture.nativeElement as HTMLElement).querySelector('vereint-balance-card')).toBeTruthy();
  });

  it('renders negative amounts in the danger colour', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;

    const negative = root.querySelector('.member-amount-negative');
    expect(negative).toBeTruthy();
    expect(negative?.textContent).toContain('7,50');
  });

  it('filters the history to spendings via the chips', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;

    const chips = root.querySelectorAll<HTMLButtonElement>('.wallet-filter button');
    const spend = Array.from(chips).find((chip) => chip.textContent?.includes('Ausgaben'))!;
    spend.click();
    fixture.detectChanges();

    const titles = Array.from(root.querySelectorAll('.member-list-title')).map((node) =>
      node.textContent?.trim(),
    );
    expect(titles).toContain('Kauf');
    expect(titles).not.toContain('Aufladung');
  });

  it('shows an empty state when there are no entries', async () => {
    api.listEntries.mockReturnValue(of([]));
    const fixture = await create();
    expect(html(fixture)).toContain('Keine Buchungen');
  });

  it('shows a retry state when the profile cannot be loaded', async () => {
    api.loadProfile.mockReturnValue(
      throwError(() => new ApiError(401, 'oidc_session_expired', '')),
    );
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
