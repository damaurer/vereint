import { isoToLocalInput, localInputToIso, reminderLabelKey } from './event-datetime';

describe('event-datetime', () => {
  it('converts a local input value to ISO and back', () => {
    const iso = localInputToIso('2026-07-01T18:30');
    expect(iso).toBe(new Date('2026-07-01T18:30').toISOString());
    expect(isoToLocalInput(iso)).toBe('2026-07-01T18:30');
  });

  it('returns empty values for missing or invalid input', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('kein Datum')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('kaputt')).toBe('');
  });

  it('maps reminder hours to label keys', () => {
    expect(reminderLabelKey(null)).toEqual({ key: 'events.reminder.none' });
    expect(reminderLabelKey(0)).toEqual({ key: 'events.reminder.none' });
    expect(reminderLabelKey(2)).toEqual({ key: 'events.reminder.hours', count: 2 });
    expect(reminderLabelKey(48)).toEqual({ key: 'events.reminder.days', count: 2 });
    expect(reminderLabelKey(168)).toEqual({ key: 'events.reminder.week' });
  });
});
