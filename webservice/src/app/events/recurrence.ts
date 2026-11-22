/**
 * Wiederkehrende Events im Formular: Vorlagen („wöchentlich“, „letzter Samstag
 * im Monat“ …), das Formularmodell, die Umrechnung in die API-Nutzlast und eine
 * Klartext-Beschreibung der Regel. Die Termine selbst berechnet der
 * Fachservice (Vorschau über `POST /events/recurrence-preview`).
 */
import type {
  EventSeries,
  RecurrenceFrequency,
  RecurrencePayload,
  WeekdayCode,
} from '../api/api.types';
import { activeLocale, translate } from '../i18n/i18n.service';

export const WEEKDAYS: readonly WeekdayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const POSITIONS: readonly number[] = [1, 2, 3, 4, 5, -1];
export const MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** Einladung so viele Tage vor jedem Termin; `null` = sofort. */
export const LEAD_DAY_OPTIONS: readonly (number | null)[] = [1, 2, 3, 7, 14, 30, null];

export type RecurrencePreset =
  | 'none'
  | 'daily'
  | 'workdays'
  | 'weekly'
  | 'biweekly'
  | 'monthlyNth'
  | 'monthlyLast'
  | 'monthlyDay'
  | 'monthlyLastDay'
  | 'yearly'
  | 'irregular'
  | 'custom';

export const PRESETS: readonly RecurrencePreset[] = [
  'none',
  'daily',
  'workdays',
  'weekly',
  'biweekly',
  'monthlyNth',
  'monthlyLast',
  'monthlyDay',
  'monthlyLastDay',
  'yearly',
  'irregular',
  'custom',
];

export type MonthlyMode = 'day' | 'weekday';
export type EndMode = 'never' | 'count' | 'until';

/** Formularzustand der Wiederholung. */
export interface RecurrenceForm {
  preset: RecurrencePreset;
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: WeekdayCode[];
  /** Monatlich/jährlich: an einem Tag des Monats oder an Wochentagen. */
  monthlyMode: MonthlyMode;
  positions: number[];
  /** Tag im Monat (1 … 31, -1 = letzter Tag). */
  monthDay: number;
  months: number[];
  endMode: EndMode;
  count: number;
  /** `YYYY-MM-DD` */
  until: string;
  extraDates: string[];
  excludedDates: string[];
  inviteLeadDays: number | null;
}

