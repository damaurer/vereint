import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_TO, isSafeReturnTo, resolveSafeReturnTo } from './redirect';

describe('redirect (Open-Redirect-Schutz)', () => {
  it('accepts relative paths on known app prefixes', () => {
    expect(isSafeReturnTo('/app')).toBe(true);
    expect(isSafeReturnTo('/events/my-event')).toBe(true);
    expect(isSafeReturnTo('/board/treasury')).toBe(true);
    expect(isSafeReturnTo('/events/123?tab=drinks')).toBe(true);
    expect(resolveSafeReturnTo('/events/my-event')).toBe('/events/my-event');
  });

  it('rejects malicious returnTo values', () => {
    const malicious = [
      '//evil.example.com',
      '//evil.example.com/app',
      'https://evil.example.com/app',
      'http://localhost:8080/app',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/\\evil.example.com',
      '/app\\..\\admin',
      '/../etc/passwd',
      '/app/../../admin',
      '/app%2f%2eevil',
      'app',
      '',
      '/unknown-area',
      '/api/auth/logout',
      '/app\n/evil',
      `/app${'x'.repeat(600)}`,
    ];

    for (const value of malicious) {
      expect(isSafeReturnTo(value), value).toBe(false);
      expect(resolveSafeReturnTo(value), value).toBe(DEFAULT_RETURN_TO);
    }
  });

  it('rejects non-string values', () => {
    expect(isSafeReturnTo(undefined)).toBe(false);
    expect(isSafeReturnTo(null)).toBe(false);
    expect(isSafeReturnTo(42)).toBe(false);
    expect(isSafeReturnTo(['/app'])).toBe(false);
    expect(resolveSafeReturnTo(['/app', '/admin'])).toBe(DEFAULT_RETURN_TO);
  });

  it('falls back to the context default path', () => {
    expect(resolveSafeReturnTo('//evil.example.com', { context: 'admin' })).toBe('/admin');
    expect(resolveSafeReturnTo(undefined, { context: 'tabletRecorder' })).toBe('/tablet');
    expect(resolveSafeReturnTo(undefined, { context: 'boardTreasury' })).toBe('/board/treasury');
    expect(resolveSafeReturnTo(undefined, { fallback: '/404' })).toBe('/404');
  });

  it('supports a restricted prefix list for delegated contexts', () => {
    const guestPrefixes = ['/guest'];
    expect(isSafeReturnTo('/guest/event-1', guestPrefixes)).toBe(true);
    expect(isSafeReturnTo('/admin', guestPrefixes)).toBe(false);
    expect(resolveSafeReturnTo('/admin', { prefixes: guestPrefixes, context: 'eventGuest' })).toBe('/guest');
  });
});
