/**
 * Erzeugt einen eindeutigen Idempotency-Key für finanzielle Schreibvorgänge
 * (TICKET-026). Jeder Kaufvorgang bildet einen eigenen Schlüssel; Wiederholungen
 * mit identischen Kerndaten liefern serverseitig dieselbe Buchung, abweichende
 * Daten führen zu `409 idempotency_conflict` (siehe `docs/fachkonzept.md`).
 *
 * Wird ausschließlich browserseitig bei einer Nutzeraktion aufgerufen; ein
 * schlanker Fallback deckt Umgebungen ohne `crypto.randomUUID` ab.
 */
export function newIdempotencyKey(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
