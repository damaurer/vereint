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
 * Das Caddyfile des AWS-Wegs erlaubt große Bodies nur auf dem Upload-Pfad der
 * Moment-Medien. Läuft der Pfad dort und im BFF auseinander, weist Caddy jeden
 * Upload über 8 MB mit 413 ab (#68). Die Suite liest die Regex aus dem
 * Caddyfile und prüft sie gegen dieselben Pfade wie MOMENT_MEDIA_PATH.
 */
describe('Caddyfile Body-Limit für Moment-Medien', () => {
  const caddyfile = readFileSync(findRepoFile('deploy/Caddyfile'), 'utf8');

  const matcherRegex = (pattern: RegExp): RegExp => {
    const match = caddyfile.match(pattern);
    expect(match, `Matcher ${pattern} fehlt im Caddyfile`).not.toBeNull();
    return new RegExp(match![1]);
  };

  const mediaUpload = matcherRegex(/^\s*@momentMedia\s+path_regexp\s+\S+\s+(\S+)\s*$/m);
  const otherRequests = matcherRegex(/^\s*@otherRequests\s+not\s+path_regexp\s+(\S+)\s*$/m);

  const uploadPath = '/api/v1/moments/m-1/media';

  it('lässt große Bodies auf dem echten Upload-Pfad des BFF zu', () => {
    expect(MOMENT_MEDIA_PATH.test(uploadPath)).toBe(true);
    expect(mediaUpload.test(uploadPath)).toBe(true);
    // @otherRequests ist negiert: der Upload-Pfad darf dort nicht unter das 8-MB-Limit fallen.
    expect(otherRequests.test(uploadPath)).toBe(true);
  });

  it('begrenzt alle anderen Anfragen weiter auf das kleine Limit', () => {
    for (const path of [
      '/api/v1/moments/m-1/responses',
      '/api/v1/moments/m-1/media/abc/content',
      '/api/v1/events/e-1/moments/m-1/media',
      '/api/v1/members/me/avatar',
      '/',
    ]) {
      expect(mediaUpload.test(path), path).toBe(false);
    }
  });

  it('nutzt für beide Matcher dieselbe Regex', () => {
    expect(otherRequests.source).toBe(mediaUpload.source);
  });

  it('setzt 110MB für Medien und 8MB für den Rest', () => {
    expect(caddyfile).toMatch(/request_body @momentMedia \{\s*max_size 110MB\s*\}/);
    expect(caddyfile).toMatch(/request_body @otherRequests \{\s*max_size 8MB\s*\}/);
  });
});
