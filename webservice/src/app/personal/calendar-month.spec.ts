import { describe, expect, it } from 'vitest';
import type { CalendarEntry } from '../api/api.types';
import { buildMonth, dayKey, monthRange } from './calendar-month';

function entry(partial: Partial<CalendarEntry>): CalendarEntry {
  return {
    kind: 'event',
    id: 'e-1',
    eventId: 'e-1',
    title: 'Treffen',
    startsAt: new Date(2026, 9, 17, 19).toISOString(),
    endsAt: null,
    location: null,
    status: 'published',
    myRsvp: null,
    emoji: null,
    topicName: null,
    active: false,
    stammtischId: 'g-1',
    stammtischName: 'Kegelclub',
    ...partial,
  };
}

describe('calendar-month', () => {
  it('covers whole weeks from Monday to Sunday', () => {
    // Oktober 2026 beginnt an einem Donnerstag und endet an einem Samstag.
    const { from, to } = monthRange(new Date(2026, 9, 1));
    expect(dayKey(from)).toBe('2026-09-28');
    expect(dayKey(to)).toBe('2026-11-02');
    expect(buildMonth(new Date(2026, 9, 1), []).length).toBe(35);
  });

  it('places entries on their days and multi-day events on each day', () => {
    const days = buildMonth(
      new Date(2026, 9, 1),
      [
        entry({ id: 'a' }),
        entry({
          id: 'b',
          startsAt: new Date(2026, 9, 20, 18).toISOString(),
          endsAt: new Date(2026, 9, 22, 2).toISOString(),
        }),
        entry({
          id: 'm',
          kind: 'moment',
          startsAt: new Date(2026, 9, 20, 20).toISOString(),
          endsAt: new Date(2026, 9, 25).toISOString(),
        }),
      ],
      new Date(2026, 9, 17, 12),
    );
    const byKey = new Map(days.map((day) => [day.key, day]));
    expect(byKey.get('2026-10-17')?.entries.map((e) => e.id)).toEqual(['a']);
    expect(byKey.get('2026-10-17')?.isToday).toBe(true);
    expect(byKey.get('2026-10-20')?.entries.map((e) => e.id)).toEqual(['b', 'm']);
    expect(byKey.get('2026-10-22')?.entries.map((e) => e.id)).toEqual(['b']);
    // Moments stehen nur an ihrem Starttag.
    expect(byKey.get('2026-10-21')?.entries.map((e) => e.id)).toEqual(['b']);
    expect(byKey.get('2026-09-28')?.inMonth).toBe(false);
  });
});
