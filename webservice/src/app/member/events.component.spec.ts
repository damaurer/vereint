import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { EventSummary } from '../api/api.types';
import { EventsComponent } from './events.component';
import { MemberApiService } from './member-api.service';

const events: EventSummary[] = [
  {
    id: 'e-1',
    title: 'Sommerfest',
    status: 'active',
    startsAt: '2099-07-01T18:00:00Z',
    endsAt: null,
    ownerId: 'o-1',
    ownerDisplayName: 'Bob',
    location: 'Vereinsheim',
    myRsvp: 'invited',
  },
];

describe('EventsComponent', () => {
  let api: { listEvents: ReturnType<typeof vi.fn>; respondToEvent: ReturnType<typeof vi.fn> };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [EventsComponent],
      providers: [provideRouter([]), { provide: MemberApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(EventsComponent);
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
      respondToEvent: vi.fn((id: string, status: string) => of({ id, myRsvp: status })),
    };
  });

  it('lists the events with a status badge', async () => {
    const fixture = await create();
    expect(html(fixture)).toContain('Sommerfest');
    expect(html(fixture)).toContain('Aktiv');
  });

  it('offers a visible create button', async () => {
    const fixture = await create();
    const link = (fixture.nativeElement as HTMLElement).querySelector('.events-create') as HTMLAnchorElement;
    expect(link.textContent).toContain('Event anlegen');
    expect(link.getAttribute('href')).toBe('/events/new');
  });

  it('lets invited members answer via the rsvp endpoint', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect(html(fixture)).toContain('Aktiv');
    (root.querySelector('.events-accept') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.respondToEvent).toHaveBeenCalledWith('e-1', 'accepted');
    expect(html(fixture)).toContain('Du bist dabei');
    expect(root.querySelector('.events-accept')).toBeNull();
  });

  it('shows an open invitation as "Offen" and splits upcoming from past events', async () => {
    api.listEvents.mockReturnValue(
      of([
        { ...events[0], id: 'e-2', title: 'Wanderung', status: 'published' },
        { ...events[0], id: 'e-3', title: 'Altes Fest', status: 'completed', startsAt: '2020-01-01T18:00:00Z' },
      ]),
    );
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect(html(fixture)).toContain('Offen');
    expect(html(fixture)).toContain('Wanderung');
    expect(html(fixture)).not.toContain('Altes Fest');
    const past = Array.from(root.querySelectorAll<HTMLButtonElement>('.events-tab')).find((tab) =>
      tab.textContent?.includes('Vergangen'),
    )!;
    past.click();
    fixture.detectChanges();
    expect(html(fixture)).toContain('Altes Fest');
    expect(html(fixture)).not.toContain('Wanderung');
  });

  it('shows no answer buttons for events without invitation', async () => {
    api.listEvents.mockReturnValue(of([{ ...events[0], myRsvp: null }]));
    const fixture = await create();
    expect((fixture.nativeElement as HTMLElement).querySelector('.events-rsvp')).toBeNull();
  });

  it('shows an empty state when there are no events', async () => {
    api.listEvents.mockReturnValue(of([]));
    const fixture = await create();
    expect(html(fixture)).toContain('Keine Events');
  });

  it('shows a retry state on error', async () => {
    api.listEvents.mockReturnValue(throwError(() => new ApiError(0, 'network_error', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
