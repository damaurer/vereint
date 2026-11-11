import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { MemberProfile, Round, RoundOptions } from '../api/api.types';
import { MemberApiService } from '../member/member-api.service';
import { RoundApiService } from './round-api.service';
import { RoundGiveComponent } from './round-give.component';

const options: RoundOptions = {
  eventId: 'e-1',
  eventTitle: 'Stammtisch Oktober',
  creditBalance: '33.00',
  currency: 'EUR',
  drinks: [
    { eventDrinkId: 'd-1', drinkName: 'Helles', price: '3.50', currency: 'EUR' },
    { eventDrinkId: 'd-2', drinkName: 'Wasser', price: '1.50', currency: 'EUR' },
  ],
  members: [
    { memberId: 'm-2', displayName: 'Felix', accepted: true, present: false },
    { memberId: 'm-3', displayName: 'Mia', accepted: false, present: true },
  ],
};

const round = (over: Partial<Round> = {}): Round => ({
  id: 'r-1',
  eventId: 'e-1',
  sponsorId: 'm-1',
  sponsorName: 'Thomas',
  kind: 'round',
  eventDrinkId: 'd-1',
  drinkName: 'Helles',
  maxAmount: '7.00',
  usedAmount: '0.00',
  currency: 'EUR',
  validUntil: null,
  endedAt: null,
  status: 'running',
  createdAt: '2026-06-01T18:00:00Z',
  invitees: [],
  ...over,
});

interface Internals {
  kind: { set(v: 'round' | 'evening'): void };
  drinkId: { set(v: string): void };
  maxAmount: { set(v: number | null): void };
  toggle(id: string): void;
  canSubmit(): boolean;
  maxTotal(view: unknown): number;
  submit(view: unknown): void;
  endRound(r: Round): void;
  load: { data: () => { rounds: Round[] } | null };
  error: () => string | null;
}

describe('RoundGiveComponent', () => {
  let api: {
    options: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [RoundGiveComponent],
      providers: [
        provideRouter([]),
        { provide: RoundApiService, useValue: api },
        { provide: MemberApiService, useValue: { loadProfile: () => of({ id: 'm-1' } as MemberProfile) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ eventId: 'e-1' }) } } },
      ],
    });
    const fixture = TestBed.createComponent(RoundGiveComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const cmp = fixture.componentInstance as unknown as Internals;
    return { fixture, cmp, text: () => (fixture.nativeElement as HTMLElement).textContent ?? '' };
  };

  beforeEach(() => {
    api = {
      options: vi.fn(() => of(options)),
      list: vi.fn(() => of([round(), round({ id: 'r-2', sponsorId: 'm-9', sponsorName: 'Sabine' })])),
      create: vi.fn(() => of(round({ id: 'r-3' }))),
      end: vi.fn(() => of(round({ status: 'ended' }))),
    };
  });

  it('shows the balance, the people with their state and only my own rounds', async () => {
    const { text } = await create();
    expect(api.options).toHaveBeenCalledWith('e-1');
    expect(text()).toContain('Stammtisch Oktober');
    expect(text()).toContain('33,00');
    expect(text()).toContain('Felix');
    expect(text()).toContain('zugesagt');
    expect(text()).toContain('vor Ort');
    expect(text()).toContain('Deine Runden');
    expect(text()).toContain('Thomas');
    expect(text()).not.toContain('Sabine');
  });

  it('computes the maximum from price and people and starts a round', async () => {
    const { cmp, fixture } = await create();
    const view = cmp.load.data();
    expect(cmp.canSubmit()).toBe(false);
    cmp.drinkId.set('d-1');
    cmp.toggle('m-2');
    cmp.toggle('m-3');
    expect(cmp.maxTotal(view)).toBe(7);
    // Alle Getränke: das teuerste zählt.
    cmp.drinkId.set('');
    expect(cmp.maxTotal(view)).toBe(7);
    cmp.drinkId.set('d-2');
    expect(cmp.maxTotal(view)).toBe(3);
    cmp.submit(view);
    expect(api.create).toHaveBeenCalledWith('e-1', {
      kind: 'round',
      eventDrinkId: 'd-2',
      validity: '30m',
      memberIds: ['m-2', 'm-3'],
      maxAmount: null,
    });
    fixture.detectChanges();
    expect(cmp.load.data()?.rounds.map((r) => r.id)).toContain('r-3');
  });

  it('needs a maximum for a whole evening', async () => {
    const { cmp } = await create();
    const view = cmp.load.data();
    cmp.kind.set('evening');
    cmp.toggle('m-2');
    expect(cmp.canSubmit()).toBe(false);
    cmp.maxAmount.set(30);
    expect(cmp.canSubmit()).toBe(true);
    expect(cmp.maxTotal(view)).toBe(30);
    cmp.submit(view);
    expect(api.create.mock.calls[0][1]).toMatchObject({ kind: 'evening', eventDrinkId: null, maxAmount: 30 });
  });

  it('shows the server error and ends my round', async () => {
    api.create.mockReturnValue(throwError(() => new ApiError(409, 'event_not_active', 'Runden gibt es nur, solange das Event läuft')));
    const { cmp } = await create();
    cmp.toggle('m-2');
    cmp.submit(cmp.load.data());
    expect(cmp.error()).toBeTruthy();

    cmp.endRound(round());
    expect(api.end).toHaveBeenCalledWith('e-1', 'r-1');
    expect(cmp.load.data()?.rounds.find((r) => r.id === 'r-1')?.status).toBe('ended');
  });
});
