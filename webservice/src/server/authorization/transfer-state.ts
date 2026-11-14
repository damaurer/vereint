/**
 * Leckschutz für den Angular-Transfer-State.
 *
 * Für private App-Kontexte darf serverseitig gerendertes HTML keine Session-,
 * Guthaben-, Ledger-, Gast- oder Standortdaten enthalten (`AGENTS.md`). Der
 * Transfer-State wird deshalb auf eine explizite Positivliste unkritischer
 * Felder reduziert; alles andere wird vor der Auslieferung entfernt
 * (TICKET-007).
 */

/** Ausschließlich diese Schlüssel dürfen einen privaten Kontext verlassen. */
export const TRANSFER_STATE_ALLOWLIST: readonly string[] = [
  'appContext',
  'title',
  'description',
  'access',
  'locale',
  'theme',
  'buildVersion',
  'featureFlags',
];

/**
 * Verbotene Muster im gerenderten HTML: Token-Präfixe, Guthaben, Ledger,
 * Gast-Token und E-Mail-Adressen.
 */
export const FORBIDDEN_HTML_PATTERNS: readonly RegExp[] = [
  /\beyJ[A-Za-z0-9_-]{10,}/,
  /\baccessToken\b/i,
  /\brefreshToken\b/i,
  /\bidToken\b/i,
  /\bBearer\s+[A-Za-z0-9._-]+/i,
  /\bbalance\b/i,
  /\bledger\b/i,
  /\bguestToken\b/i,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
];

const NG_STATE_PATTERN =
  /(<script[^>]*id="ng-state"[^>]*>)([\s\S]*?)(<\/script>)/gi;

/** Reduziert ein Transfer-State-Objekt auf die Positivliste. */
export function filterTransferState(
  state: Record<string, unknown>,
  allowlist: readonly string[] = TRANSFER_STATE_ALLOWLIST,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(state)) {
    if (allowlist.includes(key)) {
      filtered[key] = state[key];
    }
  }
  return filtered;
}

/**
 * Entfernt alle nicht freigegebenen Felder aus dem eingebetteten
 * Transfer-State. Nicht parsebarer Inhalt wird vollständig verworfen
 * (`deny by default`).
 */
export function sanitizeTransferState(
  html: string,
  allowlist: readonly string[] = TRANSFER_STATE_ALLOWLIST,
): string {
  return html.replace(NG_STATE_PATTERN, (_match, open: string, body: string, close: string) => {
    let filtered: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(body || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        filtered = filterTransferState(parsed as Record<string, unknown>, allowlist);
      }
    } catch {
      filtered = {};
    }
    return `${open}${JSON.stringify(filtered)}${close}`;
  });
}

/** Liefert alle verbotenen Muster, die im HTML gefunden wurden. */
export function findForbiddenPatterns(html: string): string[] {
  return FORBIDDEN_HTML_PATTERNS.filter((pattern) => pattern.test(html)).map((pattern) => pattern.source);
}

export function containsForbiddenPrivateData(html: string): boolean {
  return findForbiddenPatterns(html).length > 0;
}
