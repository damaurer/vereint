import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEntry } from '../api/api.types';
import { AuthService } from '../auth/auth.service';
import { CalendarComponent } from './calendar.component';
import { PersonalApiService } from './personal-api.service';

function entry(partial: Partial<CalendarEntry>): CalendarEntry {
  return {
    kind: 'event',
    id: 'e-1',
    eventId: 'e-1',
    title: 'Kegelabend',
    startsAt: new Date(2026, 9, 17, 19).toISOString(),
    endsAt: null,
    location: 'Gasthaus',
    status: 'published',
    myRsvp: 'accepted',
    emoji: null,
    topicName: null,
    active: false,
    stammtischId: 'g-1',
    stammtischName: 'Kegelclub',
    ...partial,
  };
}

describe('CalendarComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let auth: Record<string, ReturnType<typeof vi.fn>>;

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        provideRouter([]),
        { provide: PersonalApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    const fixture = TestBed.createComponent(CalendarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 17, 12));
    api = {
      calendar: vi.fn(() =>
        of({
          from: '',
          to: '',
          entries: [
            entry({}),
            entry({
              kind: 'moment',
              id: 'm-1',
              eventId: 'e-9',
              title: 'Anstoßen',
              emoji: '🍻',
              location: 'Sommerfest',
              startsAt: new Date(2026, 9, 3, 20).toISOString(),
              stammtischId: 'g-2',
              stammtischName: 'Laufgruppe',
            }),
          ],
        }),
      ),
    };
    auth = {
      getSession: vi.fn(async () => ({
        uid: 'u',
        email: null,
        provider: 'keycloak',
        stammtisch: { id: 'g-1', name: 'Kegelclub' },
      })),
      selectStammtisch: vi.fn(async () => true),
    };
  });

  afterEach(() => vi.useRealTimers());

  it('loads the visible month and lists entries of all groups with their group', async () => {
    const fixture = await create();
    const [from, to] = api['calendar'].mock.calls[0] as [Date, Date];
    expect(from.getDate()).toBe(28);
    expect(to.getMonth()).toBe(10);
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Kegelabend');
    expect(text).toContain('Kegelclub');
    expect(text).toContain('Anstoßen');
    expect(text).toContain('Laufgruppe');
    expect(text).toContain('Beim Event „Sommerfest“');
  });

  it('filters by group', async () => {
    const fixture = await create();
    const select = el(fixture).querySelector<HTMLSelectElement>('.cal-filter select')!;
    select.value = 'g-2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const agenda = el(fixture).querySelector('.cal-agenda')!.textContent ?? '';
    expect(agenda).toContain('Anstoßen');
    expect(agenda).not.toContain('Kegelabend');
  });

  it('switches into the group of an entry before opening it', async () => {
    const fixture = await create();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const entries = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.cal-entry'));
    entries.find((b) => b.textContent?.includes('Anstoßen'))!.click();
    await fixture.whenStable();
    expect(auth['selectStammtisch']).toHaveBeenCalledWith('g-2');
    expect(navigate).toHaveBeenCalledWith(['/events', 'e-9', 'moments']);

    auth['selectStammtisch'].mockClear();
    entries.find((b) => b.textContent?.includes('Kegelabend'))!.click();
    await fixture.whenStable();
    expect(auth['selectStammtisch']).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/events', 'e-1']);
  });

  it('moves between months', async () => {
    const fixture = await create();
    el(fixture).querySelector<HTMLButtonElement>('button[aria-label="Nächster Monat"]')!.click();
    fixture.detectChanges();
    expect(api['calendar']).toHaveBeenCalledTimes(2);
    const [from] = api['calendar'].mock.calls[1] as [Date, Date];
    expect(from.getMonth()).toBe(9);
    expect(from.getDate()).toBe(26);
  });
});
