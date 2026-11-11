import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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
    // Wie vom Fachservice: Kaufbeträge sind positiv, die Buchungsart bestimmt das Vorzeichen.
    amount: '7.50',
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

  it('signs amounts by their effect on the balance', async () => {
    const fixture = await create();
    const amounts = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.member-amount'));
    const purchase = amounts.find((node) => node.textContent?.includes('7,50'));
    const topup = amounts.find((node) => node.textContent?.includes('20,00'));
    expect(purchase?.textContent).toContain('−7,50');
    expect(purchase?.classList.contains('member-amount-positive')).toBe(false);
    expect(topup?.textContent).toContain('+20,00');
    expect(topup?.classList.contains('member-amount-positive')).toBe(true);
  });

  it('lists the newest booking first', async () => {
    const fixture = await create();
    const titles = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.member-list-title'),
    ).map((node) => node.textContent?.trim());
    expect(titles).toEqual(['Kauf', 'Aufladung']);
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

  it('hides the top-up action for regular members', async () => {
    api.loadProfile.mockReturnValue(of({ ...profile, roles: ['member'] }));
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('vereint-balance-card button')).toBeNull();
    expect(html(fixture)).not.toContain('Kassenwart direkt');
  });

  it('links board members from the top-up action to the treasury', async () => {
    api.loadProfile.mockReturnValue(of({ ...profile, roles: ['member', 'board'] }));
    const fixture = await create();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'vereint-balance-card button',
    );
    expect(button).toBeTruthy();
    button!.click();
    expect(navigate).toHaveBeenCalledWith('/board/treasury');
  });

  it('names the purchased item and the item of a reversed purchase', async () => {
    const purchase: LedgerEntry = {
      ...entries[1],
      snapshot: {
        itemType: 'DRINK',
        drinkName: 'Helles',
        imageReference: null,
        barcode: null,
        unitPrice: '7.50',
        currency: 'EUR',
        catalogVersion: 1,
      },
    };
    const reversal: LedgerEntry = {
      ...entries[1],
      id: 'l-3',
      entryType: 'correction',
      amount: '7.50',
      reversesEntryId: 'l-2',
      createdAt: '2026-01-02T10:05:00Z',
    };
    api.listEntries.mockReturnValue(of([entries[0], purchase, reversal]));
    const fixture = await create();
    const titles = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.member-list-title'),
    ).map((el) => el.textContent?.trim());
    expect(titles).toEqual(['Storno: Helles', 'Helles', 'Aufladung']);
  });

  it('names who drank on my round', async () => {
    const roundEntry: LedgerEntry = {
      ...entries[1],
      source: 'round',
      roundId: 'r-1',
      beneficiaryId: 'm-2',
      beneficiaryDisplayName: 'Felix Braun',
      snapshot: {
        itemType: 'DRINK',
        drinkName: 'Helles',
        imageReference: null,
        barcode: null,
        unitPrice: '3.50',
        currency: 'EUR',
        catalogVersion: 1,
      },
    };
    api.listEntries.mockReturnValue(of([roundEntry]));
    const fixture = await create();
    expect(html(fixture)).toContain('Runde: Felix Braun · Helles');
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
