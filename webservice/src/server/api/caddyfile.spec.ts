import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOMENT_MEDIA_PATH } from './api-proxy.middleware';

function findRepoFile(relativePath: string): string {
  const fromCwd = resolve(process.cwd(), relativePath);
  if (existsSync(fromCwd)) return fromCwd;
  const fromParent = resolve(process.cwd(), '..', relativePath);
  if (existsSync(fromParent)) return fromParent;
  return resolve(__dirname, '../../../../', relativePath);
}

/**
 * Caddy (lokaler und E2E-Stack) erlaubt große Körper nur auf dem Upload-Pfad
 * für Moment-Dateien. Auf dem Strato-Server gilt dieselbe Regel in Traefik
 * (Rolle vereint in LinuxServerSetup). Weicht der Pfad im Caddyfile vom echten Upload-Pfad ab,
 * scheitern Videos über 8 MB mit 413 (Issue #68).
 */
describe('local/Caddyfile', () => {
  const caddyfile = readFileSync(findRepoFile('local/Caddyfile'), 'utf8');

  function regexOf(line: RegExp): RegExp {
    const match = caddyfile.match(line);
    expect(match, `Zeile ${line} fehlt im Caddyfile`).not.toBeNull();
    return new RegExp(match![1]);
  }

  const momentMedia = regexOf(/@momentMedia path_regexp momentMedia (\S+)/);
  const otherRequests = regexOf(/@otherRequests not path_regexp (\S+)/);
  const uploadPath = '/api/v1/moments/0b4f6a8e-6d0e-4c61-9d5e-1f0a2b3c4d5e/media';

  it('erlaubt große Körper genau auf dem Upload-Pfad des BFF', () => {
    expect(MOMENT_MEDIA_PATH.test(uploadPath)).toBe(true);
    expect(momentMedia.test(uploadPath)).toBe(true);
    expect(otherRequests.test(uploadPath)).toBe(true); // „not“ im Caddyfile: Upload ist ausgenommen
  });

  it('beide Matcher nutzen denselben Ausdruck', () => {
    expect(momentMedia.source).toBe(otherRequests.source);
  });

  it('andere API-Pfade bleiben beim kleinen Limit', () => {
    for (const path of [
      '/api/v1/moments/abc',
      '/api/v1/moments/abc/media/def/content',
      '/api/v1/stammtisch/image',
      '/api/v1/events/abc/moments/def/media',
    ]) {
      expect(momentMedia.test(path), path).toBe(false);
    }
  });

  it('setzt 110MB für Uploads und 8MB für alles andere', () => {
    expect(caddyfile).toMatch(/request_body @momentMedia \{\s*max_size 110MB\s*\}/);
    expect(caddyfile).toMatch(/request_body @otherRequests \{\s*max_size 8MB\s*\}/);
  });
});
