import { Injector, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { KioskModeService } from './kiosk-mode.service';
import { kioskGuard } from './kiosk.guard';

const STORAGE_KEY = 'vereint.kiosk';

describe('KioskModeService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('is inactive by default', () => {
    const kiosk = TestBed.inject(KioskModeService);
    expect(kiosk.active()).toBe(false);
    expect(kiosk.eventId()).toBeNull();
  });

  it('keeps kiosk mode and the chosen event across a restart', () => {
    TestBed.inject(KioskModeService).activate('e-1');

    // Neue Instanz liest denselben Speicher wie nach Schließen und Neuöffnen.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const reopened = TestBed.inject(KioskModeService);
    expect(reopened.active()).toBe(true);
    expect(reopened.eventId()).toBe('e-1');
  });

  it('treats a damaged entry as still locked', () => {
    localStorage.setItem(STORAGE_KEY, '{"active":false,"eventId":42}');
    const kiosk = TestBed.inject(KioskModeService);
    expect(kiosk.active()).toBe(true);
    expect(kiosk.eventId()).toBeNull();
  });

  it('remembers a newly chosen event only while active', () => {
    const kiosk = TestBed.inject(KioskModeService);
    kiosk.rememberEvent('e-9');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    kiosk.activate(null);
    kiosk.rememberEvent('e-2');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).eventId).toBe('e-2');
  });

  it('opens the unlock dialog only while active and clears everything on deactivate', () => {
    const kiosk = TestBed.inject(KioskModeService);
    kiosk.requestUnlock();
    expect(kiosk.unlockOpen()).toBe(false);
    kiosk.activate('e-1');
    kiosk.requestUnlock();
    expect(kiosk.unlockOpen()).toBe(true);
    kiosk.deactivate();
    expect(kiosk.active()).toBe(false);
    expect(kiosk.unlockOpen()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('never activates during server-side rendering', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ active: true, eventId: null }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    expect(TestBed.inject(KioskModeService).active()).toBe(false);
  });
});

describe('kioskGuard', () => {
  const state = (url: string) => ({ url }) as unknown as RouterStateSnapshot;
  const run = (url: string) =>
    runInInjectionContext(TestBed.inject(Injector), () => kioskGuard({} as never, state(url)));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('lets every route through outside kiosk mode', () => {
    expect(run('/dashboard')).toBe(true);
  });

  it('sends every other route back to the terminal in kiosk mode', () => {
    TestBed.inject(KioskModeService).activate(null);
    const router = TestBed.inject(Router);
    for (const url of ['/dashboard', '/profile', '/board', '/tablets', '/register#token']) {
      const result = run(url);
      expect(result instanceof UrlTree, url).toBe(true);
      expect(router.serializeUrl(result as UrlTree)).toBe('/tablet');
    }
    expect(run('/tablet')).toBe(true);
    expect(run('/tablet?x=1')).toBe(true);
  });
});
