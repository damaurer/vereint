import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { MemberProfile } from '../api/api.types';
import { MemberApiService } from './member-api.service';
import { ProfileComponent } from './profile.component';

const profile: MemberProfile = {
  id: 'm-1',
  keycloakSubject: 'sub-1',
  displayName: 'Alice',
  email: 'alice@example.org',
  disabled: false,
  drinkRecorder: false,
  boardRole: null,
  roles: ['member'],
  permissions: [],
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-02T10:00:00Z',
};

describe('ProfileComponent', () => {
  let api: {
    loadProfile: ReturnType<typeof vi.fn>;
    updateProfile: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [provideRouter([]), { provide: MemberApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      loadProfile: vi.fn(() => of(profile)),
      updateProfile: vi.fn(() => of(profile)),
    };
  });

  it('renders the loaded profile in the form', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;

    const displayName = root.querySelector<HTMLInputElement>('#displayName');
    expect(displayName?.value).toBe('Alice');
    expect(html(fixture)).toContain('member');
    // Roles are rendered through the shared ui/ role-chip primitive.
    expect(root.querySelector('vereint-role-chip')).toBeTruthy();
    expect(root.querySelector('vereint-hero-greeting')).toBeTruthy();
  });

  it('toggles the client-only BeerWithMe switch without calling the api', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;

    const toggle = root.querySelector<HTMLInputElement>('#beerWithMe')!;
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('switches the theme from the profile', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const options = Array.from(root.querySelectorAll('.profile-theme-option')) as HTMLButtonElement[];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['System', 'Hell', 'Dunkel']);
    options[2].click();
    fixture.detectChanges();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(options[2].getAttribute('aria-checked')).toBe('true');
    options[0].click();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('shows a retry state when loading fails', async () => {
    api.loadProfile.mockReturnValue(throwError(() => new ApiError(503, 'service_unavailable', '')));

    const fixture = await create();

    expect(html(fixture)).toContain('nicht verfügbar');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();
  });

  it('saves the edited profile and confirms success', async () => {
    const updated = { ...profile, displayName: 'Alice B.' };
    api.updateProfile.mockReturnValue(of(updated));

    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;

    const input = root.querySelector<HTMLInputElement>('#displayName')!;
    input.value = 'Alice B.';
    input.dispatchEvent(new Event('input'));

    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.updateProfile).toHaveBeenCalledWith({
      displayName: 'Alice B.',
      email: 'alice@example.org',
    });
    expect(html(fixture)).toContain('Profil aktualisiert');
  });

  it('reports a save error without losing the form', async () => {
    api.updateProfile.mockReturnValue(
      throwError(() => new ApiError(400, 'validation_error', 'ungültig')),
    );

    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(html(fixture)).toContain('ungültig');
  });
});
