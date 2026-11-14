import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_HTML_PATTERNS,
  TRANSFER_STATE_ALLOWLIST,
  containsForbiddenPrivateData,
  filterTransferState,
  findForbiddenPatterns,
  sanitizeTransferState,
} from './transfer-state';

/**
 * Direkter Nachweis des Transfer-State-Leckschutzes (TICKET-028).
 *
 * Serverseitig gerendertes HTML darf für private Kontexte ausschließlich die
 * Felder der Positivliste transportieren; Tokens, Guthaben, Ledger, Chats,
 * Bilder sowie Gast- und Standortdaten müssen entfernt werden (`AGENTS.md`).
 */

/** Baut ein `ng-state`-Skript mit dem übergebenen Zustand. */
function ngState(state: Record<string, unknown>): string {
  return (
    '<!doctype html><html><body><app-root></app-root>'
    + '<script id="ng-state" type="application/json">'
    + JSON.stringify(state)
    + '</script></body></html>'
  );
}

describe('filterTransferState', () => {
  it('keeps only allowlisted keys and drops everything else', () => {
    const filtered = filterTransferState({
      appContext: 'memberPwa',
      title: 'Übersicht',
      description: 'öffentlich',
      access: { role: 'member' },
      locale: 'de',
      theme: 'dark',
      buildVersion: '1.2.3',
      featureFlags: { chat: true },
      balance: 4250,
      ledger: [{ amount: 250 }],
      accessToken: 'secret',
      refreshToken: 'secret',
      idToken: 'secret',
      guestToken: 'secret',
      chats: ['private'],
      images: ['s3://bucket/private.png'],
      location: { lat: 1, lng: 2 },
      email: 'member@example.com',
    });

    expect(Object.keys(filtered).sort()).toEqual([...TRANSFER_STATE_ALLOWLIST].sort());
    for (const forbidden of [
      'balance',
      'ledger',
      'accessToken',
      'refreshToken',
      'idToken',
      'guestToken',
      'chats',
      'images',
      'location',
      'email',
    ]) {
      expect(filtered).not.toHaveProperty(forbidden);
    }
  });

  it('returns an empty object when no allowlisted key is present', () => {
    expect(filterTransferState({ balance: 1, ledger: [] })).toEqual({});
  });

  it('accepts a custom allowlist', () => {
    expect(filterTransferState({ title: 'x', balance: 1 }, ['balance'])).toEqual({ balance: 1 });
  });
});

describe('sanitizeTransferState', () => {
  it('reduces a private transfer state to the allowlist', () => {
    const sanitized = sanitizeTransferState(
      ngState({
        appContext: 'memberPwa',
        title: 'Guthaben',
        balance: 4250,
        ledger: [{ amount: 250 }],
        guestToken: 'guest-secret',
        accessToken: 'eyJhbGciOiJSUzI1NiJ9.payload.signature',
        location: { lat: 52.5, lng: 13.4 },
        email: 'member@example.com',
      }),
    );

    expect(sanitized).toContain('"appContext":"memberPwa"');
    expect(sanitized).toContain('"title":"Guthaben"');
    expect(sanitized).not.toContain('balance');
    expect(sanitized).not.toContain('ledger');
    expect(sanitized).not.toContain('guestToken');
    expect(sanitized).not.toContain('accessToken');
    expect(sanitized).not.toContain('eyJhbGciOiJSUzI1NiJ9');
    expect(sanitized).not.toContain('member@example.com');
    expect(sanitized).not.toMatch(/52\.5|13\.4/);
  });

  it('discards a transfer state that cannot be parsed (deny by default)', () => {
    const broken = '<script id="ng-state" type="application/json">{balance:</script>';

    expect(sanitizeTransferState(broken)).toBe(
      '<script id="ng-state" type="application/json">{}</script>',
    );
  });

  it('discards a non-object transfer state (arrays, primitives)', () => {
    expect(sanitizeTransferState(ngState([{ balance: 1 }] as unknown as Record<string, unknown>))).toContain(
      '{}</script>',
    );
  });

  it('sanitizes several ng-state scripts and preserves surrounding markup', () => {
    const html =
      '<html><body>'
      + '<script id="ng-state" type="application/json">{"title":"A","balance":1}</script>'
      + '<main>rendered</main>'
      + '<script id="ng-state" type="application/json">{"locale":"de","accessToken":"x"}</script>'
      + '</body></html>';

    const sanitized = sanitizeTransferState(html);

    expect(sanitized).toContain('<main>rendered</main>');
    expect(sanitized).toContain('"title":"A"');
    expect(sanitized).toContain('"locale":"de"');
    expect(sanitized).not.toContain('balance');
    expect(sanitized).not.toContain('accessToken');
  });

  it('leaves markup without a transfer state untouched', () => {
    const html = '<html><body><app-root></app-root></body></html>';
    expect(sanitizeTransferState(html)).toBe(html);
  });
});

describe('forbidden pattern detection', () => {
  it('flags every category of private data', () => {
    const samples = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      '"accessToken":"x"',
      '"refreshToken":"x"',
      '"idToken":"x"',
      'Authorization: Bearer abc.def.ghi',
      '"balance":4250',
      '"ledger":[]',
      '"guestToken":"g"',
      'member@example.com',
    ];

    for (const sample of samples) {
      expect(containsForbiddenPrivateData(sample)).toBe(true);
      expect(findForbiddenPatterns(sample).length).toBeGreaterThan(0);
    }
  });

  it('does not flag a sanitized allowlisted transfer state', () => {
    const sanitized = sanitizeTransferState(
      ngState({ appContext: 'memberPwa', title: 'Übersicht', locale: 'de', theme: 'dark' }),
    );

    expect(containsForbiddenPrivateData(sanitized)).toBe(false);
    expect(findForbiddenPatterns(sanitized)).toEqual([]);
  });

  it('exposes non-empty allowlist and pattern tables', () => {
    expect(TRANSFER_STATE_ALLOWLIST.length).toBeGreaterThan(0);
    expect(FORBIDDEN_HTML_PATTERNS.length).toBeGreaterThan(0);
  });
});
