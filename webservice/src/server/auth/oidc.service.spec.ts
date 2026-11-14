import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTestEnvironmentOverrides, serverEnvironment } from '../config/environment';
import {
  buildEndSessionUrl,
  createAuthorizationRequest,
  exchangeCodeForTokens,
  extractIdentityFromTokenClaims,
  extractIdentityFromVerifiedTokens,
  keycloakFetch,
  logoutFromKeycloak,
  parseJwtClaims,
  refreshAccessToken,
} from './oidc.service';
import {
  installTestKeySet,
  installTestSecrets,
  signAccessToken,
  signIdToken,
  signTokenPair,
} from './testing/token-fixtures';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('oidc.service', () => {
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    installTestSecrets();
    await installTestKeySet();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    installTestSecrets();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('createAuthorizationRequest', () => {
    it('generates a valid PKCE S256 authorization URL with state and nonce', () => {
      const result = createAuthorizationRequest({
        returnTo: '/events/123',
        scope: 'openid profile email roles custom_scope',
      });

      expect(result.authorizationUrl).toContain('/protocol/openid-connect/auth');
      expect(result.authorizationUrl).toContain('client_id=vereint-web');
      expect(result.authorizationUrl).toContain('response_type=code');
      expect(result.authorizationUrl).toContain('code_challenge_method=S256');
      expect(result.authorizationUrl).toContain('code_challenge=');
      expect(result.authorizationUrl).toContain(`state=${result.transactionState.state}`);
      expect(result.authorizationUrl).toContain(`nonce=${result.transactionState.nonce}`);
      expect(result.authorizationUrl).toContain('scope=openid+profile+email+roles+custom_scope');

      expect(result.transactionState.returnTo).toBe('/events/123');
      expect(result.transactionState.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(result.transactionState.nonce).toBeTruthy();
      expect(result.stateString).toContain(result.transactionState.state);
    });
  });

  describe('Claim-Vertrag', () => {
    it('parses unverified claims for diagnostics only', () => {
      const jwt = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(
        JSON.stringify({ sub: 'user-sub-123', email: 'member@vereint.local' }),
      ).toString('base64url')}.sig`;

      const claims = parseJwtClaims(jwt);
      expect(claims['sub']).toBe('user-sub-123');
      expect(parseJwtClaims('nonsense')).toEqual({});
      expect(parseJwtClaims('')).toEqual({});
    });

    it('extracts roles from direct, realm_access and resource_access claims', () => {
      const identity = extractIdentityFromTokenClaims({
        sub: 'kc-uid-456',
        email: 'board@vereint.local',
        preferred_username: 'treasurer_user',
        realm_access: { roles: ['board', 'offline_access', 'default-roles-vereint'] },
        resource_access: { 'vereint-web': { roles: ['member', 'treasurer'] } },
        event_scopes: ['event-1', 'event-2'],
      });

      expect(identity.uid).toBe('kc-uid-456');
      expect(identity.email).toBe('board@vereint.local');
      expect(identity.displayName).toBe('treasurer_user');
      expect(identity.roles).toEqual(expect.arrayContaining(['member', 'board']));
      expect(identity.boardRole).toBe('treasurer');
      expect(identity.eventScopes).toEqual(['event-1', 'event-2']);
      expect(identity.drinkRecorder).toBe(false);
    });

    it('merges permissions from permissions and scope while dropping OIDC scopes', () => {
      const identity = extractIdentityFromTokenClaims({
        sub: 'kc-uid-789',
        permissions: ['ledger.read'],
        scope: 'openid profile email roles purchase.self',
      });

      expect(identity.permissions).toEqual(expect.arrayContaining(['ledger.read', 'purchase.self']));
      expect(identity.permissions).not.toContain('openid');
      expect(identity.permissions).not.toContain('profile');
    });

    it('identifies tabletRecorder and drink_recorder claims', () => {
      const identity = extractIdentityFromTokenClaims({ sub: 'tablet-uid-789', roles: ['tabletRecorder'] });
      expect(identity.drinkRecorder).toBe(true);
      expect(identity.roles).toEqual([]);
    });

    it('throws error when subject is missing in claims', () => {
      expect(() => extractIdentityFromTokenClaims({ email: 'test@example.com' })).toThrowError(
        'invalid_token_missing_subject',
      );
    });
  });

  describe('extractIdentityFromVerifiedTokens', () => {
    it('derives the identity only from verified tokens', async () => {
      const tokens = await signTokenPair({
        subject: 'user-999',
        nonce: 'nonce-999',
        accessClaims: { realm_access: { roles: ['admin', 'member'] }, board_role: 'chair' },
        idClaims: { email: 'chair@vereint.local', name: 'Chair Person' },
      });

      const { identity } = await extractIdentityFromVerifiedTokens(tokens, { nonce: 'nonce-999' });

      expect(identity.uid).toBe('user-999');
      expect(identity.email).toBe('chair@vereint.local');
      expect(identity.displayName).toBe('Chair Person');
      expect(identity.roles).toEqual(expect.arrayContaining(['admin', 'member']));
      expect(identity.boardRole).toBe('chair');
    });

    it('rejects a tampered access token signature', async () => {
      const tokens = await signTokenPair({ subject: 'u-1' });
      const [header, payload, signature] = tokens.access_token.split('.');
      const tampered = { ...tokens, access_token: `${header}.${payload}.${signature.slice(0, -4)}AAAA` };

      await expect(extractIdentityFromVerifiedTokens(tampered)).rejects.toMatchObject({
        code: 'token_verification_failed',
      });
    });

    it('rejects a mismatching nonce', async () => {
      const tokens = await signTokenPair({ subject: 'u-1', nonce: 'nonce-from-attacker' });

      await expect(
        extractIdentityFromVerifiedTokens(tokens, { nonce: 'nonce-expected' }),
      ).rejects.toMatchObject({ code: 'token_nonce_mismatch' });
    });

    it('rejects an id token issued for a different subject', async () => {
      const access_token = await signAccessToken({ sub: 'u-1' });
      const id_token = await signIdToken({ sub: 'u-2' });

      await expect(
        extractIdentityFromVerifiedTokens({
          access_token,
          id_token,
          expires_in: 300,
          token_type: 'Bearer',
        }),
      ).rejects.toMatchObject({ code: 'token_subject_mismatch' });
    });

    it('rejects a refreshed token with a changed subject', async () => {
      const tokens = await signTokenPair({ subject: 'u-attacker' });

      await expect(
        extractIdentityFromVerifiedTokens(tokens, { expectedSubject: 'u-original' }),
      ).rejects.toMatchObject({ code: 'token_subject_mismatch' });
    });

    it('rejects an expired access token', async () => {
      const issuedAt = Math.floor(Date.now() / 1000) - 7200;
      const access_token = await signAccessToken({ sub: 'u-1' }, { issuedAtSeconds: issuedAt, expiresInSeconds: 60 });

      await expect(
        extractIdentityFromVerifiedTokens({ access_token, expires_in: 60, token_type: 'Bearer' }),
      ).rejects.toMatchObject({ code: 'token_verification_failed' });
    });
  });

  describe('keycloakFetch', () => {
    it('aborts the request after the configured timeout', async () => {
      applyTestEnvironmentOverrides({ keycloakRequestTimeoutMs: 20 });

      globalThis.fetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      );

      await expect(keycloakFetch('http://localhost:8082/slow', { method: 'GET' })).rejects.toThrowError(
        /keycloak_request_failed/,
      );

      applyTestEnvironmentOverrides({ keycloakRequestTimeoutMs: 3000 });
    });

    it('retries idempotent calls and sends the correlation id', async () => {
      let calls = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        calls += 1;
        if (calls === 1) throw new Error('network down');
        expect(new Headers(init?.headers).get('X-Request-Id')).toBe('corr-1');
        return new Response(null, { status: 200 });
      });

      const response = await keycloakFetch(
        'http://localhost:8082/retry',
        { method: 'POST' },
        { retries: 1, requestId: 'corr-1' },
      );

      expect(response.status).toBe(200);
      expect(calls).toBe(2);
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('exchanges authorization code and PKCE verifier for tokens', async () => {
      const tokenResponse = await signTokenPair({ subject: 'u1' });

      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(tokenResponse));

      const tokens = await exchangeCodeForTokens('auth_code_xyz', 'verifier_123', 'http://localhost:8080/callback');

      expect(tokens.access_token).toBe(tokenResponse.access_token);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/protocol/openid-connect/token'),
        expect.objectContaining({ method: 'POST' }),
      );

      const body = String((vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit).body);
      expect(body).toContain('client_secret=');
      expect(body).toContain('code_verifier=verifier_123');
    });

    it('throws error on failed token exchange without leaking the response body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));

      await expect(
        exchangeCodeForTokens('bad_code', 'verifier_123', 'http://localhost:8080/callback'),
      ).rejects.toThrowError('oidc_token_exchange_failed (400)');
    });

    it('aborts when the client secret is missing', async () => {
      applyTestEnvironmentOverrides({ keycloakClientSecret: '' });

      await expect(exchangeCodeForTokens('code', 'verifier')).rejects.toThrowError(
        'keycloak_client_secret_missing',
      );
    });
  });

  describe('refreshAccessToken & logout', () => {
    it('refreshes access token with Keycloak token endpoint', async () => {
      const tokenResponse = await signTokenPair({ subject: 'u1' });
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ...tokenResponse, refresh_token: 'rotated' }));

      const tokens = await refreshAccessToken('old_refresh_tok');
      expect(tokens.refresh_token).toBe('rotated');
    });

    it('reports and logs a failed backchannel logout', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 502 }));

      await expect(logoutFromKeycloak('refresh_tok')).resolves.toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);

      const entry = JSON.parse(warn.mock.calls[0][0] as string);
      expect(entry.event).toBe('oidc_backchannel_logout');
      expect(entry.errorClass).toBe('http_502');
      expect(warn.mock.calls[0][0]).not.toContain('refresh_tok');
    });

    it('confirms a successful backchannel logout', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

      await expect(logoutFromKeycloak('refresh_tok_to_revoke')).resolves.toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/protocol/openid-connect/logout'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('builds end-session URL with post_logout_redirect_uri and id_token_hint', () => {
      const url = buildEndSessionUrl({
        idTokenHint: 'hint_token_123',
        postLogoutRedirectUri: 'http://localhost:8080/auth/logged-out',
      });

      expect(url).toContain('/protocol/openid-connect/logout');
      expect(url).toContain('post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fauth%2Flogged-out');
      expect(url).toContain(`client_id=${serverEnvironment.keycloakClientId}`);
      expect(url).toContain('id_token_hint=hint_token_123');
    });
  });
});
