import express from 'express';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionData } from '../auth/auth.types';
import { applyTestEnvironmentOverrides, serverEnvironment } from '../config/environment';
import { API_PROXY_MAX_UPLOAD, apiProxy } from './api-proxy.middleware';

describe('api-proxy.middleware', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  const originalFetch = globalThis.fetch;

  /** Steuert, ob und mit welcher Session der Proxy aufgerufen wird. */
  let injectedSession: SessionData | undefined;

  function sessionWithToken(accessToken: string): SessionData {
    return {
      sessionId: 'sess-1',
      uid: 'user-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      accessTokenExpiresAt: Date.now() + 60_000,
      tokens: { accessToken },
      identity: { uid: 'user-1', roles: ['member'], drinkRecorder: false },
    };
  }

  beforeAll(async () => {
    applyTestEnvironmentOverrides({ springApiBaseUrl: 'http://spring.test' });

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.sessionData = injectedSession;
      next();
    });
    app.use('/api/v1', express.raw({ type: 'multipart/form-data', limit: API_PROXY_MAX_UPLOAD }), apiProxy);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    injectedSession = sessionWithToken('access-token-abc');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('denies requests without a valid session (deny by default)', async () => {
    injectedSession = undefined;
    const upstream = vi.fn();
    globalThis.fetch = upstream as unknown as typeof fetch;

    const response = await originalFetch(`${baseUrl}/api/v1/users/me`);

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    const body = (await response.json()) as { code: string; traceId: string };
    expect(body.code).toBe('oidc_session_expired');
    expect(body.traceId).toBeTruthy();
    expect(upstream).not.toHaveBeenCalled();
  });

  it('forwards GET requests with the session bearer token and returns the upstream body', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify({ id: 'user-1', displayName: 'Alice' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const response = await originalFetch(`${baseUrl}/api/v1/users/me`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { displayName: string };
    expect(body.displayName).toBe('Alice');

    expect(captured?.url).toBe(`${serverEnvironment.springApiBaseUrl}/api/v1/users/me`);
    const headers = new Headers(captured?.init.headers);
    expect(headers.get('authorization')).toBe('Bearer access-token-abc');
    expect(headers.get('x-request-id')).toBeTruthy();

    // Sitzungsgebundene Fachdaten dürfen nicht zwischengespeichert werden.
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('never leaks a client-supplied Authorization header to the upstream', async () => {
    let capturedAuth: string | null = null;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedAuth = new Headers(init?.headers).get('authorization');
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    await originalFetch(`${baseUrl}/api/v1/events`, {
      headers: { authorization: 'Bearer forged-token' },
    });

    expect(capturedAuth).toBe('Bearer access-token-abc');
  });

  it('forwards multipart uploads byte for byte with their boundary', async () => {
    let captured: { body: Buffer; contentType: string | null } | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = {
        body: Buffer.from(init?.body as Uint8Array),
        contentType: new Headers(init?.headers).get('content-type'),
      };
      return new Response(JSON.stringify({ id: 'image-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    const boundary = 'vereint-test-boundary';
    const form = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bild.png"\r\n` +
          'Content-Type: image/png\r\n\r\n',
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await originalFetch(`${baseUrl}/api/v1/images`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: new Uint8Array(form),
    });

    expect(response.status).toBe(201);
    expect(captured?.contentType).toBe(`multipart/form-data; boundary=${boundary}`);
    expect(captured?.body.equals(form)).toBe(true);
  });

  it('forwards POST bodies and the Idempotency-Key header', async () => {
    let captured: { body: unknown; idempotency: string | null } | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = {
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        idempotency: new Headers(init?.headers).get('idempotency-key'),
      };
      return new Response(JSON.stringify({ id: 'entry-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const response = await originalFetch(`${baseUrl}/api/v1/ledger/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-123' },
      body: JSON.stringify({ eventId: 'event-1', barcode: '4001' }),
    });

    expect(response.status).toBe(201);
    expect(captured?.body).toEqual({ eventId: 'event-1', barcode: '4001' });
    expect(captured?.idempotency).toBe('key-123');
  });

  it('relays upstream problem responses unchanged', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 'permission_denied', status: 403 }), {
        status: 403,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }) as unknown as typeof fetch;

    const response = await originalFetch(`${baseUrl}/api/v1/ledger/members/other/balance`);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('permission_denied');
  });

  it('answers with 503 when the upstream service is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const response = await originalFetch(`${baseUrl}/api/v1/users/me`);

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('service_unavailable');
  });

  it('forwards requests with X-Guest-Token without an active session', async () => {
    injectedSession = undefined;
    let captured: { url: string; headers: Headers } | undefined;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), headers: new Headers(init?.headers) };
      return new Response(JSON.stringify([{ id: 'msg-1', message: 'Hi' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const response = await originalFetch(`${baseUrl}/api/v1/events/evt-1/chat/guest/messages`, {
      headers: { 'X-Guest-Token': 'guest-token-123' },
    });

    expect(response.status).toBe(200);
    expect(captured?.headers.get('x-guest-token')).toBe('guest-token-123');
    expect(captured?.headers.get('authorization')).toBeNull();
  });

  it('forwards whitelisted public endpoints without an active session', async () => {
    injectedSession = undefined;
    let captured: { url: string; body: unknown } | undefined;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = {
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      return new Response(JSON.stringify({ guestToken: 'gt-123', eventId: 'evt-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const response = await originalFetch(`${baseUrl}/api/v1/invites/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'raw-token' }),
    });

    expect(response.status).toBe(201);
    expect(captured?.url).toBe(`${serverEnvironment.springApiBaseUrl}/api/v1/invites/accept`);
    expect(captured?.body).toEqual({ token: 'raw-token' });
  });

  it('forwards member invite preview and registration without a session, but nothing else below it', async () => {
    injectedSession = undefined;
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    for (const path of ['/api/v1/member-invites/preview', '/api/v1/member-invites/register']) {
      const response = await originalFetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'raw-token' }),
      });
      expect(response.status).toBe(201);
    }
    const list = await originalFetch(`${baseUrl}/api/v1/member-invites`);
    expect(list.status).toBe(401);
    expect(urls).toEqual([
      `${serverEnvironment.springApiBaseUrl}/api/v1/member-invites/preview`,
      `${serverEnvironment.springApiBaseUrl}/api/v1/member-invites/register`,
    ]);
  });
});
