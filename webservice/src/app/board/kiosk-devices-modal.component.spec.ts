import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { KioskApiService, type KioskSession } from '../kiosk/kiosk-api.service';
import { KioskDevicesModalComponent } from './kiosk-devices-modal.component';

interface DevicesInternals {
  sessions(): KioskSession[];
  error(): string | null;
  info(): string | null;
  end(session: KioskSession): void;
}

const device: KioskSession = {
  id: 's-1',
  label: 'Theke links',
  startedByName: 'Theke Terminal',
  startedAt: '2026-10-15T07:00:00Z',
  active: true,
  endReason: null,
  lockedUntil: null,
};

describe('KioskDevicesModalComponent', () => {
  let api: { listActive: ReturnType<typeof vi.fn>; endRemotely: ReturnType<typeof vi.fn> };

  const create = () => {
    TestBed.configureTestingModule({
      imports: [KioskDevicesModalComponent],
      providers: [{ provide: KioskApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(KioskDevicesModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    api = {
      listActive: vi.fn(() => of([device])),
      endRemotely: vi.fn(() => of({ ...device, active: false, endReason: 'remote' })),
    };
  });

  it('lists the devices running kiosk mode with name and starter', () => {
    const fixture = create();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Theke links');
    expect(text).toContain('Theke Terminal');
  });

  it('unlocks a device remotely without its PIN', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as DevicesInternals;
    cmp.end(device);
    expect(api.endRemotely).toHaveBeenCalledWith('s-1');
    expect(cmp.sessions()).toEqual([]);
    expect(cmp.info()).toContain('Theke links');
  });

  it('shows an empty state when no device is locked', () => {
    api.listActive.mockReturnValue(of([]));
    const fixture = create();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Kein Gerät im Kiosk-Modus');
  });

  it('keeps the device listed when unlocking fails', () => {
    api.endRemotely.mockReturnValue(throwError(() => new ApiError(403, 'access_denied', 'nein')));
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as DevicesInternals;
    cmp.end(device);
    expect(cmp.sessions()).toHaveLength(1);
    expect(cmp.error()).toBeTruthy();
  });
});
