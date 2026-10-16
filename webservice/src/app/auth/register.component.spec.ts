import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { MemberInvitesApiService } from '../invites/member-invites-api.service';
import { Router, provideRouter } from '@angular/router';
import { StammtischApiService } from '../stammtisch/stammtisch-api.service';
import { AuthService } from './auth.service';
import { RegisterComponent } from './register.component';

interface RegisterInternals {
  state(): string;
  error(): string | null;
  registeredEmail(): string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordRepeat: string;
  acceptTerms: { set(value: boolean): void };
  start(hash: string): void;
  submit(): void;
  signedIn(): boolean;
  join(): void;
}

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';

describe('RegisterComponent', () => {
  let api: { preview: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> };
  let auth: {
    isAvailable: ReturnType<typeof vi.fn>;
    startLogin: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
    selectStammtisch: ReturnType<typeof vi.fn>;
  };
  let stammtische: { join: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      preview: vi.fn(() => of({ expiresAt: '2026-10-21T08:00:00Z' })),
      register: vi.fn(() => of({ email: 'anna@example.org', displayName: 'Anna Neumann' })),
    };
    auth = {
      isAvailable: vi.fn(() => true),
      startLogin: vi.fn(),
      getSession: vi.fn(() => Promise.resolve(null)),
      selectStammtisch: vi.fn(() => Promise.resolve(true)),
    };
    stammtische = {
      join: vi.fn(() => of({ stammtischId: 'st-2', stammtischName: 'Zweiter', alreadyMember: false })),
    };
  });

  const create = () => {
    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        { provide: MemberInvitesApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: StammtischApiService, useValue: stammtische },
      ],
    });
    const fixture = TestBed.createComponent(RegisterComponent);
    const cmp = fixture.componentInstance as unknown as RegisterInternals;
    return { fixture, cmp };
  };

  const fill = (cmp: RegisterInternals) => {
    cmp.firstName = ' Anna ';
    cmp.lastName = 'Neumann';
    cmp.email = 'anna@example.org';
    cmp.password = 'sehr-geheimes-passwort';
    cmp.passwordRepeat = 'sehr-geheimes-passwort';
    cmp.acceptTerms.set(true);
  };

  it('rejects a link without a token without calling the API', () => {
    const { cmp } = create();
    cmp.start('');
    expect(cmp.state()).toBe('invalid');
    expect(api.preview).not.toHaveBeenCalled();
  });

  it('reads the token from the fragment after rendering and removes it from the address bar', async () => {
    globalThis.history.replaceState(null, '', `/register#${TOKEN}`);
    const { fixture, cmp } = create();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.preview).toHaveBeenCalledWith(TOKEN);
    expect(cmp.state()).toBe('form');
    expect(fixture.nativeElement.textContent).toContain('Konto anlegen');
    expect(globalThis.location.hash).toBe('');
  });

  it('explains an expired link', () => {
    api.preview.mockReturnValue(throwError(() => new ApiError(410, 'invitation_expired', 'abgelaufen')));
    const { cmp } = create();
    cmp.start(`#${TOKEN}`);
    expect(cmp.state()).toBe('invalid');
    expect(cmp.error()).toContain('abgelaufen');
  });

  it('validates passwords locally before registering', () => {
    const { cmp } = create();
    cmp.start(`#${TOKEN}`);
    fill(cmp);
    cmp.passwordRepeat = 'anderes-passwort';
    cmp.submit();
    expect(cmp.error()).toContain('stimmen nicht');

    cmp.password = 'kurz';
    cmp.passwordRepeat = 'kurz';
    cmp.submit();
    expect(cmp.error()).toContain('10 Zeichen');
    expect(api.register).not.toHaveBeenCalled();
  });

  it('requires consent to the terms before registering', () => {
    const { cmp } = create();
    cmp.start(`#${TOKEN}`);
    fill(cmp);
    cmp.acceptTerms.set(false);
    cmp.submit();
    expect(cmp.error()).toContain('AGB');
    expect(api.register).not.toHaveBeenCalled();
  });

  it('registers with the token and offers the login', () => {
    const { cmp } = create();
    cmp.start(`#${TOKEN}`);
    fill(cmp);
    cmp.submit();

    expect(api.register).toHaveBeenCalledWith({
      token: TOKEN,
      firstName: 'Anna',
      lastName: 'Neumann',
      email: 'anna@example.org',
      password: 'sehr-geheimes-passwort',
      acceptTerms: true,
    });
    expect(cmp.state()).toBe('done');
    expect(cmp.registeredEmail()).toBe('anna@example.org');
    expect(cmp.password).toBe('');
  });

  it('keeps the form for an existing e-mail and leaves it for a used-up link', () => {
    api.register.mockReturnValueOnce(
      throwError(() => new ApiError(409, 'email_already_registered', 'existiert')),
    );
    const { cmp } = create();
    cmp.start(`#${TOKEN}`);
    fill(cmp);
    cmp.submit();
    expect(cmp.state()).toBe('form');
    expect(cmp.error()).toContain('schon ein Konto');

    api.register.mockReturnValueOnce(throwError(() => new ApiError(410, 'invitation_used_up', 'weg')));
    cmp.submit();
    expect(cmp.state()).toBe('invalid');
  });

  it('lets a signed-in person join the Stammtisch of the link instead of registering', async () => {
    auth.getSession.mockResolvedValue({ uid: 'u-1', email: null, provider: 'keycloak' });
    const { cmp } = create();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    cmp.start(`#${TOKEN}`);
    await Promise.resolve();
    expect(cmp.signedIn()).toBe(true);

    cmp.join();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(stammtische.join).toHaveBeenCalledWith(TOKEN);
    expect(auth.selectStammtisch).toHaveBeenCalledWith('st-2');
    expect(auth.getSession).toHaveBeenCalledWith(true);
    expect(api.register).not.toHaveBeenCalled();
  });
});
