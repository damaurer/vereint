import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { PagedResponse, UserSummary } from '../auth/auth.types';
import type { AuditLogEntry, MemberProfile } from '../api/api.types';
import { AdminApiService } from './admin-api.service';
import { AdminComponent } from './admin.component';
import { StammtischApiService, type StammtischRolesDto } from '../stammtisch/stammtisch-api.service';

function role(code: string, name: string, systemRole: boolean, sortOrder: number) {
  return { id: `r-${code}`, code, name, description: null, permissions: [], systemRole, sortOrder, memberCount: 0 };
}

const groupRoles: StammtischRolesDto = {
  roles: [
    role('member', 'Mitglied', true, 0),
    role('board', 'Vorstand', true, 1),
    role('admin', 'Admin', true, 2),
    role('tabletRecorder', 'Thekenterminal', true, 3),
    role('kassenpruefung', 'Kassenprüfung', false, 10),
  ],
  knownPermissions: [],
};

function user(id: string, displayName: string, extra: Partial<UserSummary> = {}): UserSummary {
  return {
    id,
    keycloakSubject: `kc-${id}`,
    displayName,
    email: `${displayName.toLowerCase()}@example.org`,
    disabled: false,
    drinkRecorder: false,
    boardRole: null,
    roles: ['member'],
    createdAt: '2026-01-01T10:00:00Z',
    ...extra,
  };
}

const manyUsers: PagedResponse<UserSummary> = {
  content: [
    user('u-1', 'Alice', { roles: ['admin'] }),
    user('u-2', 'Bob'),
    user('u-3', 'Carol', { roles: ['board'], boardRole: 'treasurer' }),
    user('u-4', 'Dave'),
    user('u-5', 'Erin'),
    user('u-6', 'Frank'),
    user('u-7', 'Grace'),
  ],
  page: 0,
  size: 25,
  totalElements: 7,
  totalPages: 1,
  sort: '',
};

const audit: PagedResponse<AuditLogEntry> = {
  content: [
    {
      id: 'a-1',
      action: 'user.roles.update',
      targetEntity: 'User',
      targetId: 'u-1',
      actorId: 'admin-1',
      actorDisplayName: 'Admin',
      details: 'Rollen geändert',
      createdAt: '2026-06-01T19:00:00Z',
    },
  ],
  page: 0,
  size: 25,
  totalElements: 1,
  totalPages: 1,
  sort: '',
};

const profile: MemberProfile = {
  id: 'u-1',
  keycloakSubject: 'kc-1',
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

interface AdminInternals {
  selectUser(userId: string): void;
  roleState: Record<string, boolean>;
  saveRoles(userId: string): void;
  onSearch(value: string): void;
  onRoleFilter(value: string): void;
  nextPage(): void;
  openInvite(): void;
  closeInvite(): void;
  inviteOpen(): boolean;
  page(): number;
  filteredUsers(): UserSummary[];
  pagedUsers(): UserSummary[];
}

describe('AdminComponent', () => {
  let groups: { current: ReturnType<typeof vi.fn>; roles: ReturnType<typeof vi.fn> };
  let api: {
    listUsers: ReturnType<typeof vi.fn>;
    listAuditLogs: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    assignRoles: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        provideRouter([]),
        { provide: AdminApiService, useValue: api },
        { provide: StammtischApiService, useValue: groups },
      ],
    });
    const fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    groups = {
      current: vi.fn(() => of({ id: 'st-1', name: 'Kegelclub Nord' })),
      roles: vi.fn(() => of(groupRoles)),
    };
    api = {
      listUsers: vi.fn(() => of(manyUsers)),
      listAuditLogs: vi.fn(() => of(audit)),
      getUser: vi.fn(() => of(profile)),
      assignRoles: vi.fn(() => of(profile)),
      updateUser: vi.fn(() => of(profile)),
      updateStatus: vi.fn(() => of(profile)),
    };
  });

  it('renders the members table and the audit log', async () => {
    const fixture = await create();
    expect(html(fixture)).toContain('Mitglieder & Gruppen');
    expect(html(fixture)).toContain('Kegelclub Nord');
    expect(html(fixture)).not.toContain('Durstige');
    // Die alte Vorschau-Tabelle ohne Speicherfunktion ist entfernt.
    expect(html(fixture)).not.toContain('Rollen & Berechtigungen');
    expect(html(fixture)).toContain('Alice');
    expect(html(fixture)).toContain('user.roles.update');
    // Rollen-Chip nutzt die geteilten Primitive.
    expect(html(fixture)).toContain('Admin');
  });

  it('paginates client-side and only shows one page at a time', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as AdminInternals;
    expect(cmp.filteredUsers().length).toBe(7);
    expect(cmp.pagedUsers().length).toBe(6);
    // Nur eine listUsers-Abfrage; Paginierung erfolgt clientseitig.
    expect(api.listUsers).toHaveBeenCalledTimes(1);

    cmp.nextPage();
    fixture.detectChanges();
    expect(cmp.page()).toBe(1);
    expect(cmp.pagedUsers().length).toBe(1);
    expect(api.listUsers).toHaveBeenCalledTimes(1);
  });

  it('filters members client-side by search and role', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as AdminInternals;

    cmp.onSearch('carol');
    fixture.detectChanges();
    expect(cmp.filteredUsers().map((u) => u.displayName)).toEqual(['Carol']);

    cmp.onSearch('');
    cmp.onRoleFilter('admin');
    fixture.detectChanges();
    expect(cmp.filteredUsers().map((u) => u.displayName)).toEqual(['Alice']);
  });

  it('loads a selected user and can save its roles', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as AdminInternals;
    cmp.selectUser('u-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.getUser).toHaveBeenCalledWith('u-1');

    cmp.roleState = { member: true, board: true, admin: false, tabletRecorder: false, kassenpruefung: false };
    cmp.saveRoles('u-1');
    expect(api.assignRoles).toHaveBeenCalledWith('u-1', { roles: ['member', 'board'] });
  });

  it('offers and saves the group\'s own roles', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as AdminInternals;
    cmp.selectUser('u-1');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(html(fixture)).toContain('Kassenprüfung');
    expect(cmp.roleState).toEqual({
      member: true,
      board: false,
      admin: false,
      tabletRecorder: false,
      kassenpruefung: false,
    });

    cmp.roleState['kassenpruefung'] = true;
    cmp.saveRoles('u-1');
    expect(api.assignRoles).toHaveBeenCalledWith('u-1', { roles: ['member', 'kassenpruefung'] });
  });

  it('falls back to the system roles and a neutral intro when group data is unavailable', async () => {
    groups.current.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    groups.roles.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as AdminInternals;
    expect(html(fixture)).toContain('deiner Gruppe');
    expect(html(fixture)).toContain('Alice');
    cmp.selectUser('u-1');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(Object.keys(cmp.roleState)).toEqual(['member', 'board', 'admin', 'tabletRecorder']);
  });

  it('opens and closes the invitation modal', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as AdminInternals;
    expect(cmp.inviteOpen()).toBe(false);
    cmp.openInvite();
    fixture.detectChanges();
    expect(cmp.inviteOpen()).toBe(true);
    expect(html(fixture)).toContain('Mitglied einladen');
    cmp.closeInvite();
    fixture.detectChanges();
    expect(cmp.inviteOpen()).toBe(false);
  });

  it('shows an empty state when no members match', async () => {
    api.listUsers.mockReturnValue(
      of({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0, sort: '' }),
    );
    const fixture = await create();
    expect(html(fixture)).toContain('keine Mitglieder gefunden');
  });

  it('shows a neutral error state when access is denied', async () => {
    api.listUsers.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
