import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { KioskApiService } from './kiosk-api.service';
import { KioskLockComponent } from './kiosk-lock.component';
import { KioskModeService } from './kiosk-mode.service';

interface LockInternals {
  pin: { set(value: string): void; (): string };
  error(): string | null;
  submit(): void;
  cancel(): void;
}

describe('KioskLockComponent', () => {
  let api: { unlock: ReturnType<typeof vi.fn> };

  const create = () => {
    TestBed.configureTestingModule({
      imports: [KioskLockComponent],
      providers: [{ provide: KioskApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(KioskLockComponent);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    localStorage.clear();
    api = { unlock: vi.fn(() => of({ unlocked: true, remainingAttempts: null, lockedUntil: null })) };
  });

  it('renders nothing outside kiosk mode', () => {
    const fixture = create();
    expect((fixture.nativeElement as HTMLElement).querySelector('.kiosk-lock-button')).toBeNull();
  });

  it('leaves kiosk mode only after the server accepts the PIN', () => {
    const fixture = create();
    const kiosk = TestBed.inject(KioskModeService);
    kiosk.activate('e-1');
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.kiosk-lock-button');
    expect(button).not.toBeNull();
    button!.click();
    fixture.detectChanges();
    expect(kiosk.unlockOpen()).toBe(true);

    const cmp = fixture.componentInstance as unknown as LockInternals;
    cmp.pin.set('2468');
    cmp.submit();
    expect(api.unlock).toHaveBeenCalledWith('2468');
    expect(kiosk.active()).toBe(false);
    expect(localStorage.getItem('vereint.kiosk')).toBeNull();
  });

  it('stays locked on a wrong PIN and shows the remaining attempts', () => {
    api.unlock.mockReturnValue(of({ unlocked: false, remainingAttempts: 3, lockedUntil: null }));
    const fixture = create();
    const kiosk = TestBed.inject(KioskModeService);
    kiosk.activate(null);
    kiosk.requestUnlock();
    fixture.detectChanges();
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
    const kiosk = TestBed.inject(KioskModeService);
    kiosk.activate(null);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as unknown as LockInternals;
    cmp.pin.set('0000');
    cmp.submit();
    expect(kiosk.active()).toBe(true);
    expect(cmp.error()).toContain('Zu viele falsche Eingaben');
  });

  it('stays locked when the request fails', () => {
    api.unlock.mockReturnValue(throwError(() => new ApiError(0, 'network_error', 'offline')));
    const fixture = create();
    const kiosk = TestBed.inject(KioskModeService);
    kiosk.activate(null);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as unknown as LockInternals;
    cmp.pin.set('2468');
    cmp.submit();
    expect(kiosk.active()).toBe(true);
    expect(cmp.error()).toBeTruthy();
  });

  it('cancel closes the dialog but keeps kiosk mode', () => {
    const fixture = create();
    const kiosk = TestBed.inject(KioskModeService);
    kiosk.activate(null);
    kiosk.requestUnlock();
    fixture.detectChanges();
    (fixture.componentInstance as unknown as LockInternals).cancel();
    expect(kiosk.unlockOpen()).toBe(false);
    expect(kiosk.active()).toBe(true);
  });
});
