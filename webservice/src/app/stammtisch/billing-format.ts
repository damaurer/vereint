import { activeLocale, translate } from '../i18n/i18n.service';
import { formatMoney } from '../member/member-format';
import type { BillingPlan, BillingStatus } from './stammtisch-api.service';

/** Anzeigehelfer für Tarif und Abrechnung (Einstellungen und Plattform). */

/** Name des Tarifs in der aktiven Sprache. */
export function planName(plan: BillingPlan | string): string {
  const key = `stammtisch.billing.plans.${plan}`;
  const label = translate(key);
  return label === key ? plan : label;
}

/** Klartext des Zahlungsstatus; `none` (nie gebucht) bleibt leer. */
export function billingStatusLabel(status: BillingStatus | string): string {
  if (status === 'none') return '';
  const key = `stammtisch.billing.status.${status}`;
  const label = translate(key);
  return label === key ? status : label;
}

/** Betrag in Cent als Euro, z. B. `4,00 €` (de-DE). */
export function formatCents(cents: number): string {
  return formatMoney((cents / 100).toFixed(2), 'EUR');
}

/** Speichergröße mit Einheit (1024er-Schritte), z. B. `1,5 GB` oder `250 MB`. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const number = new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: digits }).format(value);
  return `${number} ${units[unit]}`;
}

/** Datum ohne Uhrzeit, z. B. `16. Oktober 2026`. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'long' }).format(date);
}

/** Füllstand einer Grenze in Prozent (0–100); ohne Grenze 0. */
export function usagePercent(used: number, limit: number | null): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
