import type { EventSummary } from '../api/api.types';

/**
 * Vorbei ist ein Event, das abgeschlossen ist oder dessen Ende bzw. Beginn
 * zurückliegt. Laufende Events gelten nie als vorbei.
 */
export function isEventPast(event: EventSummary, now: Date = new Date()): boolean {
  if (event.status === 'active') return false;
  if (event.status === 'completed' || event.status === 'archived') return true;
  // Ohne Ende gilt ein Event bis sechs Stunden nach Beginn als kommend.
  const end = event.endsAt ? Date.parse(event.endsAt) : Date.parse(event.startsAt) + 6 * 3600_000;
  return Number.isFinite(end) && end < now.getTime();
}

/**
 * Fasst die Termine einer Serie zu einem Eintrag zusammen. Er steht an der
 * Stelle des aktuellsten Termins: zuerst ein laufender, sonst der nächste
 * kommende, sonst der zuletzt vergangene. Events ohne Serie bleiben, wie sie
 * sind; die Reihenfolge der Eingabe bleibt erhalten.
 */
export function collapseSeries(events: EventSummary[], now: Date = new Date()): EventSummary[] {
  const chosen = new Map<string, EventSummary>();
  for (const event of events) {
    if (!event.seriesId) continue;
    const current = chosen.get(event.seriesId);
    if (!current || isMoreCurrent(event, current, now)) chosen.set(event.seriesId, event);
  }
  return events.filter((event) => !event.seriesId || chosen.get(event.seriesId) === event);
}

/** Ob `a` als aktuellerer Termin derselben Serie zählt als `b`. */
function isMoreCurrent(a: EventSummary, b: EventSummary, now: Date): boolean {
  const rank = (event: EventSummary) => (event.status === 'active' ? 0 : isEventPast(event, now) ? 2 : 1);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra < rb;
  const diff = Date.parse(a.startsAt) - Date.parse(b.startsAt);
  // Kommende: der früheste zuerst; vergangene: der jüngste zuerst.
  return ra === 2 ? diff > 0 : diff < 0;
}
