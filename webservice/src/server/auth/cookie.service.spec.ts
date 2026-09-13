import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import {
  MAX_SESSION_COOKIE_CHUNKS,
  SESSION_COOKIE_CHUNK_SIZE,
  appendCookie,
  clearOidcStateCookie,
  clearSessionCookie,
  oidcStateCookieName,
  readCookie,
  readOidcStateCookie,
  readSessionCookie,
  setOidcStateCookie,
  setSessionCookie,
} from './cookie.service';

function createMockRequest(cookieHeader?: string): Request {
  return {
    headers: {
      cookie: cookieHeader,
    },
  } as unknown as Request;
}

function createMockResponse(): Response {
  let headers: Record<string, string | string[]> = {};
  return {
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader: (name: string, value: string | string[]) => {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as Response;
}

describe('cookie.service', () => {
  it('reads single and multiple cookies correctly', () => {
    const req = createMockRequest('vereint_session=xyz123; other=abc; __oidc_state=state987');
    expect(readCookie(req, 'vereint_session')).toBe('xyz123');
    expect(readSessionCookie(req)).toBe('xyz123');
    expect(readOidcStateCookie(req)).toBe('state987');
    expect(readCookie(req, 'missing')).toBeUndefined();
  });

  it('handles URL-encoded cookie values correctly', () => {
    const encoded = encodeURIComponent('{"key":"value with spaces & symbols="}');
    const req = createMockRequest(`vereint_session=${encoded}`);
    expect(readSessionCookie(req)).toBe('{"key":"value with spaces & symbols="}');
  });

  it('sets and clears session cookie with appropriate flags', () => {
    const res = createMockResponse();
    setSessionCookie(res, 'my_encrypted_session', true);

    const setCookie = res.getHeader('set-cookie') as string[];
    expect(Array.isArray(setCookie)).toBe(true);
    const base = setCookie[0];
    expect(base).toContain('vereint_session=my_encrypted_session');
    expect(base).toContain('HttpOnly');
    expect(base).toContain('SameSite=Lax');
    expect(base).toContain('Path=/');
    expect(base).toContain('Max-Age=');

    clearSessionCookie(res);
    const updatedCookie = res.getHeader('set-cookie') as string[];
    expect(Array.isArray(updatedCookie)).toBe(true);
    const clearedBase = updatedCookie.find(
      (cookie) => /^vereint_session=;/.test(cookie) && cookie.includes('Max-Age=0'),
    );
    expect(clearedBase).toBeDefined();
  });

  it('splits a large session value into chunk cookies and reassembles it', () => {
    const res = createMockResponse();
    const largeValue = 'A'.repeat(SESSION_COOKIE_CHUNK_SIZE * 2 + 500);
    setSessionCookie(res, largeValue, true);

    const setCookie = res.getHeader('set-cookie') as string[];
    const names = setCookie
      .filter((cookie) => !cookie.includes('Max-Age=0'))
      .map((cookie) => cookie.split('=')[0]);
    expect(names).toEqual(['vereint_session', 'vereint_session.1', 'vereint_session.2']);

    const header = setCookie
      .filter((cookie) => !cookie.includes('Max-Age=0'))
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    const req = createMockRequest(header);
    expect(readSessionCookie(req)).toBe(largeValue);
  });

  it('clears stale higher-index chunk cookies when a session shrinks', () => {
    const res = createMockResponse();
    setSessionCookie(res, 'short', true);

    const setCookie = res.getHeader('set-cookie') as string[];
    const cleared = setCookie.filter((cookie) => cookie.includes('Max-Age=0'));
    expect(cleared.some((cookie) => cookie.startsWith('vereint_session.1='))).toBe(true);
    expect(cleared.some((cookie) => cookie.startsWith(`vereint_session.${MAX_SESSION_COOKIE_CHUNKS - 1}=`))).toBe(true);
  });

  it('sets and clears OIDC state cookie with 10-minute lifetime', () => {
    const res = createMockResponse();
    setOidcStateCookie(res, 'state_payload_data');

    const setCookie = res.getHeader('set-cookie') as string;
    expect(setCookie).toContain(`${oidcStateCookieName}=state_payload_data`);
    expect(setCookie).toContain('Max-Age=600');
    expect(setCookie).toContain('HttpOnly');

    clearOidcStateCookie(res);
    const updatedCookie = res.getHeader('set-cookie') as string[];
    expect(Array.isArray(updatedCookie)).toBe(true);
    expect(updatedCookie[1]).toContain(`${oidcStateCookieName}=`);
    expect(updatedCookie[1]).toContain('Max-Age=0');
  });

  it('appends multiple cookies without overwriting', () => {
    const res = createMockResponse();
    appendCookie(res, 'cookie1=val1');
    appendCookie(res, 'cookie2=val2');
    appendCookie(res, 'cookie3=val3');

    const header = res.getHeader('set-cookie');
    expect(Array.isArray(header)).toBe(true);
    expect(header).toEqual(['cookie1=val1', 'cookie2=val2', 'cookie3=val3']);
  });
});
