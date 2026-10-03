import express from 'express';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext, RequestIdentity } from '../auth/auth.types';
import { authorizePages } from './authorization.middleware';
import { clearAccessDecisionCache } from './authorization.service';
import type { ResolvedAccessDecision } from './authorization.types';
import {
  APP_SHELL_CACHE_CONTROL,
  IMMUTABLE_CACHE_CONTROL,
  PRIVATE_CACHE_CONTROL,
  applyDeliveryHeaders,
  attachCspNonce,
  isHashedAssetPath,
  isPrivateDeliveryPath,
  securityHeaders,
} from './delivery.middleware';
import {
  containsForbiddenPrivateData,
  findForbiddenPatterns,
  sanitizeTransferState,
} from './transfer-state';

/**
 * Tabellengetriebener Test der Auslieferungsregeln über alle geschützten
 * App-Kontexte (TICKET-007). Der Test läuft gegen einen echten Express-Server,
 * damit Statuscode, Redirect-Ziel und die gesetzten Header geprüft werden.
 */

const realFetch = globalThis.fetch;

interface ContextCase {
  name: string;
  path: string;
  appContext: AppContext;
  identity: RequestIdentity;
  allowedContexts: AppContext[];
  ownedEvents?: string[];
  eventScopes?: string[];
}

const memberIdentity: RequestIdentity = { uid: 'sub-member', roles: ['member'], drinkRecorder: false };
const boardIdentity: RequestIdentity = { uid: 'sub-board', roles: ['board'], drinkRecorder: false };
const adminIdentity: RequestIdentity = { uid: 'sub-admin', roles: ['admin'], drinkRecorder: false };
const tabletIdentity: RequestIdentity = { uid: 'sub-tablet', roles: ['member'], drinkRecorder: true };

const contextCases: ContextCase[] = [
  {
    name: 'memberPwa',
    path: '/app',
    appContext: 'memberPwa',
    identity: memberIdentity,
    allowedContexts: ['memberPwa'],
  },
  {
    name: 'event',
    path: '/events/evt-1',
    appContext: 'event',
    identity: memberIdentity,
    allowedContexts: ['memberPwa', 'event'],
    eventScopes: ['evt-1'],
  },
  {
    name: 'eventOwner',
    path: '/events/evt-1/manage',
    appContext: 'eventOwner',
    identity: memberIdentity,
    allowedContexts: ['memberPwa', 'event', 'eventOwner'],
    ownedEvents: ['evt-1'],
    eventScopes: ['evt-1'],
  },
  {
    name: 'boardGeneral',
    path: '/board',
    appContext: 'boardGeneral',
    identity: boardIdentity,
    allowedContexts: ['memberPwa', 'boardGeneral'],
  },
  {
    name: 'boardTreasury',
    path: '/board/treasury',
    appContext: 'boardTreasury',
    identity: boardIdentity,
    allowedContexts: ['memberPwa', 'boardGeneral', 'boardTreasury'],
  },
  {
    name: 'boardCommunications',
    path: '/board/communications',
    appContext: 'boardCommunications',
    identity: boardIdentity,
    allowedContexts: ['memberPwa', 'boardGeneral', 'boardCommunications'],
  },
  {
    name: 'admin',
    path: '/admin',
    appContext: 'admin',
    identity: adminIdentity,
    allowedContexts: ['memberPwa', 'admin'],
  },
  {
    name: 'tabletRecorder',
    path: '/tablet',
    appContext: 'tabletRecorder',
    identity: tabletIdentity,
    allowedContexts: ['memberPwa', 'tabletRecorder'],
  },
];

let server: Server;
let baseUrl: string;

/** Aktive Testidentität; `undefined` bedeutet unauthentifiziert. */
let currentIdentity: RequestIdentity | undefined;

function decisionFor(testCase: ContextCase, allowed: boolean): ResolvedAccessDecision {
  return {
    subject: testCase.identity.uid,
    disabled: false,
    roles: testCase.identity.roles,
    drinkRecorder: testCase.identity.drinkRecorder,
    permissions: [],
    eventScopes: testCase.eventScopes ?? [],
    ownedEvents: testCase.ownedEvents ?? [],
    allowedAppContexts: allowed ? testCase.allowedContexts : [],
    matrixVersion: 1,
  };
}

/** Nur Resolver-Aufrufe werden abgefangen; eigene Requests laufen echt. */
function stubResolverFetch(decision: ResolvedAccessDecision): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/v1/auth/access')) {
        return { ok: true, status: 200, json: async () => decision } as unknown as Response;
      }
      return realFetch(url as string, init);
    }),
  );
}

