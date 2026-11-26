import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallMode, InstallPromptService } from './install-prompt.service';
import { PushNotificationsService, PushState } from './push-notifications.service';
import { START_SETUP_STORAGE_KEY, startSetupDone } from './start-setup';
import { StartSetupDialogComponent } from './start-setup-dialog.component';

describe('StartSetupDialogComponent', () => {
  let pushState: ReturnType<typeof signal<PushState>>;
  let installMode: ReturnType<typeof signal<InstallMode>>;
  let enable: ReturnType<typeof vi.fn>;
  let getUserMedia: ReturnType<typeof vi.fn>;
  let stopTrack: ReturnType<typeof vi.fn>;
  let permissionStates: Record<string, PermissionState>;

  beforeEach(() => {
    localStorage.removeItem(START_SETUP_STORAGE_KEY);
    pushState = signal<PushState>('off');
    installMode = signal<InstallMode>('manual');
    enable = vi.fn(async () => pushState.set('on'));
    stopTrack = vi.fn();
    getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }));
    permissionStates = { camera: 'prompt', geolocation: 'prompt' };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: async () => [{ kind: 'videoinput' }],
      },
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: async ({ name }: { name: string }) => ({ state: permissionStates[name] }) },
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: vi.fn((ok: () => void) => ok()) },
    });
  });

  afterEach(() => {
    for (const key of ['mediaDevices', 'permissions', 'geolocation']) {
      delete (navigator as unknown as Record<string, unknown>)[key];
    }
    localStorage.removeItem(START_SETUP_STORAGE_KEY);
  });

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [StartSetupDialogComponent],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: PushNotificationsService,
          useValue: { state: pushState, busy: signal(false), sync: async () => undefined, enable },
        },
        { provide: InstallPromptService, useValue: { mode: installMode, install: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(StartSetupDialogComponent);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    fixture.detectChanges();
    await settle(fixture);
    return { fixture, root: fixture.nativeElement as HTMLElement, closed: () => closed };
  };

  /** Wartet die Permission-Abfragen ab (mehrere Mikrotask-Runden). */
  const settle = async (fixture: { detectChanges(): void }) => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };

  const buttons = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('.setup-row .member-button'));

  it('offers install hint plus push, camera and location', async () => {
    const { root } = await create();
    expect(root.querySelector('[role="dialog"]')).toBeTruthy();
    expect(root.querySelector('.setup-home')).toBeTruthy();
    expect(root.querySelectorAll('.setup-row').length).toBe(3);
    expect(buttons(root).length).toBe(3);
  });

  it('asks the browser only after a tap and frees the camera again', async () => {
    const { fixture, root } = await create();
    expect(getUserMedia).not.toHaveBeenCalled();
    buttons(root)[1].click(); // Kamera
    await settle(fixture);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(root.querySelectorAll('.setup-status-ok').length).toBe(1);

    buttons(root)[0].click(); // Mitteilungen
    await settle(fixture);
    expect(enable).toHaveBeenCalledOnce();
  });

  it('remembers per device that the dialog was shown, even if nothing was allowed', async () => {
    const { root, closed } = await create();
    root.querySelector<HTMLButtonElement>('.setup-actions .member-button')!.click();
    expect(closed()).toBe(1);
    expect(startSetupDone()).toBe(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('closes silently when the app is installed and everything is decided', async () => {
    pushState.set('on');
    installMode.set('installed');
    permissionStates = { camera: 'granted', geolocation: 'denied' };
    const { root, closed } = await create();
    expect(root.querySelector('[role="dialog"]')).toBeFalsy();
    expect(closed()).toBe(1);
    expect(startSetupDone()).toBe(true);
  });

  it('shows the iPhone steps and that push needs the home screen', async () => {
    pushState.set('needs-install');
    installMode.set('ios');
    const { root } = await create();
    expect(root.querySelectorAll('.setup-steps li').length).toBe(3);
    expect(buttons(root).length).toBe(2); // Kamera und Standort, kein Push-Knopf
  });
});
