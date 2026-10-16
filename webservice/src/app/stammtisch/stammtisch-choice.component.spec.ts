import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
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

  const create = async (returnTo: string | null, memberships = [{ id: 'st-1', name: 'Eber', roles: ['admin'], boardRole: null }]) => {
    api = { listMine: vi.fn(() => of(memberships)) };
    auth = {
      getSession: vi.fn(() => Promise.resolve({ uid: 'u', email: null, provider: 'keycloak', stammtisch: null, platformAdmin: false })),
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
    const fixture = TestBed.createComponent(StammtischChoiceComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as unknown as ChoiceInternals };
  };

  it('lists the memberships', async () => {
    const { fixture } = await create(null);
    expect(fixture.nativeElement.textContent).toContain('Eber');
    expect(fixture.nativeElement.textContent).toContain('Öffnen');
  });

  it('selects the Stammtisch, refreshes the session and returns to the requested page', async () => {
    const { cmp } = await create('/catalog');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await cmp.open('st-1');
    expect(auth.selectStammtisch).toHaveBeenCalledWith('st-1');
    expect(auth.getSession).toHaveBeenCalledWith(true);
    expect(navigate).toHaveBeenCalledWith('/catalog');
  });

  it('ignores unsafe return targets', async () => {
    const { cmp } = await create('//evil.example');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await cmp.open('st-1');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('explains how to join without any membership', async () => {
    const { fixture } = await create(null, []);
    expect(fixture.nativeElement.textContent).toContain('Einladungslink');
  });
});