/** Datumsteile aus `YYYY-MM-DD` bzw. `YYYY-MM-DDTHH:mm` (lokal, ohne Zone). */
export function localDateOf(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function weekdayOf(date: Date): WeekdayCode {
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

/** Die wievielte dieses Wochentags im Monat (1 … 5). */
export function nthOfMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

/** Ist es der letzte dieses Wochentags im Monat? */
export function isLastOfMonth(date: Date): boolean {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
  return next.getMonth() !== date.getMonth();
}

export function emptyRecurrence(): RecurrenceForm {
  return {
    preset: 'none',
    frequency: 'WEEKLY',
    interval: 1,
    weekdays: [],
    monthlyMode: 'day',
    positions: [],
    monthDay: 1,
    months: [],
    endMode: 'never',
    count: 10,
    until: '',
    extraDates: [],
    excludedDates: [],
    inviteLeadDays: 7,
  };
}

/** Füllt das Formular nach einer Vorlage, passend zum Beginn [start]. */
export function applyPreset(
  form: RecurrenceForm,
  preset: RecurrencePreset,
  start: Date | null,
): RecurrenceForm {
  const day = start ?? new Date();
  const weekday = weekdayOf(day);
  const base: RecurrenceForm = {
    ...form,
    preset,
    interval: 1,
    weekdays: [],
    positions: [],
    months: [],
    monthlyMode: 'day',
    monthDay: day.getDate(),
  };
  switch (preset) {
    case 'none':
      return { ...base };
    case 'daily':
      return { ...base, frequency: 'DAILY' };
    case 'workdays':
      return { ...base, frequency: 'WEEKLY', weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'] };
    case 'weekly':
      return { ...base, frequency: 'WEEKLY', weekdays: [weekday] };
    case 'biweekly':
      return { ...base, frequency: 'WEEKLY', interval: 2, weekdays: [weekday] };
    case 'monthlyNth':
      return {
        ...base,
        frequency: 'MONTHLY',
        monthlyMode: 'weekday',
        weekdays: [weekday],
        positions: [nthOfMonth(day)],
      };
    case 'monthlyLast':
      return {
        ...base,
        frequency: 'MONTHLY',
        monthlyMode: 'weekday',
        weekdays: [weekday],
        positions: [-1],
      };
    case 'monthlyDay':
      return { ...base, frequency: 'MONTHLY', monthlyMode: 'day', monthDay: day.getDate() };
    case 'monthlyLastDay':
      return { ...base, frequency: 'MONTHLY', monthlyMode: 'day', monthDay: -1 };
    case 'yearly':
      return {
        ...base,
        frequency: 'YEARLY',
        monthlyMode: 'day',
        months: [day.getMonth() + 1],
        monthDay: day.getDate(),
      };
    case 'irregular':
      return { ...base, frequency: 'NONE' };
    case 'custom':
      return { ...form, preset, weekdays: form.weekdays.length ? form.weekdays : [weekday] };
  }
}

/** Nutzlast für die API; `null` bei „nicht wiederholen“, sonst ein Fehlertext. */
export function toRecurrencePayload(form: RecurrenceForm): RecurrencePayload | null | string {
  if (form.preset === 'none') return null;
  const payload: RecurrencePayload = {
    frequency: form.frequency,
    inviteLeadDays: form.inviteLeadDays,
    extraDates: [...form.extraDates].sort(),
    excludedDates: [...form.excludedDates].sort(),
  };
  if (form.frequency !== 'NONE') {
    const interval = Math.round(Number(form.interval));
    if (!Number.isFinite(interval) || interval < 1 || interval > 99)
      return translate('events.recurrence.errors.interval');
    payload.interval = interval;
    if (form.frequency === 'WEEKLY') {
      if (form.weekdays.length === 0) return translate('events.recurrence.errors.weekdays');
      payload.weekdays = sortWeekdays(form.weekdays);
    }
    if (form.frequency === 'MONTHLY' || form.frequency === 'YEARLY') {
      if (form.monthlyMode === 'weekday') {
        if (form.weekdays.length === 0) return translate('events.recurrence.errors.weekdays');
        if (form.positions.length === 0) return translate('events.recurrence.errors.positions');
        payload.weekdays = sortWeekdays(form.weekdays);
        payload.positions = [...form.positions].sort((a, b) => (a < 0 ? 99 : a) - (b < 0 ? 99 : b));
      } else {
        payload.monthDays = [form.monthDay];
      }
    }
    if (form.frequency === 'YEARLY') {
      if (form.months.length === 0) return translate('events.recurrence.errors.months');
      payload.months = [...form.months].sort((a, b) => a - b);
    }
    if (form.endMode === 'count') {
      const count = Math.round(Number(form.count));
      if (!Number.isFinite(count) || count < 1 || count > 500)
        return translate('events.recurrence.errors.count');
      payload.count = count;
    } else if (form.endMode === 'until') {
      if (!form.until) return translate('events.recurrence.errors.until');
      payload.until = form.until;
    }
  }
  return payload;
}

/** Formular aus einer gespeicherten Serie. */
export function fromSeries(series: EventSeries): RecurrenceForm {
  const form = emptyRecurrence();
  const monthDay = series.monthDays[0];
  const result: RecurrenceForm = {
    ...form,
    preset: 'custom',
    frequency: series.frequency,
    interval: series.interval || 1,
    weekdays: [...series.weekdays],
    positions: [...series.positions],
    monthlyMode: series.positions.length > 0 ? 'weekday' : 'day',
    monthDay: monthDay ?? localDateOf(series.startsOn)?.getDate() ?? 1,
    months: series.months.length
      ? [...series.months]
      : [(localDateOf(series.startsOn)?.getMonth() ?? 0) + 1],
    endMode: series.count ? 'count' : series.until ? 'until' : 'never',
    count: series.count ?? 10,
    until: series.until ?? '',
    extraDates: [...series.extraDates],
    excludedDates: [...series.excludedDates],
    inviteLeadDays: series.inviteLeadDays,
  };
  if (series.frequency === 'NONE') result.preset = 'irregular';
  if (series.frequency === 'WEEKLY' && series.weekdays.length === 0) {
    const start = localDateOf(series.startsOn);
    if (start) result.weekdays = [weekdayOf(start)];
  }
  return result;
}

/** Gleiche Regel? (für „hat sich die Wiederholung geändert“) */
export function sameRecurrence(a: RecurrencePayload | null, b: RecurrencePayload | null): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(p: RecurrencePayload | null): unknown {
  if (!p) return null;
  return {
    frequency: p.frequency,
    interval: p.frequency === 'NONE' ? 1 : (p.interval ?? 1),
    weekdays: p.weekdays ?? [],
    positions: p.positions ?? [],
    monthDays: p.monthDays ?? [],
    months: p.months ?? [],
    count: p.count ?? null,
    until: p.until ?? null,
    extraDates: [...(p.extraDates ?? [])].sort(),
    excludedDates: [...(p.excludedDates ?? [])].sort(),
    inviteLeadDays: p.inviteLeadDays ?? null,
  };
}

/** Payload aus einer Serie (für den Vergleich). */
export function seriesPayload(series: EventSeries): RecurrencePayload | null {
  const payload = toRecurrencePayload(fromSeries(series));
  return typeof payload === 'string' ? null : payload;
}

function sortWeekdays(days: WeekdayCode[]): WeekdayCode[] {
  return WEEKDAYS.filter((d) => days.includes(d));
}

/** Name eines Wochentags in der aktiven Sprache („Dienstag“ bzw. kurz „Di“). */
export function weekdayName(code: WeekdayCode, style: 'long' | 'short' = 'long'): string {
  // 5. Januar 2026 ist ein Montag.
  const date = new Date(2026, 0, 5 + WEEKDAYS.indexOf(code));
  return new Intl.DateTimeFormat(activeLocale(), { weekday: style }).format(date);
}

export function monthName(month: number, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(activeLocale(), { month: style }).format(
    new Date(2026, month - 1, 1),
  );
}

/** „1.“, „2.“ … „letzten“ bzw. „1st“ … „last“. */
export function positionName(position: number): string {
  return translate(
    position < 0 ? 'events.recurrence.position.last' : `events.recurrence.position.${position}`,
  );
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  const and = translate('events.recurrence.and');
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

/** Klartext-Beschreibung, z. B. „Jeden letzten Samstag im Monat, 10 Termine“. */
export function describeRecurrence(p: RecurrencePayload | null, start: Date | null): string {
  if (!p) return translate('events.recurrence.summary.none');
  const day = start ?? new Date();
  const interval = p.interval ?? 1;
  const weekdays = (p.weekdays ?? []).map((d) => weekdayName(d));
  const positions = p.positions ?? [];
  const monthDay = p.monthDays?.[0];
  const dayText =
    monthDay === -1
      ? translate('events.recurrence.summary.lastDay')
      : translate('events.recurrence.summary.dayOfMonth', { day: monthDay ?? day.getDate() });
  const weekdayText = positions.length
    ? translate('events.recurrence.summary.nthWeekday', {
        positions: list(positions.map(positionName)),
        weekdays: list(weekdays),
      })
    : '';
  let text: string;
  switch (p.frequency) {
    case 'NONE':
      text = translate('events.recurrence.summary.irregular', {
        count: 1 + (p.extraDates?.length ?? 0),
      });
      return text;
    case 'DAILY':
      text = translate('events.recurrence.summary.daily', { count: interval });
      break;
    case 'WEEKLY': {
      const workdays =
        interval === 1 &&
        weekdays.length === 5 &&
        !(p.weekdays ?? []).some((d) => d === 'SA' || d === 'SU');
      text = workdays
        ? translate('events.recurrence.summary.workdays')
        : translate('events.recurrence.summary.weekly', {
            count: interval,
            weekdays: list(weekdays),
          });
      break;
    }
    case 'MONTHLY':
      text = translate('events.recurrence.summary.monthly', {
        count: interval,
        when: weekdayText || dayText,
      });
      break;
    case 'YEARLY': {
      const monthList = p.months?.length ? p.months : [day.getMonth() + 1];
      if (!weekdayText && monthDay !== -1) {
        const fmt = new Intl.DateTimeFormat(activeLocale(), { day: 'numeric', month: 'long' });
        const dates = list(
          monthList.map((m) => fmt.format(new Date(2028, m - 1, monthDay ?? day.getDate()))),
        );
        text = translate('events.recurrence.summary.yearlyDate', { count: interval, dates });
      } else {
        const months = list(monthList.map((m) => monthName(m)));
        text = translate('events.recurrence.summary.yearly', {
          count: interval,
          when: weekdayText || dayText,
          months,
        });
      }
      break;
    }
  }
  if (p.count) text += ', ' + translate('events.recurrence.summary.count', { count: p.count });
  else if (p.until) {
    const until = localDateOf(p.until);
    if (until) {
      const formatted = new Intl.DateTimeFormat(activeLocale(), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(until);
      text += ', ' + translate('events.recurrence.summary.until', { date: formatted });
    }
  }
  return text;
}

/** Klartext der Vorlage im Auswahlfeld, passend zum Beginn. */
export function presetLabel(preset: RecurrencePreset, start: Date | null): string {
  const day = start ?? new Date();
  const weekday = weekdayName(weekdayOf(day));
  return translate(`events.recurrence.preset.${preset}`, {
    weekday,
    nth: positionName(nthOfMonth(day)),
    day: day.getDate(),
    date: new Intl.DateTimeFormat(activeLocale(), { day: 'numeric', month: 'long' }).format(day),
  });
}

/** Vorlagen, die zum Beginn passen („am 5. …“ entfällt). */
export function presetsFor(start: Date | null): RecurrencePreset[] {
  const day = start ?? new Date();
  return PRESETS.filter((preset) => {
    if (preset === 'monthlyNth') return nthOfMonth(day) <= 4;
    return true;
  });
}
