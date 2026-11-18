import express from 'express';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QS_ASSET_PATHS, stageAssetPath, stageAssets } from './stage-assets.middleware';

describe('stageAssetPath', () => {
  it('leaves every path untouched in production', () => {
    for (const path of QS_ASSET_PATHS.keys()) {
      expect(stageAssetPath('prod', path)).toBeUndefined();
    }
  });

  it('maps manifest and icons to the QS variants', () => {
    expect(stageAssetPath('qs', '/manifest.webmanifest')).toBe('/qs/manifest.webmanifest');
    expect(stageAssetPath('qs', '/icons/apple-touch-icon.png')).toBe('/qs/icons/apple-touch-icon.png');
    expect(stageAssetPath('qs', '/dashboard')).toBeUndefined();
    expect(stageAssetPath('qs', '/vereint-sw.js')).toBeUndefined();
  });

  it('points only to files that exist in public/', () => {
    const publicDir = resolve(import.meta.dirname, '../../../public');
    for (const [source, target] of QS_ASSET_PATHS) {
      expect(existsSync(join(publicDir, source)), source).toBe(true);
      expect(existsSync(join(publicDir, target)), target).toBe(true);
    }
  });

  it('names the QS app differently than production', () => {
    const publicDir = resolve(import.meta.dirname, '../../../public');
    const prod = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8'));
    const qs = JSON.parse(readFileSync(join(publicDir, 'qs/manifest.webmanifest'), 'utf8'));
    expect(prod.name).toBe('Vereint');
    expect(qs.name).toBe('Vereint QS');
    expect(qs.short_name).toBe('Vereint QS');
    expect(qs.icons).toEqual(prod.icons);
  });
});

describe('stageAssets middleware', () => {
  let dir: string;
  const servers: Server[] = [];

  async function start(stage: 'prod' | 'qs'): Promise<string> {
    const app = express();
    app.use(stageAssets(stage));
    app.use(express.static(dir));
    const server = await new Promise<Server>((done) => {
      const listening = app.listen(0, '127.0.0.1', () => done(listening));
    });
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'stage-assets-'));
    mkdirSync(join(dir, 'qs'));
    writeFileSync(join(dir, 'manifest.webmanifest'), 'prod');
    writeFileSync(join(dir, 'qs/manifest.webmanifest'), 'qs');
  });

  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise((done) => server.close(done))));
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the production manifest without APP_STAGE=qs', async () => {
    const base = await start('prod');
    expect(await (await fetch(`${base}/manifest.webmanifest`)).text()).toBe('prod');
  });

  it('serves the QS manifest under the same address, query included', async () => {
    const base = await start('qs');
    expect(await (await fetch(`${base}/manifest.webmanifest`)).text()).toBe('qs');
    expect(await (await fetch(`${base}/manifest.webmanifest?v=2`)).text()).toBe('qs');
  });
});
