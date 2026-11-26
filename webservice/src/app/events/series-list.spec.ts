import type { EventSummary } from '../api/api.types';
import { collapseSeries, isEventPast } from './series-list';

const now = new Date('2026-11-26T12:00:00Z');
const ev = (id: string, startsAt: string, extra: Partial<EventSummary> = {}): EventSummary => ({
  id,
  title: id,
  status: 'published',
  startsAt,
  endsAt: null,
  ownerId: 'o-1',
  ownerDisplayName: 'Bob',
  ...extra,
});

describe('series-list', () => {
  it('treats running events as current and finished ones as past', () => {
    expect(isEventPast(ev('a', '2020-01-01T18:00:00Z', { status: 'active' }), now)).toBe(false);
    expect(isEventPast(ev('b', '2099-01-01T18:00:00Z', { status: 'completed' }), now)).toBe(true);
    expect(isEventPast(ev('c', '2026-11-20T18:00:00Z'), now)).toBe(true);
    expect(isEventPast(ev('d', '2026-12-01T18:00:00Z'), now)).toBe(false);
  });

  it('keeps only the next upcoming date of a series', () => {
    const list = [
      ev('past', '2026-11-19T18:00:00Z', { seriesId: 's' }),
      ev('later', '2026-12-10T18:00:00Z', { seriesId: 's' }),
      ev('single', '2026-12-05T18:00:00Z'),
      ev('next', '2026-12-03T18:00:00Z', { seriesId: 's' }),
    ];
    expect(collapseSeries(list, now).map((e) => e.id)).toEqual(['single', 'next']);
  });

  it('prefers a running date over the next one', () => {
    const list = [
      ev('next', '2026-12-03T18:00:00Z', { seriesId: 's' }),
      ev('running', '2026-11-26T10:00:00Z', { seriesId: 's', status: 'active' }),
    ];
    expect(collapseSeries(list, now).map((e) => e.id)).toEqual(['running']);
  });

  it('falls back to the most recent past date of a finished series', () => {
    const list = [
      ev('old', '2026-10-01T18:00:00Z', { seriesId: 's' }),
      ev('last', '2026-11-19T18:00:00Z', { seriesId: 's' }),
      ev('other', '2026-11-12T18:00:00Z', { seriesId: 't' }),
    ];
    expect(collapseSeries(list, now).map((e) => e.id)).toEqual(['last', 'other']);
  });
});
