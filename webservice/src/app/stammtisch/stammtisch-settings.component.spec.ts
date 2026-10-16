import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { AuthService } from '../auth/auth.service';
import { StammtischApiService, type StammtischDto, type StammtischRolesDto } from './stammtisch-api.service';
import { StammtischSettingsComponent, groupPermissions } from './stammtisch-settings.component';

interface SettingsInternals {
  leave(): void;
  leaveError(): string | null;
}

const rolesData: StammtischRolesDto = {
  roles: [
    {
      id: 'r-1',
      code: 'admin',
      name: 'Admin',
      description: null,
      permissions: ['roles.manage'],
      systemRole: true,
      sortOrder: 0,
      memberCount: 1,
    },
    {
      id: 'r-2',
      code: 'kasse',
      name: 'Kasse',
      description: null,
      permissions: ['ledger.read'],
      systemRole: false,
      sortOrder: 1,
      memberCount: 2,
    },
  ],
  knownPermissions: ['ledger.read', 'ledger.correct', 'roles.manage'],
};

function stammtisch(permissions: string[]): StammtischDto {
  return {
    id: 'st-1',
    name: 'Eber',
    memberCount: 5,
    myRoles: [],
    myPermissions: permissions,
    createdAt: '2026-01-01T10:00:00Z',
  };
}

describe('StammtischSettingsComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let auth: { getSession: ReturnType<typeof vi.fn>; selectStammtisch: ReturnType<typeof vi.fn> };

  const create = async (permissions: string[]) => {
    api = {
      current: vi.fn(() => of(stammtisch(permissions))),
      roles: vi.fn(() => of(rolesData)),
      leave: vi.fn(() => of(undefined)),
      rename: vi.fn(),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn(),
    };
    auth = {
      getSession: vi.fn(() => Promise.resolve({ uid: 'u', email: null, provider: 'keycloak', memberships: [] })),
      selectStammtisch: vi.fn(() => Promise.resolve(true)),
    };
    TestBed.configureTestingModule({
      imports: [StammtischSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: StammtischApiService, useValue: api },
        { provide: AuthService, useValue: auth },
      ],
    });
    const fixture = TestBed.createComponent(StammtischSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as unknown as SettingsInternals };
  };

  it('groups permissions by their prefix', () => {
    const groups = groupPermissions(['roles.manage', 'ledger.read', 'ledger.correct']);
    expect(groups.map((g) => g.prefix)).toEqual(['ledger', 'roles']);
    expect(groups[0].permissions).toEqual(['ledger.correct', 'ledger.read']);
    expect(groups[0].label).toBe('Buchungen');
  });

  it('shows the role editor with roles.manage, without delete for system roles', async () => {
    const { fixture } = await create(['roles.manage', 'stammtisch.manage']);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Neue Rolle');
    expect(text).toContain('Name des Stammtischs');
    const deleteButtons = [...fixture.nativeElement.querySelectorAll('button')].filter(
      (b: HTMLButtonElement) => b.textContent?.trim() === 'Löschen',
    );
    expect(deleteButtons.length).toBe(1);
  });

  it('shows roles read-only with members.read only', async () => {
    const { fixture } = await create(['members.read']);
    const text = fixture.nativeElement.textContent as string;
    expect(api['roles']).toHaveBeenCalled();
    expect(text).toContain('Kasse');
    expect(text).not.toContain('Neue Rolle');
    expect(text).not.toContain('Name des Stammtischs');
  });

  it('hides roles entirely without roles.manage or members.read', async () => {
    const { fixture } = await create([]);
    expect(api['roles']).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('Rollen & Berechtigungen');
  });

  it('leaves, clears the selection and goes to the choice page', async () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { cmp } = await create([]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    cmp.leave();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/stammtische'));
    expect(auth.selectStammtisch).toHaveBeenCalledWith(null);
    expect(auth.getSession).toHaveBeenCalledWith(true);
    confirm.mockRestore();
  });

  it('shows the detail when the last role manager tries to leave', async () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { cmp } = await create(['roles.manage']);
    api['leave'].mockReturnValue(
      throwError(() => new ApiError(409, 'last_role_manager_protected', 'Du bist der letzte Admin.')),
    );
    cmp.leave();
    expect(cmp.leaveError()).toBe('Du bist der letzte Admin.');
    expect(auth.selectStammtisch).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
