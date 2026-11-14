import type { CalendarEntry } from '../api/api.types';

/** Ein Tag im Monatsraster des Kalenders. */
export interface CalendarDay {
  /** Lokales Datum als `YYYY-MM-DD`. */
  key: string;
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
}

/** Lokales Datum als `YYYY-MM-DD` (ohne Zeitzonen-Verschiebung). */
export function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Erster Tag des Monats von `date`, 00:00 Uhr lokal. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/**
 * Sichtbarer Zeitraum eines Monats: von Montag vor dem 1. bis einschließlich
 * Sonntag nach dem Monatsende (immer ganze Wochen).
 */
export function monthRange(month: Date): { from: Date; to: Date } {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7; // Montag = 0
  const from = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const tail = 6 - ((last.getDay() + 6) % 7);
  const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + tail + 1);
  return { from, to };
}

/**
 * Tage des Monatsrasters mit ihren Einträgen. Ein mehrtägiges Event erscheint
 * an jedem Tag, den es berührt.
 */
export function buildMonth(
  month: Date,
  entries: CalendarEntry[],
  today = new Date(),
): CalendarDay[] {
  const { from, to } = monthRange(month);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const start = new Date(entry.startsAt);
    const end = entry.kind === 'event' && entry.endsAt ? new Date(entry.endsAt) : start;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    // Schutz vor sehr langen Zeiträumen: höchstens das sichtbare Raster.
    for (let guard = 0; cursor <= end && guard < 42; guard += 1) {
      const key = dayKey(cursor);
      byDay.set(key, [...(byDay.get(key) ?? []), entry]);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const days: CalendarDay[] = [];
  const todayKey = dayKey(today);
  for (const cursor = new Date(from); cursor < to; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor);
    days.push({
      key,
      date: new Date(cursor),
      inMonth: cursor.getMonth() === month.getMonth(),
      isToday: key === todayKey,
      entries: byDay.get(key) ?? [],
    });
  }
  return days;
}
