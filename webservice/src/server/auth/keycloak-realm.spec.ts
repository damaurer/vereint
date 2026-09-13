import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function findRepoFile(relativePath: string): string {
  const fromCwd = resolve(process.cwd(), relativePath);
  if (existsSync(fromCwd)) return fromCwd;
  const fromParent = resolve(process.cwd(), '..', relativePath);
  if (existsSync(fromParent)) return fromParent;
  return resolve(__dirname, '../../../../', relativePath);
}

/**
 * Härtungsprüfungen des Realm-Exports. Die Suite erkennt Regressionen wie
 * Wildcard-Redirects, offene Web-Origins, reaktivierte Direct Access Grants,
 * fehlende Refresh-Token-Rotation oder eingebettete Klartext-Secrets.
 */
describe('Keycloak Realm Configuration', () => {
  const realmPath = findRepoFile('keycloak/realm-export.json');
  const devRealmPath = findRepoFile('keycloak/dev/realm-export-dev.json');
  let realmConfig: any;
  let devRealmConfig: any;

  const readRealm = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

  /** Nur Platzhalter der Form `${ENV_VAR}` sind erlaubt. */
  const isEnvPlaceholder = (value: unknown): boolean =>
    typeof value === 'string' && /^\$\{[A-Z0-9_]+\}$/.test(value);

  beforeAll(() => {
    realmConfig = readRealm(realmPath);
    devRealmConfig = readRealm(devRealmPath);
  });

  it('has valid realm name and base settings', () => {
    expect(realmConfig.realm).toBe('vereint');
    expect(realmConfig.enabled).toBe(true);
    expect(realmConfig.rememberMe).toBe(true);
    expect(realmConfig.resetPasswordAllowed).toBe(true);
  });

  it('requires TLS at least for external requests', () => {
    for (const config of [realmConfig, devRealmConfig]) {
      expect(['external', 'all']).toContain(config.sslRequired);
    }
  });

  it('rotates refresh tokens without reuse', () => {
    for (const config of [realmConfig, devRealmConfig]) {
      expect(config.revokeRefreshToken).toBe(true);
      expect(config.refreshTokenMaxReuse).toBe(0);
    }
  });

  it('keeps the SSO lifespan aligned with the Express session TTL of 24 hours', () => {
    for (const config of [realmConfig, devRealmConfig]) {
      expect(config.ssoSessionMaxLifespan).toBe(86400);
      expect(config.ssoSessionMaxLifespanRememberMe).toBe(86400);
      expect(config.accessTokenLifespan).toBe(300);
    }
  });

  it('enforces a strict brute force threshold', () => {
    for (const config of [realmConfig, devRealmConfig]) {
      expect(config.bruteForceProtected).toBe(true);
      expect(config.failureFactor).toBeLessThanOrEqual(10);
      expect(config.failureFactor).toBeGreaterThanOrEqual(5);
      expect(config.maxTemporaryLockouts).toBeGreaterThan(0);
      expect(config.waitIncrementSeconds).toBeGreaterThanOrEqual(60);
    }
  });

  it('defines all required realm roles according to the specifications', () => {
    const roles: string[] = realmConfig.roles.realm.map((r: any) => r.name);

    // UserRole
    expect(roles).toContain('member');
    expect(roles).toContain('board');
    expect(roles).toContain('admin');

    // BoardRole
    expect(roles).toContain('chair');
    expect(roles).toContain('treasurer');
    expect(roles).toContain('secretary');
    expect(roles).toContain('assessor');

    // Technical Context Role
    expect(roles).toContain('tabletRecorder');
  });

  it('configures default role to include member', () => {
    const defaultRole = realmConfig.roles.realm.find((r: any) => r.name === 'default-roles-vereint');
    expect(defaultRole).toBeDefined();
    expect(defaultRole.composite).toBe(true);
    expect(defaultRole.composites.realm).toContain('member');
  });

  it('configures vereint-web client with PKCE S256 and Standard Flow', () => {
    const webClient = realmConfig.clients.find((c: any) => c.clientId === 'vereint-web');
    expect(webClient).toBeDefined();
    expect(webClient.enabled).toBe(true);
    expect(webClient.standardFlowEnabled).toBe(true);
    expect(webClient.implicitFlowEnabled).toBe(false);
    expect(webClient.publicClient).toBe(false);
    expect(webClient.attributes['pkce.code.challenge.method']).toBe('S256');
    expect(webClient.redirectUris).toEqual(
      expect.arrayContaining([
        'http://localhost:8080/api/auth/callback',
        'http://localhost:8080/login/oauth2/code/keycloak',
      ]),
    );
  });

  it('never uses wildcard redirect URIs or open web origins', () => {
    for (const config of [realmConfig, devRealmConfig]) {
      for (const client of config.clients) {
        for (const uri of client.redirectUris ?? []) {
          expect(uri).not.toContain('*');
          expect(uri).toMatch(/^https?:\/\/[^*]+\/[^*]+$/);
        }
        for (const origin of client.webOrigins ?? []) {
          expect(origin).not.toBe('+');
          expect(origin).not.toBe('*');
          expect(origin).toMatch(/^https?:\/\//);
        }
      }
    }
  });

  it('declares explicit post logout redirect URIs without wildcards', () => {
    for (const config of [realmConfig, devRealmConfig]) {
      const webClient = config.clients.find((c: any) => c.clientId === 'vereint-web');
      const postLogout: string = webClient.attributes['post.logout.redirect.uris'];
      expect(postLogout).toBeDefined();
      expect(postLogout).not.toContain('*');
      expect(postLogout.split('##')).toContain('http://localhost:8080/web/login');
    }
  });

  it('disables direct access grants (password grant) for every client', () => {
    for (const config of [realmConfig, devRealmConfig]) {
      for (const client of config.clients) {
        expect(client.directAccessGrantsEnabled).toBe(false);
        expect(client.attributes?.['direct.access.grants.enabled'] ?? 'false').toBe('false');
      }
    }
  });

  it('configures vereint-service client as bearer-only backend API', () => {
    const serviceClient = realmConfig.clients.find((c: any) => c.clientId === 'vereint-service');
    expect(serviceClient).toBeDefined();
    expect(serviceClient.enabled).toBe(true);
    expect(serviceClient.bearerOnly).toBe(true);
    expect(serviceClient.standardFlowEnabled).toBe(false);
  });

  it('configures vereint-tablet as a service account client without browser flows', () => {
    const tabletClient = realmConfig.clients.find((c: any) => c.clientId === 'vereint-tablet');
    expect(tabletClient).toBeDefined();
    expect(tabletClient.enabled).toBe(true);
    expect(tabletClient.serviceAccountsEnabled).toBe(true);
    expect(tabletClient.standardFlowEnabled).toBe(false);
    expect(tabletClient.publicClient).toBe(false);
    expect(tabletClient.redirectUris).toEqual([]);
    expect(tabletClient.webOrigins).toEqual([]);

    const serviceAccount = realmConfig.users.find(
      (u: any) => u.serviceAccountClientId === 'vereint-tablet',
    );
    expect(serviceAccount).toBeDefined();
    expect(serviceAccount.realmRoles).toContain('tabletRecorder');
  });

  it('never contains a plaintext client secret', () => {
    for (const config of [realmConfig, devRealmConfig]) {
      for (const client of config.clients) {
        if (client.secret === undefined) continue;
        expect(isEnvPlaceholder(client.secret)).toBe(true);
      }
    }
  });

  it('keeps the production import free of seed users and credentials', () => {
    for (const user of realmConfig.users ?? []) {
      expect(user.credentials).toBeUndefined();
      expect(user.serviceAccountClientId).toBeDefined();
    }
  });

  it('provides development seed users with env-based temporary passwords', () => {
    const users = devRealmConfig.users;
    const adminUser = users.find((u: any) => u.username === 'admin');
    const boardUser = users.find((u: any) => u.username === 'board');
    const memberUser = users.find((u: any) => u.username === 'member');

    expect(adminUser).toBeDefined();
    expect(adminUser.realmRoles).toContain('admin');
    expect(adminUser.realmRoles).toContain('member');

    expect(boardUser).toBeDefined();
    expect(boardUser.realmRoles).toContain('board');
    expect(boardUser.realmRoles).toContain('treasurer');

    expect(memberUser).toBeDefined();
    expect(memberUser.realmRoles).toContain('member');

    for (const user of [adminUser, boardUser, memberUser]) {
      for (const credential of user.credentials) {
        expect(isEnvPlaceholder(credential.value)).toBe(true);
        expect(credential.temporary).toBe(true);
      }
    }
  });

  it('contains no known weak passwords in any import file', () => {
    for (const path of [realmPath, devRealmPath]) {
      const content = readFileSync(path, 'utf8');
      expect(content).not.toContain('password123');
      expect(content).not.toContain('vereint_web_secret');
      expect(content).not.toContain('vereint_tablet_secret');
    }
  });
});
