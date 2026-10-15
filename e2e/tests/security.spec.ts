import { test, expect } from '../support/fixtures';

test.describe('Auslieferung und Sicherheit', () => {
  test('Sicherheitsheader und CSP mit Nonce fuer alle Inline-Skripte', async ({ as }) => {
    const { page } = await as('member');
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy|blocked/i.test(message.text())) violations.push(message.text());
    });

    const response = await page.goto('/dashboard');
    const headers = response!.headers();
    expect(headers['strict-transport-security']).toContain('max-age=31536000');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['permissions-policy']).toContain('camera=(self)');
    expect(headers['permissions-policy']).toContain('geolocation=()');

    const csp = headers['content-security-policy'];
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, 'CSP enthaelt eine Nonce').toBeTruthy();

    const html = await response!.text();
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>/g)].map((m) => m[0]);
    for (const tag of inlineScripts) {
      expect(tag, 'Inline-Skript ohne gueltige Nonce').toContain(`nonce="${nonce}"`);
    }

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Das globale Stylesheet ist aktiv (nicht als `media="print"` geparkt).
    const media = await page.locator('link[rel="stylesheet"]').evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).media || 'all'),
    );
    expect(media).not.toContain('print');
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Segoe UI');
    expect(violations).toEqual([]);
  });

  test('Service Worker ist erreichbar und wird registriert', async ({ as }) => {
    const { page } = await as('member');
    const sw = await page.request.get('/vereint-sw.js');
    expect(sw.status()).toBe(200);
    expect(sw.headers()['content-type']).toContain('javascript');

    await page.goto('/dashboard');
    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.scope;
    });
    expect(scope).toMatch(/\/$/);
  });

  test('Keycloak-Verwaltung ist von aussen nicht erreichbar', async ({ request }) => {
    expect((await request.get('/kc/admin/')).status()).toBe(404);
    expect((await request.get('/kc/realms/master/.well-known/openid-configuration')).status()).toBe(404);
    expect((await request.get('/kc/realms/vereint/.well-known/openid-configuration')).status()).toBe(200);
    expect((await request.post('/kc/realms/vereint/clients-registrations/openid-connect', { data: {} })).status()).toBe(404);
  });

  test('Schreibende Anfragen von fremden Seiten werden abgewiesen', async ({ as }) => {
    const { context } = await as('member');

    const crossSite = await context.request.post('/api/v1/e2e-not-found', {
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
      data: {},
    });
    expect(crossSite.status()).toBe(403);
    expect(await crossSite.json()).toMatchObject({ code: 'cross_site_request' });

    // Dieselbe Anfrage von der eigenen Seite erreicht den Fachservice (404).
    const sameOrigin = await context.request.post('/api/v1/e2e-not-found', {
      headers: { 'sec-fetch-site': 'same-origin' },
      data: {},
    });
    expect(sameOrigin.status()).toBe(404);
  });

  test('API-Pfade koennen nicht aus /api/v1 ausbrechen', async ({ as }) => {
    const { context } = await as('admin');
    const traversal = await context.request.get('/api/v1/users%2f..%2f..%2fv3%2fapi-docs');
    expect(traversal.status()).toBe(400);
  });

  test('API ohne Session antwortet mit 401, Health ist oeffentlich', async ({ request }) => {
    const health = await request.get('/api/v1/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'UP' });

    const me = await request.get('/api/v1/users/me');
    expect(me.status()).toBe(401);
    expect(await me.json()).toMatchObject({ code: 'oidc_session_expired' });
  });

  test('Session-Cookie ist HttpOnly, Secure und SameSite', async ({ as }) => {
    const { context } = await as('member');
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === 'vereint_session');
    expect(session).toBeDefined();
    expect(session!.httpOnly).toBe(true);
    expect(session!.secure).toBe(true);
    expect(['Lax', 'Strict']).toContain(session!.sameSite);
  });
});
