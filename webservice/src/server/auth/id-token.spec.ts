import { beforeAll, describe, expect, it } from 'vitest';
import { serverEnvironment } from '../config/environment';
import { TokenVerificationError, jwksUri, verifyAccessToken, verifyIdToken } from './id-token';
import {
  installTestKeySet,
  installTestSecrets,
  signAccessToken,
  signIdToken,
} from './testing/token-fixtures';

describe('id-token (Token-Validierung)', () => {
  beforeAll(async () => {
    installTestSecrets();
    await installTestKeySet();
  });

  it('derives the JWKS endpoint from the issuer', () => {
    expect(jwksUri('http://localhost:8082/realms/vereint/')).toBe(
      'http://localhost:8082/realms/vereint/protocol/openid-connect/certs',
    );
    expect(jwksUri()).toBe(`${serverEnvironment.keycloakIssuerUri}/protocol/openid-connect/certs`);
  });

  it('accepts a correctly signed id token', async () => {
    const token = await signIdToken({ sub: 'u-1', email: 'u1@vereint.local', nonce: 'nonce-1' });
    const claims = await verifyIdToken(token, { nonce: 'nonce-1' });

    expect(claims.sub).toBe('u-1');
    expect(claims['email']).toBe('u1@vereint.local');
  });

  it('rejects a tampered signature', async () => {
    const token = await signIdToken({ sub: 'u-1' });
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${payload}.${signature.slice(0, -4)}AAAA`;

    await expect(verifyIdToken(tampered)).rejects.toBeInstanceOf(TokenVerificationError);
    await expect(verifyIdToken(tampered)).rejects.toMatchObject({ code: 'token_verification_failed' });
  });

  it('rejects a token signed with a foreign key', async () => {
    const token = await signIdToken({ sub: 'u-1' }, { foreignKey: true });
    await expect(verifyIdToken(token)).rejects.toMatchObject({ code: 'token_verification_failed' });
  });

  it('rejects a wrong issuer', async () => {
    const token = await signIdToken({ sub: 'u-1' }, { issuer: 'https://evil.example.com/realms/vereint' });
    await expect(verifyIdToken(token)).rejects.toMatchObject({ code: 'token_verification_failed' });
  });

  it('rejects a wrong audience', async () => {
    const token = await signIdToken({ sub: 'u-1' }, { audience: 'someone-else' });
    await expect(verifyIdToken(token)).rejects.toMatchObject({ code: 'token_verification_failed' });
  });

  it('rejects an expired token beyond the clock skew', async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 3600;
    const token = await signIdToken({ sub: 'u-1' }, { issuedAtSeconds: issuedAt, expiresInSeconds: 60 });

    await expect(verifyIdToken(token)).rejects.toMatchObject({ code: 'token_verification_failed' });
  });

  it('accepts a token that expired within the clock skew', async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 40;
    const token = await signIdToken({ sub: 'u-1' }, { issuedAtSeconds: issuedAt, expiresInSeconds: 10 });

    await expect(verifyIdToken(token)).resolves.toMatchObject({ sub: 'u-1' });
  });

  it('rejects a mismatching nonce', async () => {
    const token = await signIdToken({ sub: 'u-1', nonce: 'nonce-from-attacker' });
    await expect(verifyIdToken(token, { nonce: 'nonce-expected' })).rejects.toMatchObject({
      code: 'token_nonce_mismatch',
    });
  });

  it('rejects a missing nonce when one is expected', async () => {
    const token = await signIdToken({ sub: 'u-1' });
    await expect(verifyIdToken(token, { nonce: 'nonce-expected' })).rejects.toMatchObject({
      code: 'token_nonce_mismatch',
    });
  });

  it('rejects a token without subject', async () => {
    const token = await signIdToken({ email: 'nobody@vereint.local' });
    await expect(verifyIdToken(token)).rejects.toMatchObject({ code: 'token_missing_subject' });
  });

  it('rejects an empty token', async () => {
    await expect(verifyIdToken('')).rejects.toMatchObject({ code: 'token_missing' });
  });

  it('verifies access tokens through azp instead of audience', async () => {
    const valid = await signAccessToken({ sub: 'u-2', realm_access: { roles: ['member'] } });
    await expect(verifyAccessToken(valid)).resolves.toMatchObject({ sub: 'u-2' });

    const foreignAzp = await signAccessToken({ sub: 'u-2' }, { authorizedParty: 'other-client' });
    await expect(verifyAccessToken(foreignAzp)).rejects.toMatchObject({ code: 'token_azp_mismatch' });
  });
});
