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

/**
 * Hält den Idempotency-Key einer Buchung, bis sie sicher angekommen ist.
 *
 * Bricht eine Anfrage ab (Zeitüberschreitung, Netzwerk, `503`), kann der
 * Fachservice die Buchung trotzdem gespeichert haben. Wiederholt die Person
 * dieselbe Buchung, muss deshalb derselbe Schlüssel mitgehen: Dann liefert der
 * Server die vorhandene Buchung zurück, statt eine zweite anzulegen. Ein neuer
 * Schlüssel entsteht erst, wenn sich die Buchungsdaten ändern oder die letzte
 * Buchung erfolgreich war ([reset]).
 */
export class RetryableIdempotencyKey {
  private current: { readonly fingerprint: string; readonly key: string } | null = null;

  /** Schlüssel für [payload]; bei gleichen Daten derselbe wie beim letzten Versuch. */
  for(payload: unknown): string {
    const fingerprint = JSON.stringify(payload) ?? '';
    if (this.current?.fingerprint !== fingerprint) {
      this.current = { fingerprint, key: newIdempotencyKey() };
    }
    return this.current.key;
  }

  /** Nach Erfolg: Die nächste Buchung ist eine neue, auch mit gleichen Daten. */
  reset(): void {
    this.current = null;
  }
}
