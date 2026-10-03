import { describe, expect, it, vi } from 'vitest';
import {
  assertServerEnvironment,
  collectServerEnvironmentErrors,
  loadEnvFile,
  MINIMUM_SESSION_SECRET_BYTES,
  resolveServerEnvironment,
} from './environment';

const VALID_SESSION_SECRET = 'a'.repeat(MINIMUM_SESSION_SECRET_BYTES);

const completeEnv = {
  KEYCLOAK_CLIENT_SECRET: 'client-secret',
  SESSION_SECRET: VALID_SESSION_SECRET,
};

describe('loadEnvFile', () => {
  it('probes candidate paths when no explicit path is passed', () => {
    const attemptedPaths: string[] = [];
    const originalLoadEnvFile = process.loadEnvFile;
    process.loadEnvFile = (p?: string) => {
      attemptedPaths.push(p ?? '');
      if (p === '../.env') return;
      throw new Error('File not found');
    };

    try {
      loadEnvFile();
      expect(attemptedPaths).toEqual(['.env', '../.env']);
    } finally {
      process.loadEnvFile = originalLoadEnvFile;
    }
  });

  it('loads a custom path when specified', () => {
    const attemptedPaths: string[] = [];
    const originalLoadEnvFile = process.loadEnvFile;
    process.loadEnvFile = (p?: string) => {
      attemptedPaths.push(p ?? '');
    };

    try {
      loadEnvFile('custom/.env');
      expect(attemptedPaths).toEqual(['custom/.env']);
    } finally {
      process.loadEnvFile = originalLoadEnvFile;
    }
  });
});

describe('resolveServerEnvironment', () => {
  it('reads the develop values from the environment variables', () => {
    const env = resolveServerEnvironment({
      ...completeEnv,
      NODE_ENV: 'development',
      PORT: '4300',
      SESSION_COOKIE_NAME: 'custom_session',
      SESSION_DURATION_DAYS: '5',
      SESSION_COOKIE_SECURE: 'false',
    });

    expect(env).toMatchObject({
      port: 4300,
      production: false,
      sessionCookieName: 'custom_session',
      sessionDurationMs: 5 * 24 * 60 * 60 * 1000,
      sessionCookieSecure: false,
    });
  });

  it('secures the session cookie in production by default', () => {
    const env = resolveServerEnvironment({ ...completeEnv, NODE_ENV: 'production' });

    expect(env).toMatchObject({
      production: true,
      sessionCookieSecure: true,
    });
  });

  it('defaults the session TTL to 24 hours, matching the Keycloak SSO lifespan', () => {
    const env = resolveServerEnvironment({ ...completeEnv, PORT: 'not-a-port' });

    expect(env.port).toBe(4300);
    expect(env.sessionCookieName).toBe('vereint_session');
    expect(env.sessionDurationMs).toBe(24 * 60 * 60 * 1000);
    expect(env.keycloakRealm).toBe('vereint');
    expect(env.keycloakClientId).toBe('vereint-web');
    expect(env.keycloakIssuerUri).toBe('http://localhost:8082/realms/vereint');
  });

  it('never falls back to a default client or session secret', () => {
    const env = resolveServerEnvironment({});

    expect(env.keycloakClientSecret).toBe('');
    expect(env.sessionSecretCurrent).toBe('');
    expect(env.sessionSecretPrevious).toBeNull();
  });

  it('reads Keycloak, timeout and minute-based session configuration', () => {
    const env = resolveServerEnvironment({
      ...completeEnv,
      KEYCLOAK_REALM: 'custom-realm',
      KEYCLOAK_ISSUER_URI: 'https://auth.example.com/realms/custom-realm',
      KEYCLOAK_CLIENT_ID: 'custom-client',
      KEYCLOAK_CLIENT_SECRET: 'custom-secret',
      KEYCLOAK_REQUEST_TIMEOUT_MS: '1500',
      KEYCLOAK_REQUEST_RETRIES: '2',
      SESSION_DURATION_MINUTES: '60',
      PUBLIC_BASE_URL: 'https://app.example.com',
      SPRING_API_BASE_URL: 'https://api.example.com',
    });

    expect(env.keycloakRealm).toBe('custom-realm');
    expect(env.keycloakIssuerUri).toBe('https://auth.example.com/realms/custom-realm');
    expect(env.keycloakClientId).toBe('custom-client');
    expect(env.keycloakClientSecret).toBe('custom-secret');
    expect(env.keycloakRequestTimeoutMs).toBe(1500);
    expect(env.keycloakRequestRetries).toBe(2);
    expect(env.sessionDurationMs).toBe(60 * 60 * 1000);
    expect(env.publicBaseUrl).toBe('https://app.example.com');
    expect(env.springApiBaseUrl).toBe('https://api.example.com');
  });

  it('defaults the Keycloak request timeout to 3000 ms', () => {
    const env = resolveServerEnvironment(completeEnv);
    expect(env.keycloakRequestTimeoutMs).toBe(3000);
    expect(env.keycloakRequestRetries).toBe(1);
  });

  it('prefers SESSION_SECRET_CURRENT and keeps the previous key for rotation', () => {
    const previous = 'b'.repeat(MINIMUM_SESSION_SECRET_BYTES);
    const env = resolveServerEnvironment({
      ...completeEnv,
      SESSION_SECRET_CURRENT: VALID_SESSION_SECRET,
      SESSION_SECRET_PREVIOUS: previous,
      SESSION_SECRET: 'ignored-because-current-is-set',
    });

    expect(env.sessionSecretCurrent).toBe(VALID_SESSION_SECRET);
    expect(env.sessionSecretPrevious).toBe(previous);
  });
});

