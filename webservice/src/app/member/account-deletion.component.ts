import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiError, describeApiError } from '../api/api-client.service';
import type { AccountDeletionPreview } from '../api/api.types';
import { AuthNavigationService } from '../auth/auth-navigation.service';
import { TranslatePipe, translate } from '../i18n';
import { ModalComponent } from '../ui/modal.component';
import { MemberApiService } from './member-api.service';
import { formatMoney } from './member-format';

/**
 * „Konto löschen“ im Profil (#152).
 *
 * Öffnet einen Dialog mit der Vorschau des Fachservices: welche Gruppen enden,
 * welche archiviert werden, welche das Löschen blockieren und wo noch Guthaben
 * offen ist. Gelöscht wird erst, wenn die Person das Bestätigungswort eintippt.
 * Danach meldet die App ab.
 */
@Component({
  selector: 'app-account-deletion',
  imports: [ModalComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="member-subtitle">{{ 'profile.deletion.title' | t }}</h2>
    <p class="member-hint">{{ 'profile.deletion.hint' | t }}</p>
    <button type="button" class="member-button account-delete-button" (click)="openDialog()">
      {{ 'profile.deletion.open' | t }}
    </button>

    <vereint-modal
      [open]="open()"
      [title]="'profile.deletion.dialogTitle' | t"
      [dismissible]="!deleting()"
      (closed)="close()"
    >
      @if (loading()) {
        <p class="member-hint" role="status">{{ 'common.loading' | t }}</p>
      } @else if (preview(); as p) {
        <div class="account-delete-body">
          <p class="member-hint">{{ 'profile.deletion.removed' | t }}</p>
          <p class="member-hint">{{ 'profile.deletion.kept' | t }}</p>

          @if (p.blockingGroups.length > 0) {
            <p class="member-hint member-hint-error" role="alert">
              {{ 'profile.deletion.blocked' | t: { groups: names(p.blockingGroups) } }}
            </p>
          }
          @if (p.archivedGroups.length > 0) {
            <p class="member-hint">
              {{ 'profile.deletion.archived' | t: { groups: names(p.archivedGroups) } }}
            </p>
          }
          @if (p.leftGroups.length > 0) {
            <p class="member-hint">
              {{ 'profile.deletion.left' | t: { groups: names(p.leftGroups) } }}
            </p>
          }
          @for (balance of p.balances; track balance.groupId) {
            <p class="member-hint">
              {{
                'profile.deletion.balance'
                  | t
                    : {
                        group: balance.groupName,
                        amount: money(balance.creditBalance, balance.currency),
                      }
              }}
            </p>
          }
          @if (p.platformAdmin) {
            <p class="member-hint">{{ 'profile.deletion.platformAdmin' | t }}</p>
          }
          @if (!p.loginDeletion) {
            <p class="member-hint">{{ 'profile.deletion.loginManual' | t }}</p>
          }

          @if (p.blockingGroups.length === 0) {
            <label class="member-field">
              <span>{{ 'profile.deletion.confirmLabel' | t: { word: confirmWord } }}</span>
              <input
                id="account-delete-confirm"
                name="confirm"
                type="text"
                autocomplete="off"
                [value]="typed()"
                (input)="typed.set($any($event.target).value)"
              />
            </label>
          }
        </div>
      }

      @if (error(); as message) {
        <p class="member-hint member-hint-error" role="alert">{{ message }}</p>
      }

      <div class="account-delete-actions">
        <button
          type="button"
          class="member-button member-button-ghost"
          [disabled]="deleting()"
          (click)="close()"
        >
          {{ 'common.cancel' | t }}
        </button>
        <button
          type="button"
          class="member-button account-delete-button"
          [disabled]="!canDelete() || deleting()"
          (click)="confirmDelete()"
        >
          {{ (deleting() ? 'profile.deletion.deleting' : 'profile.deletion.confirm') | t }}
        </button>
      </div>
    </vereint-modal>
  `,
  styles: [
    `
      .account-delete-button {
        background-color: var(--color-danger);
        color: #fff;
      }

      .account-delete-button:hover:not(:disabled) {
        background-color: var(--color-danger);
        filter: brightness(0.92);
      }

      .account-delete-body {
        display: grid;
        gap: var(--space-2);
      }

      .account-delete-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--space-1);
        margin-top: var(--space-3);
      }
    `,
  ],
})
export class AccountDeletionComponent {
  private readonly api = inject(MemberApiService);
  private readonly navigation = inject(AuthNavigationService);

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly deleting = signal(false);
  readonly preview = signal<AccountDeletionPreview | null>(null);
  readonly typed = signal('');
  readonly error = signal<string | null>(null);

  get confirmWord(): string {
    return translate('profile.deletion.confirmWord');
  }

  readonly canDelete = computed(() => {
    const p = this.preview();
    return (
      !!p &&
      p.blockingGroups.length === 0 &&
      this.typed().trim().toLocaleUpperCase() === this.confirmWord.toLocaleUpperCase()
    );
  });

  async openDialog(): Promise<void> {
    this.open.set(true);
    this.typed.set('');
    this.error.set(null);
    this.preview.set(null);
    this.loading.set(true);
    try {
      this.preview.set(await firstValueFrom(this.api.previewAccountDeletion()));
    } catch (error) {
      this.error.set(describeApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    if (this.deleting()) return;
    this.open.set(false);
  }

  async confirmDelete(): Promise<void> {
    if (!this.canDelete()) return;
    this.deleting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.deleteAccount());
      this.open.set(false);
      await this.navigation.logout();
    } catch (error) {
      this.error.set(
        error instanceof ApiError && error.code === 'account_deletion_blocked' && error.detail
          ? error.detail
          : describeApiError(error),
      );
    } finally {
      this.deleting.set(false);
    }
  }

  names(groups: { name: string }[]): string {
    return groups.map((group) => group.name).join(', ');
  }

  money(amount: string, currency: string): string {
    return formatMoney(amount, currency);
  }
}
