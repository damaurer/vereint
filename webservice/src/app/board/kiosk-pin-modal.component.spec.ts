import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { KioskApiService } from '../kiosk/kiosk-api.service';
import { KioskPinModalComponent } from './kiosk-pin-modal.component';

interface PinInternals {
  pin: string;
  repeat: string;
  error(): string | null;
  saved(): boolean;
  save(): void;
}

describe('KioskPinModalComponent', () => {
  let api: { status: ReturnType<typeof vi.fn>; setPin: ReturnType<typeof vi.fn> };

  const create = () => {
    TestBed.configureTestingModule({
      imports: [KioskPinModalComponent],
      providers: [{ provide: KioskApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(KioskPinModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    api = {
      status: vi.fn(() => of({ pinConfigured: false, pinUpdatedAt: null, pinUpdatedByName: null })),
      setPin: vi.fn(() =>
        of({ pinConfigured: true, pinUpdatedAt: '2026-10-15T07:00:00Z', pinUpdatedByName: 'Vorstand' }),
      ),
    };
  });

  it('shows that no PIN is set yet', () => {
    const fixture = create();
    expect(api.status).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Noch keine PIN festgelegt');
  });

  it('saves a valid PIN that was entered twice', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as PinInternals;
    cmp.pin = '482913';
    cmp.repeat = '482913';
    cmp.save();
    fixture.detectChanges();
    expect(api.setPin).toHaveBeenCalledWith('482913');
    expect(cmp.saved()).toBe(true);
    expect(cmp.pin).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Vorstand');
  });

  it('rejects short, non-numeric or mismatching PINs before calling the server', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as PinInternals;
    for (const [pin, repeat] of [
      ['123', '123'],
      ['12a4', '12a4'],
      ['123456789', '123456789'],
      ['1234', '4321'],
    ]) {
      cmp.pin = pin;
      cmp.repeat = repeat;
      cmp.save();
      expect(cmp.error()).toBeTruthy();
    }
    expect(api.setPin).not.toHaveBeenCalled();
  });

  it('shows a refusal from the server', () => {
    api.setPin.mockReturnValue(throwError(() => new ApiError(403, 'access_denied', 'nein')));
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as PinInternals;
    cmp.pin = '1234';
    cmp.repeat = '1234';
    cmp.save();
    expect(cmp.saved()).toBe(false);
    expect(cmp.error()).toBeTruthy();
  });
});
