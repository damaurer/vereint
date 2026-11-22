import type { EventSeries } from '../api/api.types';
import {
  applyPreset,
  describeRecurrence,
  emptyRecurrence,
  fromSeries,
  isLastOfMonth,
  nthOfMonth,
  presetLabel,
  sameRecurrence,
  seriesPayload,
  toRecurrencePayload,
} from './recurrence';

describe('recurrence', () => {
  // Samstag, 28. November 2026: der letzte Samstag im Monat.
  const lastSaturday = new Date(2026, 10, 28);

  it('knows the position of a weekday in its month', () => {
    expect(nthOfMonth(lastSaturday)).toBe(4);
    expect(isLastOfMonth(lastSaturday)).toBe(true);
    expect(isLastOfMonth(new Date(2026, 10, 21))).toBe(false);
  });

  it('turns presets into payloads', () => {
    const weekly = toRecurrencePayload(applyPreset(emptyRecurrence(), 'weekly', lastSaturday));
    expect(weekly).toEqual(
      expect.objectContaining({
        frequency: 'WEEKLY',
        interval: 1,
        weekdays: ['SA'],
        inviteLeadDays: 7,
      }),
    );

    const last = toRecurrencePayload(applyPreset(emptyRecurrence(), 'monthlyLast', lastSaturday));
    expect(last).toEqual(
      expect.objectContaining({ frequency: 'MONTHLY', weekdays: ['SA'], positions: [-1] }),
    );

    const yearly = toRecurrencePayload(applyPreset(emptyRecurrence(), 'yearly', lastSaturday));
    expect(yearly).toEqual(
      expect.objectContaining({ frequency: 'YEARLY', months: [11], monthDays: [28] }),
    );

    expect(toRecurrencePayload(applyPreset(emptyRecurrence(), 'none', lastSaturday))).toBeNull();
    const irregular = applyPreset(emptyRecurrence(), 'irregular', lastSaturday);
    irregular.extraDates = ['2026-12-31', '2026-12-05'];
    expect(toRecurrencePayload(irregular)).toEqual(
      expect.objectContaining({ frequency: 'NONE', extraDates: ['2026-12-05', '2026-12-31'] }),
    );
  });

  it('validates the custom editor and adds the end', () => {
    const form = applyPreset(emptyRecurrence(), 'custom', lastSaturday);
    form.frequency = 'WEEKLY';
    form.weekdays = [];
    expect(typeof toRecurrencePayload(form)).toBe('string');
    form.weekdays = ['TH', 'TU'];
    form.interval = 2;
    form.endMode = 'count';
    form.count = 12;
    expect(toRecurrencePayload(form)).toEqual(
      expect.objectContaining({
        frequency: 'WEEKLY',
        interval: 2,
        weekdays: ['TU', 'TH'],
        count: 12,
      }),
    );
    form.endMode = 'until';
    form.until = '';
    expect(typeof toRecurrencePayload(form)).toBe('string');
  });

  it('describes rules in plain German', () => {
    expect(
      describeRecurrence({ frequency: 'MONTHLY', weekdays: ['SA'], positions: [-1] }, lastSaturday),
    ).toBe('Monatlich am letzten Samstag');
    expect(
      describeRecurrence(
        { frequency: 'WEEKLY', interval: 2, weekdays: ['TU', 'TH'], count: 10 },
        lastSaturday,
      ),
    ).toBe('Alle 2 Wochen am Dienstag und Donnerstag, 10 Termine');
    expect(
      describeRecurrence(
        { frequency: 'WEEKLY', weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'] },
        lastSaturday,
      ),
    ).toBe('Werktags (Mo–Fr)');
    expect(describeRecurrence({ frequency: 'MONTHLY', monthDays: [-1] }, lastSaturday)).toBe(
      'Monatlich am letzten Tag',
    );
    expect(
      describeRecurrence({ frequency: 'YEARLY', months: [11], monthDays: [28] }, lastSaturday),
    ).toBe('Jährlich am 28. November');
    expect(
      describeRecurrence({ frequency: 'NONE', extraDates: ['2026-12-05'] }, lastSaturday),
    ).toBe('Eigene Termine (2 Termine)');
    expect(presetLabel('monthlyNth', lastSaturday)).toBe('Monatlich am 4. Samstag');
  });

  it('round-trips a stored series and detects rule changes', () => {
    const series: EventSeries = {
      id: 's1',
      rrule: 'FREQ=MONTHLY;BYDAY=-1SA',
      frequency: 'MONTHLY',
      interval: 1,
      weekdays: ['SA'],
      positions: [-1],
      monthDays: [],
      months: [],
      count: null,
      until: null,
      extraDates: [],
      excludedDates: ['2026-12-26'],
      inviteLeadDays: 7,
      startsOn: '2026-11-28',
      timeZone: 'Europe/Berlin',
      occurrenceDate: '2026-11-28',
      detached: false,
      inviteAllMembers: true,
      upcoming: [],
    };
    const form = fromSeries(series);
    expect(form.monthlyMode).toBe('weekday');
    const stored = seriesPayload(series);
    expect(sameRecurrence(toRecurrencePayload(form) as never, stored)).toBe(true);
    form.positions = [1];
    expect(sameRecurrence(toRecurrencePayload(form) as never, stored)).toBe(false);
  });
});
