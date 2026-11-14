import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthNavigationService } from '../auth/auth-navigation.service';
import { TermsGateComponent } from './terms-gate.component';
import { TermsStatusService } from './terms-status.service';

const status = (accepted: boolean) => ({
  currentVersion: '2026-11-10',
  acceptedVersion: accepted ? '2026-11-10' : null,
  acceptedAt: accepted ? '2026-11-10T10:00:00Z' : null,
  accepted,
});

const response = (ok: boolean, body: unknown) => ({ ok, json: async () => body }) as unknown as Response;

describe('TermsStatusService', () => {
  const create = (platform = 'browser') => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    return TestBed.inject(TermsStatusService);
  };

  afterEach(() => vi.unstubAllGlobals());

  it('reports missing consent and asks the service only once', async () => {
    const fetchMock = vi.fn(async () => response(true, status(false)));
    vi.stubGlobal('fetch', fetchMock);
    const service = create();

    expect(await service.isAccepted()).toBe(false);
    expect(await service.isAccepted()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/users/me/terms', expect.anything());
  });

  it('stores the consent and remembers it', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      response(true, status(init?.method === 'POST')),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = create();

    expect(await service.isAccepted()).toBe(false);
    expect(await service.accept()).toBe(true);
    expect(await service.isAccepted()).toBe(true);
    const post = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
    expect(post?.[1]?.body).toBe(JSON.stringify({ acceptTerms: true }));
  });

  it('does not lock anyone out while the status is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(false, null)));
    const service = create();
    expect(await service.isAccepted()).toBe(true);
  });

  it('reports a failed consent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await create().accept()).toBe(false);
  });

  it('does nothing on the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await create('server').isAccepted()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('TermsGateComponent', () => {
  let terms: { accept: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> };
  let navigation: { logout: ReturnType<typeof vi.fn> };

  const create = async () => {
    terms = { accept: vi.fn(async () => true), clear: vi.fn() };
    navigation = { logout: vi.fn(async () => true) };
    TestBed.configureTestingModule({
      imports: [TermsGateComponent],
      providers: [
        provideRouter([]),
        { provide: TermsStatusService, useValue: terms },
        { provide: AuthNavigationService, useValue: navigation },
      ],
    });
    const fixture = TestBed.createComponent(TermsGateComponent);
    fixture.detectChanges();
    return fixture;
  };

  const button = (fixture: { nativeElement: unknown }, id: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;

  it('explains the statistics section and links terms and imprint', async () => {
    const fixture = await create();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Bitte stimme den AGB zu');
    expect(page.textContent).toContain('Statistiken');
    expect(page.textContent).toContain('mit Namen');
    expect(page.textContent).toContain('Konto löschen');
    const links = [...page.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/agb');
    expect(links).toContain('/impressum');
  });

  it('stores the consent and continues to the requested page', async () => {
    const fixture = await create();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    button(fixture, 'accept-terms').click();
    await fixture.whenStable();

    expect(terms.accept).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows an error when the consent could not be saved', async () => {
    const fixture = await create();
    terms.accept.mockResolvedValue(false);
    button(fixture, 'accept-terms').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();
  });

  it('signs out when declining', async () => {
    const fixture = await create();
    button(fixture, 'decline-terms').click();
    await fixture.whenStable();
    expect(navigation.logout).toHaveBeenCalled();
  });
});
