import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { AccountDeletionPreview } from '../api/api.types';
import { AuthNavigationService } from '../auth/auth-navigation.service';
import { AccountDeletionComponent } from './account-deletion.component';
import { MemberApiService } from './member-api.service';

const preview = (overrides: Partial<AccountDeletionPreview> = {}): AccountDeletionPreview => ({
  blockingGroups: [],
  archivedGroups: [],
  leftGroups: [{ id: 'g-1', name: 'Stammtisch' }],
  balances: [{ groupId: 'g-1', groupName: 'Stammtisch', currency: 'EUR', creditBalance: '12.50' }],
  loginDeletion: true,
  platformAdmin: false,
  ...overrides,
});

describe('AccountDeletionComponent', () => {
  let api: {
    previewAccountDeletion: ReturnType<typeof vi.fn>;
    deleteAccount: ReturnType<typeof vi.fn>;
  };
  let navigation: { logout: ReturnType<typeof vi.fn> };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [AccountDeletionComponent],
      providers: [
        provideRouter([]),
        { provide: MemberApiService, useValue: api },
        { provide: AuthNavigationService, useValue: navigation },
      ],
    });
    const fixture = TestBed.createComponent(AccountDeletionComponent);
    fixture.detectChanges();
    return fixture;
  };

  const openDialog = async (fixture: Awaited<ReturnType<typeof create>>) => {
    await fixture.componentInstance.openDialog();
    fixture.detectChanges();
  };

  const confirmButton = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Konto endgültig löschen'),
    );

  beforeEach(() => {
    api = {
      previewAccountDeletion: vi.fn(() => of(preview())),
      deleteAccount: vi.fn(() => of({ loginDeleted: true })),
    };
    navigation = { logout: vi.fn(async () => true) };
  });

  it('shows what happens and only deletes after typing the confirmation word', async () => {
    const fixture = await create();
    await openDialog(fixture);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Deine Mitgliedschaft endet in: Stammtisch.');
    expect(root.textContent).toContain('12,50');
    expect(confirmButton(root)?.disabled).toBe(true);

    fixture.componentInstance.typed.set('löschen');
    fixture.detectChanges();
    expect(confirmButton(root)?.disabled).toBe(false);

    await fixture.componentInstance.confirmDelete();
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
    expect(navigation.logout).toHaveBeenCalledTimes(1);
  });

  it('blocks deleting while the person is the last manager of a group', async () => {
    api.previewAccountDeletion.mockReturnValue(
      of(preview({ blockingGroups: [{ id: 'g-2', name: 'Kegelclub' }] })),
    );
    const fixture = await create();
    await openDialog(fixture);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Kegelclub');
    expect(root.querySelector('#account-delete-confirm')).toBeNull();
    fixture.componentInstance.typed.set('LÖSCHEN');
    await fixture.componentInstance.confirmDelete();
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });

  it('shows the server message when deleting is refused', async () => {
    api.deleteAccount.mockReturnValue(
      throwError(
        () =>
          new ApiError(
            409,
            'account_deletion_blocked',
            'Du bist die letzte Person mit Verwaltungsrechten.',
          ),
      ),
    );
    const fixture = await create();
    await openDialog(fixture);
    fixture.componentInstance.typed.set('LÖSCHEN');
    await fixture.componentInstance.confirmDelete();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'letzte Person mit Verwaltungsrechten',
    );
    expect(navigation.logout).not.toHaveBeenCalled();
  });
});
