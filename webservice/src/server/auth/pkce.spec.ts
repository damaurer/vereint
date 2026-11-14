import { describe, expect, it } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  isValidCodeVerifier,
  verifyCodeChallenge,
  generateOAuthState,
  buildKeycloakAuthorizationUrl,
} from './pkce';

describe('PKCE utilities', () => {
  it('generates a valid code_verifier within RFC 7636 length requirements', () => {
    const verifier = generateCodeVerifier();
    expect(typeof verifier).toBe('string');
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(isValidCodeVerifier(verifier)).toBe(true);
  });

  it('reproduces the RFC 7636 Appendix B test vector', () => {
    // RFC 7636 Appendix B:
    //   code_verifier  = dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
    //   code_challenge = E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
    const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    expect(generateCodeChallenge(testVerifier, 'S256')).toBe(expectedChallenge);
    expect(verifyCodeChallenge(testVerifier, expectedChallenge, 'S256')).toBe(true);
  });

  it('verifies code_challenge correctly with S256', () => {
    const verifier = generateCodeVerifier();
    const challengeS256 = generateCodeChallenge(verifier, 'S256');

    expect(verifyCodeChallenge(verifier, challengeS256, 'S256')).toBe(true);
    expect(verifyCodeChallenge(generateCodeVerifier(), challengeS256, 'S256')).toBe(false);
    expect(verifyCodeChallenge('', challengeS256, 'S256')).toBe(false);
    expect(verifyCodeChallenge(verifier, '', 'S256')).toBe(false);
  });

  it('rejects verifiers that violate RFC 7636 length or charset rules', () => {
    const tooShort = 'a'.repeat(42);
    const tooLong = 'a'.repeat(129);
    const invalidChars = `${'a'.repeat(42)}$`;

    expect(isValidCodeVerifier(tooShort)).toBe(false);
    expect(isValidCodeVerifier(tooLong)).toBe(false);
    expect(isValidCodeVerifier(invalidChars)).toBe(false);
    expect(isValidCodeVerifier(undefined)).toBe(false);

    expect(() => generateCodeChallenge(tooShort, 'S256')).toThrowError('invalid_code_verifier');
    expect(() => generateCodeChallenge(tooLong, 'S256')).toThrowError('invalid_code_verifier');
    expect(() => generateCodeChallenge(invalidChars, 'S256')).toThrowError('invalid_code_verifier');
    expect(verifyCodeChallenge(tooShort, 'irrelevant', 'S256')).toBe(false);
  });

  it('rejects the insecure plain method', () => {
    const verifier = generateCodeVerifier();

    expect(() => generateCodeChallenge(verifier, 'plain')).toThrowError('unsupported_code_challenge_method');
    expect(verifyCodeChallenge(verifier, verifier, 'plain')).toBe(false);
    expect(() =>
      buildKeycloakAuthorizationUrl({
        issuerUri: 'http://localhost:8082/realms/vereint',
        clientId: 'vereint-web',
        redirectUri: 'http://localhost:8080/api/auth/callback',
        state: 'xyz-state',
        codeChallenge: verifier,
        codeChallengeMethod: 'plain',
      }),
    ).toThrowError('unsupported_code_challenge_method');
  });

  it('generates random oauth state', () => {
    const state1 = generateOAuthState();
    const state2 = generateOAuthState();
    expect(state1).not.toBe(state2);
    expect(state1.length).toBeGreaterThan(20);
  });

  it('builds Keycloak authorization URL with PKCE parameters', () => {
    const url = buildKeycloakAuthorizationUrl({
      issuerUri: 'http://localhost:8082/realms/vereint',
      clientId: 'vereint-web',
      redirectUri: 'http://localhost:8080/api/auth/callback',
      state: 'xyz-state',
      codeChallenge: 'abc-challenge',
      codeChallengeMethod: 'S256',
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe('http://localhost:8082');
    expect(parsed.pathname).toBe('/realms/vereint/protocol/openid-connect/auth');
    expect(parsed.searchParams.get('client_id')).toBe('vereint-web');
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:8080/api/auth/callback');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('state')).toBe('xyz-state');
    expect(parsed.searchParams.get('code_challenge')).toBe('abc-challenge');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