describe('assertServerEnvironment', () => {
  it('accepts a complete configuration', () => {
    const env = resolveServerEnvironment(completeEnv);
    expect(collectServerEnvironmentErrors(env)).toEqual([]);
    expect(() => assertServerEnvironment(env)).not.toThrow();
  });

  it('aborts the start when the Keycloak client secret is missing', () => {
    const env = resolveServerEnvironment({ SESSION_SECRET: VALID_SESSION_SECRET });

    expect(collectServerEnvironmentErrors(env)).toContain('KEYCLOAK_CLIENT_SECRET fehlt.');
    expect(() => assertServerEnvironment(env)).toThrowError(/server_environment_invalid/);
  });

  it('aborts the start when the session secret is missing', () => {
    const missing = resolveServerEnvironment({ KEYCLOAK_CLIENT_SECRET: 'client-secret' });
    expect(() => assertServerEnvironment(missing)).toThrowError(/SESSION_SECRET/);
    expect(() => assertServerEnvironment(missing)).toThrowError(/npm run env:prepare/);
  });

  it('aborts the production start when the session secret is too short', () => {
    const tooShort = {
      KEYCLOAK_CLIENT_SECRET: 'client-secret',
      SESSION_SECRET: 'a'.repeat(MINIMUM_SESSION_SECRET_BYTES - 1),
    };

    const production = resolveServerEnvironment({
      ...tooShort,
      NODE_ENV: 'production',
      SESSION_COOKIE_SECURE: 'true',
    });
    expect(collectServerEnvironmentErrors(production)).toContain('SESSION_SECRET ist kürzer als 32 Byte.');
    expect(() => assertServerEnvironment(production)).toThrowError(/kürzer als 32 Byte/);

    // Lokal wird die Längenvorgabe nur protokolliert, damit generierte
    // Platzhalter den Entwicklungsstart nicht blockieren.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const development = resolveServerEnvironment(tooShort);
    expect(() => assertServerEnvironment(development)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('kürzer als 32 Byte'));
    warn.mockRestore();
  });

  it('rejects a previous session secret that is invalid or identical', () => {
    const identical = resolveServerEnvironment({
      ...completeEnv,
      SESSION_SECRET_PREVIOUS: VALID_SESSION_SECRET,
    });
    expect(() => assertServerEnvironment(identical)).toThrowError(/identisch/);

    const tooShort = resolveServerEnvironment({
      ...completeEnv,
      NODE_ENV: 'production',
      SESSION_COOKIE_SECURE: 'true',
      SESSION_SECRET_PREVIOUS: 'short',
    });
    expect(() => assertServerEnvironment(tooShort)).toThrowError(/SESSION_SECRET_PREVIOUS/);
  });

  it('requires a secure session cookie in production', () => {
    const env = resolveServerEnvironment({
      ...completeEnv,
      NODE_ENV: 'production',
      SESSION_COOKIE_SECURE: 'false',
    });

    expect(collectServerEnvironmentErrors(env)).toContain(
      'SESSION_COOKIE_SECURE muss in Produktion aktiv sein.',
    );
  });
});
