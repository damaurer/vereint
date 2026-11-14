import {
  isBypassedRequest,
  isCacheableAssetPath,
  isImmutableHashedAsset,
  isPrivateResponse,
} from './service-worker-cache-policy';

describe('service-worker-cache-policy', () => {
  describe('isCacheableAssetPath', () => {
    it('accepts hashed build artefacts and static assets', () => {
      expect(isCacheableAssetPath('/main-ABC12345.js')).toBe(true);
      expect(isCacheableAssetPath('/styles-deadbeef.css')).toBe(true);
      expect(isCacheableAssetPath('/chunk-1.mjs')).toBe(true);
      expect(isCacheableAssetPath('/assets/logo.svg')).toBe(true);
      expect(isCacheableAssetPath('/fonts/inter.woff2')).toBe(true);
      expect(isCacheableAssetPath('/favicon.ico')).toBe(true);
      expect(isCacheableAssetPath('/media/photo.webp')).toBe(true);
    });

    it('rejects /api paths even with a known extension', () => {
      expect(isCacheableAssetPath('/api/v1/events.json')).toBe(false);
      expect(isCacheableAssetPath('/api/v1/report.css')).toBe(false);
    });

    it('rejects the app-shell and dynamic routes without an asset extension', () => {
      expect(isCacheableAssetPath('/')).toBe(false);
      expect(isCacheableAssetPath('/board/treasury')).toBe(false);
      expect(isCacheableAssetPath('')).toBe(false);
    });
  });

  describe('isBypassedRequest', () => {
    it('bypasses non-GET requests', () => {
      expect(isBypassedRequest('/main.js', 'POST', true)).toBe(true);
      expect(isBypassedRequest('/', 'PUT', true)).toBe(true);
      expect(isBypassedRequest('/', 'DELETE', true)).toBe(true);
    });

    it('bypasses cross-origin requests', () => {
      expect(isBypassedRequest('/main.js', 'GET', false)).toBe(true);
    });

    it('bypasses everything under /api/', () => {
      expect(isBypassedRequest('/api/v1/ledger', 'GET', true)).toBe(true);
    });

    it('does not bypass same-origin GET requests to the app-shell or assets', () => {
      expect(isBypassedRequest('/', 'GET', true)).toBe(false);
      expect(isBypassedRequest('/main-ABC12345.js', 'GET', true)).toBe(false);
      expect(isBypassedRequest('/main.js', 'get', true)).toBe(false);
    });
  });

  describe('isPrivateResponse', () => {
    it('treats no-store and private as private', () => {
      expect(isPrivateResponse('no-store')).toBe(true);
      expect(isPrivateResponse('private, no-store')).toBe(true);
      expect(isPrivateResponse('private')).toBe(true);
      expect(isPrivateResponse('PRIVATE, NO-STORE')).toBe(true);
    });

    it('treats public/immutable and missing headers as cacheable', () => {
      expect(isPrivateResponse('public, max-age=31536000, immutable')).toBe(false);
      expect(isPrivateResponse('no-cache')).toBe(false);
      expect(isPrivateResponse(null)).toBe(false);
      expect(isPrivateResponse(undefined)).toBe(false);
      expect(isPrivateResponse('')).toBe(false);
    });
  });

  describe('isImmutableHashedAsset', () => {
    it('detects hashed immutable artefacts', () => {
      expect(isImmutableHashedAsset('/main-ABC12345.js')).toBe(true);
      expect(isImmutableHashedAsset('/styles.deadbeef99.css')).toBe(true);
      expect(isImmutableHashedAsset('/main-5RAM3QJT.js')).toBe(true);
      expect(isImmutableHashedAsset('/chunk-QWERTYUI.js')).toBe(true);
    });

    it('does not treat unhashed assets or the app-shell as immutable', () => {
      expect(isImmutableHashedAsset('/favicon.ico')).toBe(false);
      expect(isImmutableHashedAsset('/icons/icon-maskable-512.png')).toBe(false);
      expect(isImmutableHashedAsset('/vereint-something.png')).toBe(false);
      expect(isImmutableHashedAsset('/')).toBe(false);
      expect(isImmutableHashedAsset('/api/v1/main-ABC12345.js')).toBe(false);
    });
  });
});
