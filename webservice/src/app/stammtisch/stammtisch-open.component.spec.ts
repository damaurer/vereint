import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { AuthService } from '../auth/auth.service';
import { StammtischApiService } from './stammtisch-api.service';
import { StammtischOpenComponent } from './stammtisch-open.component';

interface OpenInternals {
  state(): string;
  error(): string | null;
  registeredEmail(): string;
  openedName(): string;
  submitting(): boolean;
  stammtischName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordRepeat: string;
  start(): Promise<void>;
  signup(): void;
  create(): void;
  login(returnTo: string): void;
}

describe('StammtischOpenComponent', () => {
  let api: { signup: ReturnType<typeof vi.fn>; createOwn: ReturnType<typeof vi.fn> };
  let auth: {
    isAvailable: ReturnType<typeof vi.fn>;
    startLogin: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
    selectStammtisch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      signup: vi.fn(() =>
        of({ email: 'anna@example.org', displayName: 'Anna Neumann', stammtischId: 'st-new', stammtischName: 'Eberstammtisch' }),
      ),
      createOwn: vi.fn(() => of({ id: 'st-new', name: 'Eberstammtisch', roles: ['admin'] })),
    };
    auth = {
      isAvailable: vi.fn(() => true),
      startLogin: vi.fn(),
      getSession: vi.fn(() => Promise.resolve(null)),
      selectStammtisch: vi.fn(() => Promise.resolve(true)),
    };
  });

  const create = async (session: unknown = null) => {
    auth.getSession.mockResolvedValue(session);
    TestBed.configureTestingModule({
      imports: [StammtischOpenComponent],
      providers: [
        provideRouter([]),
        { provide: StammtischApiService, useValue: api },
        { provide: AuthService, useValue: auth },
      ],
    });
    const fixture = TestBed.createComponent(StammtischOpenComponent);
    const cmp = fixture.componentInstance as unknown as OpenInternals;
    await cmp.start();
    fixture.detectChanges();
    return { fixture, cmp };
  };

  const fill = (cmp: OpenInternals) => {
    cmp.stammtischName = ' Eberstammtisch ';
    cmp.firstName = ' Anna ';
    cmp.lastName = 'Neumann';
    cmp.email = 'anna@example.org';
    cmp.password = 'sehr-geheimes-passwort';
    cmp.passwordRepeat = 'sehr-geheimes-passwort';
  };

  it('shows the signup form with the free plan hint to visitors without a session', async () => {
    const { fixture, cmp } = await create();
    expect(cmp.state()).toBe('signup');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Name der Gruppe');
    expect(text).toContain('Vorname');
    expect(text).toContain('Passwort wiederholen');
    expect(text).toContain('bis zu 10 Mitgliedern');
    expect(text).toContain('Einladungslink');
  });

  it('validates locally before signing up', async () => {
    const { cmp } = await create();
    fill(cmp);
    cmp.stammtischName = '  ';
    cmp.signup();
    expect(cmp.error()).toContain('Namen');

    fill(cmp);
    cmp.passwordRepeat = 'anderes-passwort';
    cmp.signup();
    expect(cmp.error()).toContain('stimmen nicht');

    cmp.password = 'kurz';
    cmp.passwordRepeat = 'kurz';
    cmp.signup();
    expect(cmp.error()).toContain('10 Zeichen');
    expect(api.signup).not.toHaveBeenCalled();
  });

  it('signs up, confirms and starts the login with /gruppe as target', async () => {
    const { fixture, cmp } = await create();
    fill(cmp);
    cmp.signup();

    expect(api.signup).toHaveBeenCalledWith({
      stammtischName: 'Eberstammtisch',
      firstName: 'Anna',
      lastName: 'Neumann',
      email: 'anna@example.org',
      password: 'sehr-geheimes-passwort',
    });
    expect(cmp.state()).toBe('done');
    expect(cmp.password).toBe('');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Eberstammtisch');
    expect(text).toContain('anna@example.org');

    const button = (fixture.nativeElement as HTMLElement).querySelector('.login-form button') as HTMLButtonElement;
    expect(button.textContent).toContain('Jetzt anmelden');
    button.click();
    expect(auth.startLogin).toHaveBeenCalledWith('/gruppe');
  });

  it('explains an e-mail address that already has an account', async () => {
    api.signup.mockReturnValue(throwError(() => new ApiError(409, 'email_already_registered', 'exists')));
    const { cmp } = await create();
    fill(cmp);
    cmp.signup();
    expect(cmp.state()).toBe('signup');
    expect(cmp.error()).toContain('schon ein Konto');
    expect(cmp.submitting()).toBe(false);
  });

  it('explains rejected input and an unavailable registration', async () => {
    const { cmp } = await create();
    fill(cmp);
    api.signup.mockReturnValue(throwError(() => new ApiError(400, 'validation_failed', 'bad')));
    cmp.signup();
    expect(cmp.error()).toContain('80 Zeichen');

    api.signup.mockReturnValue(throwError(() => new ApiError(503, 'registration_unavailable', 'down')));
    cmp.signup();
    expect(cmp.error()).toContain('später');
  });

  it('shows only the name form to signed-in people', async () => {
    const { fixture, cmp } = await create({ uid: 'u', stammtisch: null });
    expect(cmp.state()).toBe('create');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Name der Gruppe');
    expect(text).not.toContain('Vorname');
  });

  it('creates the group, selects it, refreshes the session and opens its settings', async () => {
    const { cmp } = await create({ uid: 'u', stammtisch: null });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    cmp.stammtischName = ' Eberstammtisch ';
    cmp.create();

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/gruppe'));
    expect(api.createOwn).toHaveBeenCalledWith('Eberstammtisch');
    expect(auth.selectStammtisch).toHaveBeenCalledWith('st-new');
    expect(auth.getSession).toHaveBeenLastCalledWith(true);
  });

  it('reports a failed selection without navigating', async () => {
    auth.selectStammtisch.mockResolvedValue(false);
    const { cmp } = await create({ uid: 'u', stammtisch: null });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    cmp.stammtischName = 'Eberstammtisch';
    cmp.create();

    await vi.waitFor(() => expect(cmp.error()).toContain('Gruppenauswahl'));
    expect(navigate).not.toHaveBeenCalled();
    expect(cmp.submitting()).toBe(false);
  });

  it('explains the limit of three own groups', async () => {
    api.createOwn.mockReturnValue(throwError(() => new ApiError(409, 'stammtisch_limit', 'Limit erreicht')));
    const { cmp } = await create({ uid: 'u', stammtisch: null });
    cmp.stammtischName = 'Vierter';
    cmp.create();
    expect(cmp.error()).toContain('drei eigene Gruppen');
    expect(auth.selectStammtisch).not.toHaveBeenCalled();
  });

  it('requires a name before creating', async () => {
    const { cmp } = await create({ uid: 'u', stammtisch: null });
    cmp.create();
    expect(cmp.error()).toContain('Namen');
    expect(api.createOwn).not.toHaveBeenCalled();
  });
});
