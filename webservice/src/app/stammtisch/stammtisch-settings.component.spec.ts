import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { AuthService } from '../auth/auth.service';
import { GroupImageError, GroupImagePreparer } from './group-image';
import {
  StammtischApiService,
  type StammtischDto,
  type StammtischRolesDto,
} from './stammtisch-api.service';
import { StammtischSettingsComponent, groupPermissions } from './stammtisch-settings.component';

interface SettingsInternals {
  leave(): void;
  pickImage(event: Event): Promise<void>;
  removeImage(): void;
  error(): string | null;
  stammtisch(): StammtischDto | null;
  leaveError(): string | null;
  info(): string | null;
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

function stammtisch(permissions: string[], imageVersion: number | null = null): StammtischDto {
  return {
    id: 'st-1',
    name: 'Eber',
    memberCount: 5,
    myRoles: [],
    myPermissions: permissions,
    createdAt: '2026-01-01T10:00:00Z',
    imageVersion,
  };
}

const buttonByText = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

/** `change`-Ereignis einer Dateiauswahl mit genau dieser Datei. */
function fileEvent(file: File): Event {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: [file] });
  return { target: input } as unknown as Event;
}

describe('StammtischSettingsComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let auth: { getSession: ReturnType<typeof vi.fn>; selectStammtisch: ReturnType<typeof vi.fn> };
  let preparer: { prepare: ReturnType<typeof vi.fn> };

  const create = async (
    permissions: string[],
    imageVersion: number | null = null,
  ) => {
    api = {
      current: vi.fn(() => of(stammtisch(permissions, imageVersion))),
      uploadImage: vi.fn(() => of({ imageVersion: 9 })),
      removeImage: vi.fn(() => of(undefined)),
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
    preparer = { prepare: vi.fn(async (file: File) => ({ blob: new Blob(['jpeg']), filename: 'gruppe.jpg', file })) };
    TestBed.configureTestingModule({
      imports: [StammtischSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: StammtischApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: GroupImagePreparer, useValue: preparer },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
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
    expect(text).toContain('Name der Gruppe');
    const deleteButtons = [...fixture.nativeElement.querySelectorAll('button')].filter(
      (b: HTMLButtonElement) => b.textContent?.trim() === 'Löschen',
    );
    expect(deleteButtons.length).toBe(1);
  });

  describe('group picture', () => {
    it('shows the picture next to the name and lets managers change or remove it', async () => {
      const { fixture } = await create(['stammtisch.manage'], 3);
      const root = fixture.nativeElement as HTMLElement;
      const img = root.querySelector('.st-identity vereint-group-avatar img') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('/api/v1/stammtische/st-1/image?v=3');
      expect(img.getAttribute('alt')).toBe('Bild der Gruppe Eber');
      expect(buttonByText(root, 'Bild ändern')).toBeTruthy();
      expect(buttonByText(root, 'Bild entfernen')).toBeTruthy();
      expect(root.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('image/png,image/jpeg,image/gif');
    });

    it('shows initials without a picture and no upload without stammtisch.manage', async () => {
      const { fixture } = await create([]);
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.st-identity vereint-group-avatar img')).toBeNull();
      expect(root.querySelector('.st-identity vereint-group-avatar')?.textContent?.trim()).toBe('E');
      expect(root.querySelector('input[type="file"]')).toBeNull();
      expect(buttonByText(root, 'Bild hochladen')).toBeUndefined();
    });

    it('scales the chosen picture, uploads it and refreshes the session', async () => {
      const { fixture, cmp } = await create(['stammtisch.manage']);
      expect(buttonByText(fixture.nativeElement, 'Bild hochladen')).toBeTruthy();
      const file = new File(['png'], 'logo.png', { type: 'image/png' });
      await cmp.pickImage(fileEvent(file));
      expect(preparer.prepare).toHaveBeenCalledWith(file);
      expect(api['uploadImage']).toHaveBeenCalledWith(expect.any(Blob), 'gruppe.jpg');
      expect(cmp.stammtisch()?.imageVersion).toBe(9);
      expect(cmp.info()).toBe('Das Bild wurde gespeichert.');
      expect(auth.getSession).toHaveBeenCalledWith(true);
    });

    it('reports an unsuitable file without uploading', async () => {
      const { cmp } = await create(['stammtisch.manage']);
      preparer.prepare.mockRejectedValue(new GroupImageError('Bitte wähle ein Bild im Format PNG, JPEG oder GIF.'));
      await cmp.pickImage(fileEvent(new File(['x'], 'x.webp', { type: 'image/webp' })));
      expect(api['uploadImage']).not.toHaveBeenCalled();
      expect(cmp.error()).toContain('PNG, JPEG oder GIF');
    });

    it('shows the problem detail of a rejected upload', async () => {
      const { cmp } = await create(['stammtisch.manage']);
      api['uploadImage'].mockReturnValue(throwError(() => new ApiError(400, 'image_too_large', 'Das Bild ist zu groß.')));
      await cmp.pickImage(fileEvent(new File(['png'], 'logo.png', { type: 'image/png' })));
      expect(cmp.error()).toBe('Das Bild ist zu groß.');
      expect(cmp.stammtisch()?.imageVersion).toBeNull();
    });

    it('removes the picture after confirmation', async () => {
      const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      const { cmp } = await create(['stammtisch.manage'], 3);
      cmp.removeImage();
      expect(api['removeImage']).toHaveBeenCalled();
      expect(cmp.stammtisch()?.imageVersion).toBeNull();
      expect(cmp.info()).toBe('Das Bild wurde entfernt.');
      confirm.mockRestore();
    });
  });

  it('shows roles read-only with members.read only', async () => {
    const { fixture } = await create(['members.read']);
    const text = fixture.nativeElement.textContent as string;
    expect(api['roles']).toHaveBeenCalled();
    expect(text).toContain('Kasse');
    expect(text).not.toContain('Neue Rolle');
    expect(text).not.toContain('Name der Gruppe');
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
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/gruppen'));
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

  describe('export', () => {
    it('is hidden from plain members, and there is no plan or payment', async () => {
      const { fixture } = await create([]);
      const text = fixture.nativeElement.textContent as string;
      expect(text).not.toContain('Daten exportieren');
      expect(text).not.toContain('Tarif');
      expect(text).not.toContain('€');
    });

    it('is offered to group managers', async () => {
      const { fixture } = await create(['stammtisch.manage']);
      const root = fixture.nativeElement as HTMLElement;
      expect(root.textContent).toContain('Daten exportieren');
      expect(root.querySelector('a[download]')?.getAttribute('href')).toBe('/api/v1/stammtisch/export');
    });
  });
});
