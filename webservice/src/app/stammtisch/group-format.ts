import { activeLocale } from '../i18n/i18n.service';

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
