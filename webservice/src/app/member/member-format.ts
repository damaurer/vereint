import type { EventStatus } from '../api/api.types';
import { activeLocale, translate } from '../i18n/i18n.service';

/**
 * Anzeigehelfer der Mitglieder-Ansichten (TICKET-024). Die Formatierung findet
 * ausschließlich clientseitig statt; die Ansichten werden im Browser gerendert.
 */

/** Formatiert einen dezimalen Geldbetrag (Zeichenkette) mit Währungscode. */
export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(activeLocale(), { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Formatiert einen ISO-Zeitstempel als Datum und Uhrzeit. */
export function formatDateTime(iso: string | null | undefined): string {
  // Ohne Zeitstempel kein Datum; `new Date(null)` wäre sonst der 01.01.1970.
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * Kurzes Datum wie im Design-Entwurf: „Fr, 17. Okt“ (Jahr nur, wenn es nicht
 * das aktuelle ist). Abkürzungspunkte entfallen.
 */
export function formatShortDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = date.getFullYear() === now.getFullYear();
  const parts = new Intl.DateTimeFormat(activeLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value.replace(/\.$/, '') ?? '';
  const day = activeLocale().startsWith('de') ? `${value('day')}.` : value('day');
  const head = `${value('weekday')}, ${day} ${value('month')}`;
  return sameYear ? head : `${head} ${value('year')}`;
}

/** Uhrzeit eines ISO-Zeitstempels („18:30“). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(activeLocale(), { timeStyle: 'short' }).format(date);
}

/** Datum und Uhrzeit wie im Design-Entwurf: „Fr, 17. Okt · 18:30“. */
export function formatEventWhen(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = formatShortDate(iso, now);
  const time = formatTime(iso);
  return date && time ? `${date} · ${time}` : date;
}

/** Geldbetrag mit Vorzeichen („+20,00 €“, „−7,50 €“) für Kontoauszüge. */
export function formatSignedMoney(amount: string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(activeLocale(), { style: 'currency', currency, signDisplay: 'exceptZero' })
      .format(value)
      .replace('-', '−');
  } catch {
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)} ${currency}`;
  }
}

/** Kurzes Datum mit Uhrzeit ohne Wochentag: „17. Okt, 10:24“. */
export function formatShortDateTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = new Intl.DateTimeFormat(activeLocale(), {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
    .format(date)
    .replace(/\.(?=\s|$)/g, (match, offset: number, text: string) => (/\d/.test(text[offset - 1] ?? '') ? match : ''));
  return `${day}, ${formatTime(iso)}`;
}

/** Zeit in Chatlisten: „10:24“ heute, „Gestern“, sonst „17. Okt“. */
export function formatChatTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return formatTime(iso);
  if (date.getTime() >= startOfToday - 86_400_000) return translate('common.yesterday');
  return formatShortDateTime(iso, now).split(',')[0];
}

/** „Heute, 10:24“, „Gestern, 18:02“, sonst „17. Okt, 10:24“. */
export function formatDayTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return `${translate('common.today')}, ${formatTime(iso)}`;
  if (date.getTime() >= startOfToday - 86_400_000) return `${translate('common.yesterday')}, ${formatTime(iso)}`;
  return formatShortDateTime(iso, now);
}

/** Klartext der Ledger-Buchungsarten in der aktiven Sprache. */
export function entryTypeLabel(entryType: string): string {
  switch (entryType) {
    case 'purchase':
      return translate('member.entryType.purchase');
    case 'topup':
      return translate('member.entryType.topup');
    case 'payout':
      return translate('member.entryType.payout');
    case 'correction':
      return translate('member.entryType.correction');
    default:
      return entryType;
  }
}

/** Klartext der Eventstatuswerte in der aktiven Sprache. */
export function eventStatusLabel(status: EventStatus): string {
  switch (status) {
    case 'draft':
      return translate('member.eventStatus.draft');
    case 'published':
      return translate('member.eventStatus.published');
    case 'active':
      return translate('member.eventStatus.active');
    case 'cancelled':
      return translate('member.eventStatus.cancelled');
    case 'completed':
      return translate('member.eventStatus.completed');
    case 'archived':
      return translate('member.eventStatus.archived');
    default:
      return status;
  }
}
