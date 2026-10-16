import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { type MockInstance, vi } from 'vitest';
import { AuthNavigationService } from '../auth/auth-navigation.service';
import { AuthService } from '../auth/auth.service';
import { StammtischApiService } from './stammtisch-api.service';
import { StammtischChoiceComponent } from './stammtisch-choice.component';

interface ChoiceInternals {
  open(id: string): Promise<void>;
  memberships(): { id: string }[];
}

describe('StammtischChoiceComponent', () => {
  let api: { listMine: ReturnType<typeof vi.fn> };
  let auth: { getSession: ReturnType<typeof vi.fn>; selectStammtisch: ReturnType<typeof vi.fn> };

  const TWO = [
    { id: 'st-1', name: 'Eber', roles: ['admin'], boardRole: null, imageVersion: 4 },
    { id: 'st-2', name: 'Kegelfreunde Nord', roles: ['member'], boardRole: null },
  ];
  let navigate: MockInstance<Router['navigateByUrl']>;

  const create = async (
    returnTo: string | null,
    memberships: { id: string; name: string; roles: string[]; boardRole: null; imageVersion?: number }[] = TWO,
    current: { id: string; name: string } | null = null,
  ) => {
    api = { listMine: vi.fn(() => of(memberships)) };
    auth = {
      getSession: vi.fn(() =>
        Promise.resolve({ uid: 'u', email: null, provider: 'keycloak', stammtisch: current, platformAdmin: false }),
      ),
      selectStammtisch: vi.fn(() => Promise.resolve(true)),
    };
    TestBed.configureTestingModule({
      imports: [StammtischChoiceComponent],
      providers: [
        provideRouter([]),
        { provide: StammtischApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: AuthNavigationService, useValue: { logout: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(returnTo ? { returnTo } : {}) } },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(StammtischChoiceComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as unknown as ChoiceInternals };
  };

  it('lists the memberships with their pictures or initials', async () => {
    const { fixture } = await create(null);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Eber');
    expect(el.textContent).toContain('Öffnen');
    const img = el.querySelector('vereint-group-avatar img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/v1/stammtische/st-1/image?v=4');
    expect(el.querySelectorAll('vereint-group-avatar')[1].textContent?.trim()).toBe('KN');
    expect(auth.selectStammtisch).not.toHaveBeenCalled();
  });

  it('selects the group, refreshes the session and returns to the requested page', async () => {
    const { cmp } = await create('/catalog');
    await cmp.open('st-1');
    expect(auth.selectStammtisch).toHaveBeenCalledWith('st-1');
    expect(auth.getSession).toHaveBeenCalledWith(true);
    expect(navigate).toHaveBeenCalledWith('/catalog');
  });

  it('ignores unsafe return targets', async () => {
    const { cmp } = await create('//evil.example');
    await cmp.open('st-1');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('enters the only group without a click when none is selected', async () => {
    await create('/events', [TWO[0]]);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/events'));
    expect(auth.selectStammtisch).toHaveBeenCalledWith('st-1');
  });

  it('keeps the choice page for the only group when it is already selected (switching)', async () => {
    const { fixture } = await create(null, [TWO[0]], { id: 'st-1', name: 'Eber' });
    expect(auth.selectStammtisch).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Eber');
  });

  it('explains how to join without any membership and offers opening an own group', async () => {
    const { fixture } = await create(null, []);
    expect(fixture.nativeElement.textContent).toContain('Einladungslink');
    const link = (fixture.nativeElement as HTMLElement).querySelector('.st-open-own a') as HTMLAnchorElement;
    expect(link.textContent).toContain('Eigene Gruppe eröffnen');
    expect(link.getAttribute('href')).toBe('/gruppe-eroeffnen');
  });

  it('offers opening an own group next to existing memberships', async () => {
    const { fixture } = await create(null);
    expect((fixture.nativeElement as HTMLElement).querySelector('.st-open-own a')).not.toBeNull();
  });
});