beforeAll(async () => {
  const app = express();
  app.use(attachCspNonce);
  app.use(securityHeaders);
  app.use(applyDeliveryHeaders);
  app.use((req, _res, next) => {
    req.identity = currentIdentity;
    if (currentIdentity) {
      req.sessionData = {
        sessionId: `session-${currentIdentity.uid}-${req.path}`,
        uid: currentIdentity.uid,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        tokens: { accessToken: 'access-token' },
        identity: currentIdentity,
      };
    }
    next();
  });
  app.use(authorizePages);
  app.use((_req, res) => {
    res.status(200).type('text/html').send('<!doctype html><html><body>ok</body></html>');
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  currentIdentity = undefined;
  clearAccessDecisionCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearAccessDecisionCache();
});

describe('delivery rules per app context', () => {
  it.each(contextCases)('$name: unauthenticated navigation is sent to the login', async (testCase) => {
    const response = await realFetch(`${baseUrl}${testCase.path}`, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `/api/auth/login?returnTo=${encodeURIComponent(testCase.path)}`,
    );
    expect(response.headers.get('cache-control')).toBe(PRIVATE_CACHE_CONTROL);
    expect(response.headers.get('vary')).toContain('Cookie');
  });

  it.each(contextCases)('$name: authenticated without the right receives /403', async (testCase) => {
    currentIdentity = testCase.identity;
    stubResolverFetch(decisionFor(testCase, false));

    const response = await realFetch(`${baseUrl}${testCase.path}`, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/403');
    expect(response.headers.get('cache-control')).toBe(PRIVATE_CACHE_CONTROL);
    expect(response.headers.get('vary')).toContain('Cookie');
  });

  it.each(contextCases)('$name: entitled request receives 200 with private headers', async (testCase) => {
    currentIdentity = testCase.identity;
    stubResolverFetch(decisionFor(testCase, true));

    const response = await realFetch(`${baseUrl}${testCase.path}`, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(PRIVATE_CACHE_CONTROL);
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(response.headers.get('vary')).toContain('Accept-Encoding');
  });
});

describe('security headers', () => {
  it('sets a nonce based content security policy and hardening headers', async () => {
    const response = await realFetch(`${baseUrl}/auth/error`, { headers: { accept: 'text/html' } });
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('creates a new nonce per response', async () => {
    const first = await realFetch(`${baseUrl}/auth/error`, { headers: { accept: 'text/html' } });
    const second = await realFetch(`${baseUrl}/auth/error`, { headers: { accept: 'text/html' } });

    expect(first.headers.get('content-security-policy')).not.toBe(
      second.headers.get('content-security-policy'),
    );
  });

  it('omits HSTS without TLS and sets it behind a TLS terminating proxy', async () => {
    const plain = await realFetch(`${baseUrl}/auth/error`, { headers: { accept: 'text/html' } });
    expect(plain.headers.get('strict-transport-security')).toBeNull();

    const secure = await realFetch(`${baseUrl}/auth/error`, {
      headers: { accept: 'text/html', 'x-forwarded-proto': 'https' },
    });
    expect(secure.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
  });
});

describe('cache rules', () => {
  it('classifies hashed assets, app shell and protected routes', () => {
    expect(isHashedAssetPath('/main-5RAM3QJT.js')).toBe(true);
    expect(isHashedAssetPath('/styles-ABCDEF12.css')).toBe(true);
    expect(isHashedAssetPath('/media/inter-12345678.woff2')).toBe(true);
    expect(isHashedAssetPath('/index.html')).toBe(false);
    expect(isHashedAssetPath('/favicon.ico')).toBe(false);

    expect(isPrivateDeliveryPath('/app')).toBe(true);
    expect(isPrivateDeliveryPath('/register/abc')).toBe(true);
    expect(isPrivateDeliveryPath('/auth/error')).toBe(false);
    expect(isPrivateDeliveryPath('/auth/logged-out')).toBe(false);
  });

  it('serves hashed assets immutable and the app shell revalidated', async () => {
    const asset = await realFetch(`${baseUrl}/main-5RAM3QJT.js`, { redirect: 'manual' });
    expect(asset.headers.get('cache-control')).toBe(IMMUTABLE_CACHE_CONTROL);

    const shell = await realFetch(`${baseUrl}/auth/error`, { headers: { accept: 'text/html' } });
    expect(shell.headers.get('cache-control')).toBe(APP_SHELL_CACHE_CONTROL);
    expect(shell.headers.get('vary')).toBe('Accept-Encoding');
  });
});

describe('transfer state leak protection', () => {
  const privateHtml =
    '<!doctype html><html><body><app-root></app-root>'
    + '<script id="ng-state" type="application/json">'
    + JSON.stringify({
      title: 'Guthaben',
      balance: 4250,
      ledger: [{ amount: 250 }],
      guestToken: 'guest-secret',
      accessToken: 'eyJhbGciOiJSUzI1NiJ9.payload.signature',
      email: 'member@example.com',
    })
    + '</script></body></html>';

  it('removes every field outside the allowlist', () => {
    const sanitized = sanitizeTransferState(privateHtml);

    expect(sanitized).toContain('"title":"Guthaben"');
    expect(sanitized).not.toContain('balance');
    expect(sanitized).not.toContain('ledger');
    expect(sanitized).not.toContain('guestToken');
    expect(sanitized).not.toContain('eyJhbGciOiJSUzI1NiJ9');
    expect(sanitized).not.toContain('member@example.com');
  });

  it('discards a transfer state that cannot be parsed', () => {
    const broken = '<script id="ng-state" type="application/json">{balance:</script>';

    expect(sanitizeTransferState(broken)).toBe(
      '<script id="ng-state" type="application/json">{}</script>',
    );
  });

  it('detects the forbidden patterns before sanitizing and none afterwards', () => {
    expect(findForbiddenPatterns(privateHtml).length).toBeGreaterThan(0);
    expect(containsForbiddenPrivateData(sanitizeTransferState(privateHtml))).toBe(false);
  });

  it('delivers a private SSR response free of forbidden patterns', async () => {
    currentIdentity = memberIdentity;
    stubResolverFetch(decisionFor(contextCases[0], true));

    const response = await realFetch(`${baseUrl}/app`, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
    });
    const html = sanitizeTransferState(await response.text());

    expect(response.status).toBe(200);
    expect(containsForbiddenPrivateData(html)).toBe(false);
  });
});
