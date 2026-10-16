import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { KioskApiService, type KioskSession } from './kiosk-api.service';
import { KIOSK_REMOTE_CHECK_MS, KioskLockComponent } from './kiosk-lock.component';
import { KioskModeService } from './kiosk-mode.service';

interface LockInternals {
  pin: { set(value: string): void; (): string };
  error(): string | null;
  submit(): void;
  cancel(): void;
}

const session = (overrides: Partial<KioskSession> = {}): KioskSession => ({
  id: 's-1',
  label: 'Theke',
  startedByName: 'Theke',
  startedAt: '2026-10-15T07:00:00Z',
  active: true,
  endReason: null,
  lockedUntil: null,
  ...overrides,
});

describe('KioskLockComponent', () => {
  let api: { unlock: ReturnType<typeof vi.fn>; state: ReturnType<typeof vi.fn> };

  const create = (active = true) => {
    TestBed.configureTestingModule({
      imports: [KioskLockComponent],
      providers: [{ provide: KioskApiService, useValue: api }],
    });
    if (active) TestBed.inject(KioskModeService).activate('s-1', 'e-1');
    const fixture = TestBed.createComponent(KioskLockComponent);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    localStorage.clear();
    api = {
      unlock: vi.fn(() => of({ unlocked: true, remainingAttempts: null, lockedUntil: null })),
      state: vi.fn(() => of(session())),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing outside kiosk mode', () => {
    const fixture = create(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.kiosk-lock-button')).toBeNull();
  });

  it('leaves kiosk mode only after the server accepts the PIN of this session', () => {
    const fixture = create();
    const kiosk = TestBed.inject(KioskModeService);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.kiosk-lock-button');
    expect(button).not.toBeNull();
    button!.click();
    fixture.detectChanges();
    expect(kiosk.unlockOpen()).toBe(true);

    const cmp = fixture.componentInstance as unknown as LockInternals;
    cmp.pin.set('2468');
    cmp.submit();
    expect(api.unlock).toHaveBeenCalledWith('s-1', '2468');
    expect(kiosk.active()).toBe(false);
    expect(localStorage.getItem('vereint.kiosk')).toBeNull();
  });

  it('stays locked on a wrong PIN and shows the remaining attempts', () => {
    api.unlock.mockReturnValue(of({ unlocked: false, remainingAttempts: 3, lockedUntil: null }));
    const fixture = create();
    const kiosk = TestBed.inject(KioskModeService);
    const cmp = fixture.componentInstance as unknown as LockInternals;
    cmp.pin.set('0000');
    cmp.submit();
    expect(kiosk.active()).toBe(true);
    expect(cmp.error()).toContain('3');
    expect(cmp.pin()).toBe('');
  });

  it('shows when a lock ends', () => {
    api.unlock.mockReturnValue(of({ unlocked: false, remainingAttempts: 0, lockedUntil: '2026-10-15T08:00:00Z' }));
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as LockInternals;
    cmp.pin.set('0000');
    cmp.submit();
    expect(TestBed.inject(KioskModeService).active()).toBe(true);
    expect(cmp.error()).toContain('Zu viele falsche Eingaben');
  });

  it('stays locked when the request fails', () => {
    api.unlock.mockReturnValue(throwError(() => new ApiError(0, 'network_error', 'offline')));
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as LockInternals;
    cmp.pin.set('2468');
    cmp.submit();
    expect(TestBed.inject(KioskModeService).active()).toBe(true);
    expect(cmp.error()).toBeTruthy();
  });

  it('cancel closes the dialog but keeps kiosk mode', () => {
    const fixture = create();
    const kiosk = TestBed.inject(KioskModeService);
    kiosk.requestUnlock();
    fixture.detectChanges();
    (fixture.componentInstance as unknown as LockInternals).cancel();
    expect(kiosk.unlockOpen()).toBe(false);
    expect(kiosk.active()).toBe(true);
  });

  it('leaves kiosk mode once the board has unlocked the device remotely', async () => {
    vi.useFakeTimers();
    create();
    const kiosk = TestBed.inject(KioskModeService);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.state).toHaveBeenCalledWith('s-1');
    expect(kiosk.active()).toBe(true);

    api.state.mockReturnValue(of(session({ active: false, endReason: 'remote' })));
    await vi.advanceTimersByTimeAsync(KIOSK_REMOTE_CHECK_MS);
    expect(kiosk.active()).toBe(false);
  });

  it('keeps kiosk mode when the remote check fails, but leaves it for a missing session', async () => {
    vi.useFakeTimers();
    api.state.mockReturnValue(throwError(() => new ApiError(0, 'network_error', 'offline')));
    create();
    const kiosk = TestBed.inject(KioskModeService);
    await vi.advanceTimersByTimeAsync(KIOSK_REMOTE_CHECK_MS);
    expect(kiosk.active()).toBe(true);

    api.state.mockReturnValue(throwError(() => new ApiError(404, 'not_found', 'weg')));
    await vi.advanceTimersByTimeAsync(KIOSK_REMOTE_CHECK_MS);
    expect(kiosk.active()).toBe(false);
  });
});
