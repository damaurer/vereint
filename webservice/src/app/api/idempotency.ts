/**
 * Erzeugt einen eindeutigen Idempotency-Key für finanzielle Schreibvorgänge
 * (TICKET-026). Jeder Kaufvorgang bildet einen eigenen Schlüssel; Wiederholungen
 * mit identischen Kerndaten liefern serverseitig dieselbe Buchung, abweichende
 * Daten führen zu `409 idempotency_conflict` (siehe `docs/api/error-handling-and-idempotency.md`).
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

/**
 * Merkt sich den Idempotency-Key einer fehlgeschlagenen Buchung.
 *
 * Bricht eine Anfrage ab (Zeitüberschreitung, Netzwerk, `503`), kann der
 * Fachservice die Buchung trotzdem gespeichert haben. Wiederholt die Person
 * danach dieselbe Buchung, muss deshalb derselbe Schlüssel mitgehen: Dann
 * liefert der Server die vorhandene Buchung zurück, statt eine zweite
 * anzulegen.
 *
 * Gemerkt wird ein Schlüssel erst nach einem Fehler ([failed]). Zwei Buchungen
 * mit gleichen Daten, die gleichzeitig unterwegs sind (zweimal schnell „+“ am
 * Thekenterminal), bekommen daher verschiedene Schlüssel und zählen beide.
 */
export class RetryableIdempotencyKey {
  private failedAttempt: { readonly fingerprint: string; readonly key: string } | null = null;

  /** Schlüssel für [payload]: der einer fehlgeschlagenen gleichen Buchung, sonst ein neuer. */
  for(payload: unknown): string {
    const fingerprint = RetryableIdempotencyKey.fingerprint(payload);
    if (this.failedAttempt?.fingerprint === fingerprint) return this.failedAttempt.key;
    return newIdempotencyKey();
  }

  /** Die Buchung mit [key] ist fehlgeschlagen; eine Wiederholung nutzt denselben Schlüssel. */
  failed(payload: unknown, key: string): void {
    this.failedAttempt = { fingerprint: RetryableIdempotencyKey.fingerprint(payload), key };
  }

  /** Nach Erfolg: Die nächste Buchung ist eine neue, auch mit gleichen Daten. */
  reset(): void {
    this.failedAttempt = null;
  }

  private static fingerprint(payload: unknown): string {
    return JSON.stringify(payload) ?? '';
  }
}
