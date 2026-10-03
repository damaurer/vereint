import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthStatusComponent } from './auth-status.component';
import { AuthService } from './auth.service';

describe('AuthStatusComponent', () => {
  let fixture: ComponentFixture<AuthStatusComponent>;
  let authServiceStub: {
    describeError: ReturnType<typeof vi.fn>;
    isAvailable: ReturnType<typeof vi.fn>;
    startLogin: ReturnType<typeof vi.fn>;
  };

  const setup = (data: Record<string, unknown>, queryParams: Record<string, string> = {}) => {
    authServiceStub = {
      describeError: vi.fn((code: string | null) =>
        code === 'invalid_state'
          ? 'Die Anmeldung ist abgelaufen. Bitte erneut starten.'
          : 'Die Anmeldung ist fehlgeschlagen.',
      ),
      isAvailable: vi.fn(() => true),
      startLogin: vi.fn(),
    };

    const routeStub = {
      snapshot: {
        data,
        queryParamMap: {
          get: (key: string) => queryParams[key] ?? null,
        },
      },
    };

    TestBed.configureTestingModule({
      imports: [AuthStatusComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceStub },
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    });

    fixture = TestBed.createComponent(AuthStatusComponent);
    fixture.detectChanges();
  };

  it('renders error mode with translated error message and calls startLogin on button click', () => {
    setup({ mode: 'error' }, { error: 'invalid_state' });

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Anmeldung fehlgeschlagen');
    expect(compiled.querySelector('.state-error')?.textContent).toContain(
      'Die Anmeldung ist abgelaufen. Bitte erneut starten.',
    );

    const button = compiled.querySelector('#retry-login') as HTMLButtonElement;
    expect(button).toBeDefined();
    button.click();

    expect(authServiceStub.startLogin).toHaveBeenCalled();
  });

  it('renders logged out mode with confirmation message and calls startLogin on button click', () => {
    setup({ mode: 'loggedOut' });

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Abgemeldet');
    expect(compiled.querySelector('.vereint-subtitle')?.textContent).toContain(
      'Sie wurden erfolgreich abgemeldet.',
    );
    expect(compiled.querySelector('.state-error')).toBeNull();

    const button = compiled.querySelector('#retry-login') as HTMLButtonElement;
    expect(button).toBeDefined();
    button.click();

    expect(authServiceStub.startLogin).toHaveBeenCalled();
  });
});
