import type { EventStatus } from '../api/api.types';

/**
 * Anzeigehelfer der Mitglieder-Ansichten (TICKET-024). Die Formatierung findet
 * ausschließlich clientseitig statt; die Ansichten werden im Browser gerendert.
 */

/** Formatiert einen dezimalen Geldbetrag (Zeichenkette) mit Währungscode. */
export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Formatiert einen ISO-Zeitstempel als Datum und Uhrzeit. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Deutscher Klartext der Ledger-Buchungsarten. */
export function entryTypeLabel(entryType: string): string {
  switch (entryType) {
    case 'purchase':
      return 'Kauf';
    case 'topup':
      return 'Aufladung';
    case 'payout':
      return 'Auszahlung';
    case 'correction':
      return 'Korrektur';
    default:
      return entryType;
  }
}

/** Deutscher Klartext der Eventstatuswerte. */
export function eventStatusLabel(status: EventStatus): string {
  switch (status) {
    case 'draft':
      return 'Entwurf';
    case 'published':
      return 'Veröffentlicht';
    case 'active':
      return 'Aktiv';
    case 'cancelled':
      return 'Abgesagt';
    case 'completed':
      return 'Abgeschlossen';
    case 'archived':
      return 'Archiviert';
    default:
      return status;
  }
}
