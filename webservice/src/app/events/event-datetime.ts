/**
 * Umrechnung zwischen `<input type="datetime-local">` (lokale Zeit ohne Zone,
 * `YYYY-MM-DDTHH:mm`) und den ISO-8601-Zeitstempeln der API.
 */

/** Lokaler Eingabewert → ISO-Zeitstempel (UTC); leer oder ungültig → `null`. */
export function localInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO-Zeitstempel → lokaler Eingabewert; leer oder ungültig → `''`. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Auswahl „Erinnerung … Stunden vorher“; `null` = keine Erinnerung. */
export const REMINDER_HOUR_OPTIONS: readonly (number | null)[] = [null, 2, 24, 48, 168];

/** Übersetzungsschlüssel und Parameter für eine Erinnerungsoption. */
export function reminderLabelKey(hours: number | null | undefined): { key: string; count?: number } {
  if (!hours) return { key: 'events.reminder.none' };
  if (hours === 168) return { key: 'events.reminder.week' };
  if (hours % 24 === 0) return { key: 'events.reminder.days', count: hours / 24 };
  return { key: 'events.reminder.hours', count: hours };
}
