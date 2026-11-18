import compression from 'compression';
import express from 'express';
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SessionData } from '../auth/auth.types';
import { applyTestEnvironmentOverrides } from '../config/environment';
import { LIVE_PATH, liveStreamProxy } from './api-proxy.middleware';

/**
 * Live-Verbindung (Server-Sent Events) gegen einen echten HTTP-Server als
 * Fachservice-Ersatz: Ereignisse müssen einzeln und sofort durchkommen, auch
 * hinter der Kompression des BFF.
 */
describe('liveStreamProxy', () => {
  let upstream: Server;
  let app: Server;
  let baseUrl: string;
  let injectedSession: SessionData | undefined;
  let upstreamResponse: ServerResponse | null;
  let upstreamHeaders: IncomingMessage['headers'] | null;
  let upstreamClosed: Promise<void>;

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
      upstreamHeaders = req.headers;
      upstreamClosed = new Promise((resolve) => res.on('close', () => resolve()));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('event: ready\ndata: {}\n\n');
      upstreamResponse = res;
    });
    const upstreamPort = await listen(upstream);
    applyTestEnvironmentOverrides({ springApiBaseUrl: `http://127.0.0.1:${upstreamPort}` });

    const expressApp = express();
    // Wie in server.ts: Kompression vor dem Proxy darf die Ereignisse nicht puffern.
    expressApp.use(compression());
    expressApp.use((req, _res, next) => {
      req.sessionData = injectedSession;
      next();
    });
    expressApp.use(LIVE_PATH, liveStreamProxy);
    app = createServer(expressApp);
    baseUrl = `http://127.0.0.1:${await listen(app)}`;
  });

  afterAll(async () => {
    app.closeAllConnections();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  beforeEach(() => {
    injectedSession = session;
    upstreamResponse = null;
    upstreamHeaders = null;
  });

  /** Öffnet die Verbindung und liefert jeden ankommenden Block. */
  function open(): Promise<{ response: IncomingMessage; next: () => Promise<string>; close: () => void }> {
    return new Promise((resolve, reject) => {
      const req = request(`${baseUrl}${LIVE_PATH}`, {
        headers: { accept: 'text/event-stream', 'accept-encoding': 'gzip' },
      });
      req.on('response', (response) => {
        const queue: string[] = [];
        const waiting: ((chunk: string) => void)[] = [];
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          const waiter = waiting.shift();
          if (waiter) waiter(chunk);
          else queue.push(chunk);
        });
        resolve({
          response,
          next: () =>
            new Promise((done) => {
              const chunk = queue.shift();
              if (chunk !== undefined) done(chunk);
              else waiting.push(done);
            }),
          close: () => req.destroy(),
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('streams events immediately, uncompressed, with the session token', async () => {
    const stream = await open();
    expect(stream.response.statusCode).toBe(200);
    expect(stream.response.headers['content-type']).toContain('text/event-stream');
    expect(stream.response.headers['content-encoding']).toBeUndefined();
    expect(stream.response.headers['cache-control']).toContain('no-transform');
    expect(upstreamHeaders?.authorization).toBe('Bearer token-xyz');
    expect(upstreamHeaders?.accept).toBe('text/event-stream');

    expect(await stream.next()).toContain('event: ready');
    upstreamResponse!.write('event: chat\ndata: {"conversationId":"c1"}\n\n');
    expect(await stream.next()).toContain('event: chat');

    stream.close();
    // Schließt der Browser, endet auch die Verbindung zum Fachservice.
    await upstreamClosed;
  });

  it('answers 401 without a session', async () => {
    injectedSession = undefined;
    const response = await fetch(`${baseUrl}${LIVE_PATH}`);
    expect(response.status).toBe(401);
    expect(upstreamHeaders).toBeNull();
  });

  it('only allows GET', async () => {
    const response = await fetch(`${baseUrl}${LIVE_PATH}`, { method: 'POST' });
    expect(response.status).toBe(405);
  });
});
