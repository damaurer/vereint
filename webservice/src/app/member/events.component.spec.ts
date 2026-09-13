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
    startsAt: '2026-07-01T18:00:00Z',
    endsAt: null,
    ownerId: 'o-1',
    ownerDisplayName: 'Bob',
  },
];

describe('EventsComponent', () => {
  let api: { listEvents: ReturnType<typeof vi.fn> };

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
    api = { listEvents: vi.fn(() => of(events)) };
  });

  it('lists the events with a status badge', async () => {
    const fixture = await create();
    expect(html(fixture)).toContain('Sommerfest');
    expect(html(fixture)).toContain('Aktiv');
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
