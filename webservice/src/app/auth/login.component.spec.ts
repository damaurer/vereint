import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { HOME_ROUTE, LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let authStub: {
    isAvailable: ReturnType<typeof vi.fn>;
    startLogin: ReturnType<typeof vi.fn>;
    buildLoginUrl: ReturnType<typeof vi.fn>;
    loadSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    describeError: ReturnType<typeof vi.fn>;
    errorCode: ReturnType<typeof vi.fn>;
  };
  let queryParams: Record<string, string>;

  const configure = async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => queryParams[key] ?? null,
              },
            },
          },
        },
      ],
    }).compileComponents();
  };

  const createFixture = async () => {
    await configure();
    const fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    return fixture;
  };

  const submit = async (fixture: Awaited<ReturnType<typeof createFixture>>) => {
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };

  const textOf = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    queryParams = {};
    authStub = {
      isAvailable: vi.fn(() => true),
      startLogin: vi.fn(),
      buildLoginUrl: vi.fn((returnTo?: string) => `/api/auth/login?returnTo=${returnTo}`),
      loadSession: vi.fn(async () => null),
      signOut: vi.fn(async () => undefined),
      describeError: vi.fn(() => 'Die Anmeldung ist fehlgeschlagen.'),
      errorCode: vi.fn((value: unknown) => (typeof value === 'string' ? value : '')),
    };
  });

  it('shows the keycloak login entry without credential fields', async () => {
    const fixture = await createFixture();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('#start-login')).toBeTruthy();
    expect(root.querySelector('#email')).toBeNull();
    expect(root.querySelector('#password')).toBeNull();
    expect(root.querySelector('#remember-me')).toBeNull();
  });

  it('starts the keycloak flow with the default return url', async () => {
    const fixture = await createFixture();

    await submit(fixture);

    expect(authStub.startLogin).toHaveBeenCalledWith(HOME_ROUTE);
  });

  it('keeps the requested return url', async () => {
    queryParams = { returnUrl: '/board/treasury' };

    const fixture = await createFixture();
    await submit(fixture);

    expect(authStub.startLogin).toHaveBeenCalledWith('/board/treasury');
  });

  it('reports an unavailable auth service', async () => {
    authStub.isAvailable.mockReturnValue(false);

    const fixture = await createFixture();
    await submit(fixture);

    expect(authStub.startLogin).not.toHaveBeenCalled();
    expect(textOf(fixture)).toContain('nicht verfügbar');
  });

  it('renders the error code delivered by the callback', async () => {
    queryParams = { error: 'oidc_login_failed' };
    authStub.describeError.mockReturnValue('Die Anmeldung über Keycloak ist fehlgeschlagen.');

    const fixture = await createFixture();

    expect(authStub.describeError).toHaveBeenCalledWith('oidc_login_failed');
    expect(textOf(fixture)).toContain('Die Anmeldung über Keycloak ist fehlgeschlagen.');
  });
});
