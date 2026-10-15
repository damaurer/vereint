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
