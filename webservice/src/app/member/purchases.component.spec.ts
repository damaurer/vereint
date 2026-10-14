import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { LedgerEntry, MemberProfile } from '../api/api.types';
import { MemberApiService } from './member-api.service';
import { PurchasesComponent } from './purchases.component';

const profile = { id: 'm-1', displayName: 'Alice' } as MemberProfile;

function entry(id: string, withSnapshot: boolean): LedgerEntry {
  return {
    id,
    entryType: withSnapshot ? 'purchase' : 'topup',
    eventId: 'e-1',
    memberId: 'm-1',
    memberDisplayName: 'Alice',
    drinkId: withSnapshot ? 'd-1' : null,
    amount: '-2.50',
    currency: 'EUR',
    accountingMode: 'credit',
    source: withSnapshot ? 'pwaBarcode' : null,
    actorId: 'a-1',
    reversesEntryId: null,
    idempotencyKey: `k-${id}`,
    createdAt: '2026-01-01T10:00:00Z',
    snapshot: withSnapshot
      ? {
          drinkName: 'Cola',
          imageReference: null,
          barcode: '4001',
          unitPrice: '2.50',
          currency: 'EUR',
          catalogVersion: 3,
        }
      : null,
  };
}

describe('PurchasesComponent', () => {
  let api: {
    loadProfile: ReturnType<typeof vi.fn>;
    listEntries: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [PurchasesComponent],
      providers: [provideRouter([]), { provide: MemberApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(PurchasesComponent);
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
      listEntries: vi.fn(() => of([entry('p-1', true), entry('t-1', false)])),
    };
  });

  it('shows only entries with a purchase snapshot', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect(html(fixture)).toContain('Cola');
    expect(html(fixture)).toContain('Barcode 4001');
    // Catalog version is surfaced via the shared ui/ status-badge primitive.
    expect(root.querySelector('vereint-status-badge')).toBeTruthy();
    expect(html(fixture)).toContain('Katalog v3');
  });

  it('names food purchases and hides a missing catalog version', async () => {
    const food = entry('f-1', true);
    food.snapshot = {
      itemType: 'FOOD',
      drinkName: null,
      foodName: 'Käsespätzle',
      imageReference: null,
      barcode: null,
      unitPrice: '7.50',
      currency: 'EUR',
      catalogVersion: null,
    };
    api.listEntries.mockReturnValue(of([food]));
    const fixture = await create();
    expect(html(fixture)).toContain('Käsespätzle');
    expect(html(fixture)).not.toContain('Katalog v');
  });

  it('shows an empty state when there are no purchases', async () => {
    api.listEntries.mockReturnValue(of([entry('t-1', false)]));
    const fixture = await create();
    expect(html(fixture)).toContain('Keine Käufe');
  });

  it('shows a retry state on error', async () => {
    api.listEntries.mockReturnValue(throwError(() => new ApiError(500, 'x', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
