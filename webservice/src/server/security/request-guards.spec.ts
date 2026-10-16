import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiRateLimits,
  crossSiteRequestGuard,
  rateLimit,
  resetRateLimits,
} from './request-guards';

describe('request-guards', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  let host: string;

  const tinyLimit = rateLimit({ name: 'test', windowMs: 60_000, max: 2 });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    app = express();
    app.use(crossSiteRequestGuard);
    app.use('/api', apiRateLimits);
    app.use('/tiny', tinyLimit);
    app.use((_req, res) => {
      res.status(200).json({ ok: true });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          host = `127.0.0.1:${addr.port}`;
          baseUrl = `http://${host}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => resetRateLimits());

  describe('crossSiteRequestGuard', () => {
    it('allows same-origin writes', async () => {
      const response = await fetch(`${baseUrl}/api/v1/events`, {
        method: 'POST',
        headers: { origin: baseUrl, 'sec-fetch-site': 'same-origin' },
      });
      expect(response.status).toBe(200);
    });

    it('allows writes without browser headers (no foreign session cookie possible)', async () => {
      const response = await fetch(`${baseUrl}/api/v1/events`, { method: 'POST' });
      expect(response.status).toBe(200);
    });

    it.each(['same-site', 'cross-site'])('blocks writes with Sec-Fetch-Site %s', async (site) => {
      const response = await fetch(`${baseUrl}/api/v1/ledger/topups`, {
        method: 'POST',
        headers: { 'sec-fetch-site': site },
      });
      expect(response.status).toBe(403);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe('cross_site_request');
    });

    it('blocks writes whose Origin differs from the host (older browsers)', async () => {
      const response = await fetch(`${baseUrl}/api/v1/events`, {
        method: 'DELETE',
        headers: { origin: 'https://evil.example.org' },
      });
      expect(response.status).toBe(403);
    });

    it('blocks the opaque null origin', async () => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { origin: 'null' },
      });
      expect(response.status).toBe(403);
    });

    it('never blocks reads', async () => {
      const response = await fetch(`${baseUrl}/api/v1/events`, {
        headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example.org' },
      });
      expect(response.status).toBe(200);
    });

    it('lets the OIDC callback through', async () => {
      const response = await fetch(`${baseUrl}/api/auth/callback`, {
        method: 'POST',
        headers: { 'sec-fetch-site': 'cross-site' },
      });
      expect(response.status).toBe(200);
    });

    it('uses the Host header for the comparison', async () => {
      const response = await fetch(`${baseUrl}/api/v1/events`, {
        method: 'POST',
        headers: { origin: `http://${host}` },
      });
      expect(response.status).toBe(200);
    });
  });

  describe('rateLimit', () => {
    it('answers 429 with Retry-After once the window is used up', async () => {
      expect((await fetch(`${baseUrl}/tiny`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/tiny`)).status).toBe(200);

      const limited = await fetch(`${baseUrl}/tiny`);
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(limited.headers.get('content-type')).toContain('application/problem+json');
    });

    it('limits guessing on public token endpoints per client', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 31; attempt++) {
        const response = await fetch(`${baseUrl}/api/v1/member-invites/preview`, { method: 'POST' });
        statuses.push(response.status);
      }
      expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
      expect(statuses[30]).toBe(429);

      // Andere API-Pfade bleiben davon unberührt.
      expect((await fetch(`${baseUrl}/api/v1/events`)).status).toBe(200);
    });

    it('limits the open signup per client like the invite registration', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 31; attempt++) {
        const response = await fetch(`${baseUrl}/api/v1/signup`, { method: 'POST' });
        statuses.push(response.status);
      }
      expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
      expect(statuses[30]).toBe(429);
    });
  });
});
