import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { EventSummary, MemberBalance, MemberProfile } from '../api/api.types';
import { DashboardComponent } from './dashboard.component';
import { MemberApiService } from './member-api.service';

const profile = { id: 'm-1', displayName: 'Alice' } as MemberProfile;

const balance: MemberBalance = {
  memberId: 'm-1',
  currency: 'EUR',
  creditBalance: '5.00',
  topupTotal: '5.00',
  payoutTotal: '0.00',
  purchaseTotal: '0.00',
  correctionTotal: '0.00',
  entryCount: 1,
};

const events: EventSummary[] = [
  {
    id: 'e-1',
    title: 'Sommerfest',
    status: 'active',
    startsAt: '2026-07-01T18:00:00Z',
    endsAt: null,
    ownerId: 'o-1',
    ownerDisplayName: 'Bob',
  },
];

describe('DashboardComponent', () => {
  let api: {
    loadProfile: ReturnType<typeof vi.fn>;
    getBalance: ReturnType<typeof vi.fn>;
    listEvents: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]), { provide: MemberApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(DashboardComponent);
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
      listEvents: vi.fn(() => of(events)),
    };
  });

  it('greets the member and shows the next event and balance via ui primitives', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;

    expect(html(fixture)).toContain('Servus');
    expect(html(fixture)).toContain('Alice');
    expect(html(fixture)).toContain('5,00');
    expect(html(fixture)).toContain('Sommerfest');

    // Reuse of shared ui/ primitives instead of bespoke member markup.
    expect(root.querySelector('vereint-hero-greeting')).toBeTruthy();
    expect(root.querySelector('vereint-event-card')).toBeTruthy();
    expect(root.querySelector('vereint-balance-card')).toBeTruthy();
    expect(root.querySelectorAll('vereint-stat-card').length).toBe(2);
  });

  it('shows an empty next-event hint when there are no events', async () => {
    api.listEvents.mockReturnValue(of([]));
    const fixture = await create();
    expect(html(fixture)).toContain('Aktuell keine Events');
    expect((fixture.nativeElement as HTMLElement).querySelector('vereint-event-card')).toBeNull();
  });

  it('reveals a treasurer hint when requesting a top-up', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;

    const topup = root.querySelector<HTMLButtonElement>('vereint-balance-card button')!;
    topup.click();
    fixture.detectChanges();

    expect(html(fixture)).toContain('über den Kassenwart');
  });

  it('shows a retry state on error', async () => {
    api.getBalance.mockReturnValue(throwError(() => new ApiError(503, 'service_unavailable', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
