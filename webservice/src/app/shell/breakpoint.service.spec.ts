import { afterEach, describe, expect, it, vi } from 'vitest';
import { BreakpointService } from './breakpoint.service';

/**
 * Nachweis der Breakpoint-Erkennung (TICKET-032). SSR/serverseitig und ohne
 * `matchMedia` bleibt der neutrale Default `web`; im Browser bestimmt
 * `matchMedia` den Viewport.
 */

interface FakeMql {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
}

function fakeMql(matches: boolean): FakeMql {
  return { matches, addEventListener: vi.fn(), addListener: vi.fn() };
}

/** Baut ein `matchMedia`, das mobile bzw. tablet je nach Query beantwortet. */
function stubMatchMedia(viewport: 'mobile' | 'tablet' | 'web'): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const isMobileQuery = query.includes('max-width: 640px') && !query.includes('min-width');
    if (isMobileQuery) return fakeMql(viewport === 'mobile');
    return fakeMql(viewport === 'tablet');
  });
}

describe('BreakpointService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('classifies widths into viewports (including boundaries)', () => {
    expect(BreakpointService.classify(320)).toBe('mobile');
    expect(BreakpointService.classify(640)).toBe('mobile');
    expect(BreakpointService.classify(641)).toBe('tablet');
    expect(BreakpointService.classify(1024)).toBe('tablet');
    expect(BreakpointService.classify(1025)).toBe('web');
    expect(BreakpointService.classify(1440)).toBe('web');
  });

  it('defaults to web on the server (no browser platform)', () => {
    const service = new BreakpointService('server' as unknown as object);
    expect(service.viewport()).toBe('web');
  });

  it('falls back to web when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const service = new BreakpointService('browser' as unknown as object);
    expect(service.viewport()).toBe('web');
  });

  it('detects the mobile viewport via matchMedia', () => {
    stubMatchMedia('mobile');
    const service = new BreakpointService('browser' as unknown as object);
    expect(service.viewport()).toBe('mobile');
  });

  it('detects the tablet viewport via matchMedia', () => {
    stubMatchMedia('tablet');
    const service = new BreakpointService('browser' as unknown as object);
    expect(service.viewport()).toBe('tablet');
  });

  it('detects the web viewport via matchMedia', () => {
    stubMatchMedia('web');
    const service = new BreakpointService('browser' as unknown as object);
    expect(service.viewport()).toBe('web');
  });
});
