import express from 'express';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SessionData } from '../auth/auth.types';
import { applyTestEnvironmentOverrides } from '../config/environment';
import { MOMENT_MEDIA_PATH, mediaStreamProxy } from './api-proxy.middleware';

/**
 * Streaming-Proxy für Bilder und Videos in Moments gegen einen echten
 * HTTP-Server als Fachservice-Ersatz.
 */
describe('mediaStreamProxy', () => {
  let upstream: Server;
  let app: Server;
  let baseUrl: string;
  let injectedSession: SessionData | undefined;
  let lastUpstream: { method?: string; url?: string; headers: IncomingMessage['headers']; body: Buffer } | null;

  const session: SessionData = {
    sessionId: 'sess-1',
    uid: 'user-1',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    accessTokenExpiresAt: Date.now() + 60_000,
    tokens: { accessToken: 'token-xyz' },
    identity: { uid: 'user-1', roles: ['member'], drinkRecorder: false },
  };

  const listen = (server: Server) =>
    new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : 0);
      });
    });

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        lastUpstream = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) };
        if (req.method === 'POST') {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'media-1', size: Buffer.concat(chunks).length }));
          return;
        }
        if (req.headers.range === 'bytes=2-5') {
          res.writeHead(206, {
            'content-type': 'video/mp4',
            'content-length': '4',
            'content-range': 'bytes 2-5/10',
            'accept-ranges': 'bytes',
          });
          res.end('2345');
          return;
        }
        res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': '10' });
        res.end('0123456789');
      });
    });
    const upstreamPort = await listen(upstream);
    applyTestEnvironmentOverrides({ springApiBaseUrl: `http://127.0.0.1:${upstreamPort}` });

    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use((req, _res, next) => {
      req.sessionData = injectedSession;
      next();
    });
    expressApp.use('/api/v1', mediaStreamProxy);
    expressApp.use((_req, res) => {
      res.status(299).send('next');
    });
    app = createServer(expressApp);
    baseUrl = `http://127.0.0.1:${await listen(app)}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  beforeEach(() => {
    injectedSession = session;
    lastUpstream = null;
  });

  const mediaPath = '/api/v1/moments/m-1/media';

  it('matches only the upload and content paths of moment media', () => {
    expect(MOMENT_MEDIA_PATH.test(mediaPath)).toBe(true);
    expect(MOMENT_MEDIA_PATH.test(`${mediaPath}/abc/content`)).toBe(true);
    expect(MOMENT_MEDIA_PATH.test('/api/v1/moments/m-1/responses')).toBe(false);
    expect(MOMENT_MEDIA_PATH.test(`${mediaPath}/abc`)).toBe(false);
  });

  it('streams an upload with its length and the session token to the backend', async () => {
    const body = new Uint8Array(300_000).fill(7);
    const response = await fetch(`${baseUrl}${mediaPath}`, {
      method: 'POST',
      headers: { 'content-type': 'video/mp4', cookie: 'session=abc' },
      body,
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'media-1', size: 300_000 });
    expect(lastUpstream?.headers['authorization']).toBe('Bearer token-xyz');
    expect(lastUpstream?.headers['content-length']).toBe('300000');
    expect(lastUpstream?.headers['content-type']).toBe('video/mp4');
    expect(lastUpstream?.headers['cookie']).toBeUndefined();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('passes range requests through so videos can be played and scrubbed', async () => {
    const response = await fetch(`${baseUrl}${mediaPath}/media-1/content`, { headers: { range: 'bytes=2-5' } });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('content-length')).toBe('4');
    expect(await response.text()).toBe('2345');
    expect(lastUpstream?.headers['range']).toBe('bytes=2-5');
  });

  it('rejects requests without a session', async () => {
    injectedSession = undefined;
    const response = await fetch(`${baseUrl}${mediaPath}/media-1/content`);
    expect(response.status).toBe(401);
    expect(lastUpstream).toBeNull();
  });

  it('rejects uploads that are not photos or videos', async () => {
    const response = await fetch(`${baseUrl}${mediaPath}`, {
      method: 'POST',
      headers: { 'content-type': 'text/html' },
      body: '<p>hi</p>',
    });
    expect(response.status).toBe(415);
    expect(lastUpstream).toBeNull();
  });

  it('leaves other API paths to the regular proxy', async () => {
    const response = await fetch(`${baseUrl}/api/v1/moments/m-1/responses`, { method: 'POST' });
    expect(response.status).toBe(299);
  });
});
