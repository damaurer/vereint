import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { EventDetail, EventParticipant } from '../api/api.types';
import { EventDetailComponent } from './event-detail.component';
import { MemberApiService } from './member-api.service';

const event: EventDetail = {
  id: 'e-1',
  title: 'Sommerfest',
  description: 'Grillen im Garten',
  location: 'Vereinsheim',
  startsAt: '2026-07-01T18:00:00Z',
  endsAt: '2026-07-01T23:00:00Z',
  status: 'active',
  ownerId: 'o-1',
  ownerDisplayName: 'Bob',
  participantCount: 1,
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-02T10:00:00Z',
};

const participants: EventParticipant[] = [
  { userId: 'u-1', displayName: 'Alice', role: 'participant', joinedAt: '2026-06-01T10:00:00Z' },
];

describe('EventDetailComponent', () => {
  let api: {
    getEvent: ReturnType<typeof vi.fn>;
    listParticipants: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [EventDetailComponent],
      providers: [
        provideRouter([]),
        { provide: MemberApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: (key: string) => (key === 'eventId' ? 'e-1' : null) } } },
        },
      ],
    });
    const fixture = TestBed.createComponent(EventDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      getEvent: vi.fn(() => of(event)),
      listParticipants: vi.fn(() => of(participants)),
    };
  });

  it('renders event details and participants', async () => {
    const fixture = await create();
    expect(api.getEvent).toHaveBeenCalledWith('e-1');
    expect(html(fixture)).toContain('Sommerfest');
    expect(html(fixture)).toContain('Vereinsheim');
    expect(html(fixture)).toContain('Alice');
  });

  it('offers a route button and RSVP answer options', async () => {
    const fixture = await create();
    expect(html(fixture)).toContain('Route öffnen');
    expect(html(fixture)).toContain('Zusagen');
    expect(html(fixture)).toContain('Vielleicht');
    expect(html(fixture)).toContain('Absagen');
  });

  it('stores the selected RSVP answer as client-side state', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as {
      rsvp: () => string | null;
      setRsvp(answer: 'yes' | 'maybe' | 'no'): void;
    };
    expect(cmp.rsvp()).toBeNull();
    cmp.setRsvp('yes');
    expect(cmp.rsvp()).toBe('yes');
    cmp.setRsvp('no');
    expect(cmp.rsvp()).toBe('no');
  });

  it('shows a neutral error when access is denied', async () => {
    api.getEvent.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
    expect(html(fixture)).toContain('Rechte');
  });
});
