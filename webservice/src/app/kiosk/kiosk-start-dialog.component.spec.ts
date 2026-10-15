import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { KioskApiService, type KioskSession } from './kiosk-api.service';
import { KioskStartDialogComponent } from './kiosk-start-dialog.component';

interface StartInternals {
  label: string;
  pin: string;
  repeat: string;
  error(): string | null;
  submit(): void;
}

const created: KioskSession = {
  id: 's-1',
  label: 'Theke links',
  startedByName: 'Theke',
  startedAt: '2026-10-15T07:00:00Z',
  active: true,
  endReason: null,
  lockedUntil: null,
};

describe('KioskStartDialogComponent', () => {
  let api: { start: ReturnType<typeof vi.fn> };

  const create = () => {
    TestBed.configureTestingModule({
      imports: [KioskStartDialogComponent],
      providers: [{ provide: KioskApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(KioskStartDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    localStorage.clear();
    api = { start: vi.fn(() => of(created)) };
  });

  it('starts a session with the PIN chosen on this device', () => {
    const fixture = create();
    const started = vi.fn();
    fixture.componentInstance.started.subscribe(started);
    const cmp = fixture.componentInstance as unknown as StartInternals;
    cmp.label = ' Theke links ';
    cmp.pin = '482913';
    cmp.repeat = '482913';
    cmp.submit();
    expect(api.start).toHaveBeenCalledWith('482913', 'Theke links');
    expect(started).toHaveBeenCalledWith(created);
    expect(cmp.pin).toBe('');
    expect(localStorage.getItem('vereint.kiosk.label')).toBe('Theke links');
  });

  it('rejects short, non-numeric or mismatching PINs before calling the server', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as StartInternals;
    for (const [pin, repeat] of [
      ['123', '123'],
      ['12a4', '12a4'],
      ['123456789', '123456789'],
      ['1234', '4321'],
    ]) {
      cmp.pin = pin;
      cmp.repeat = repeat;
      cmp.submit();
      expect(cmp.error()).toBeTruthy();
    }
    expect(api.start).not.toHaveBeenCalled();
  });

  it('shows a refusal from the server and does not start', () => {
    api.start.mockReturnValue(throwError(() => new ApiError(403, 'access_denied', 'nein')));
    const fixture = create();
    const started = vi.fn();
    fixture.componentInstance.started.subscribe(started);
    const cmp = fixture.componentInstance as unknown as StartInternals;
    cmp.pin = '1234';
    cmp.repeat = '1234';
    cmp.submit();
    expect(started).not.toHaveBeenCalled();
    expect(cmp.error()).toBeTruthy();
  });
});
