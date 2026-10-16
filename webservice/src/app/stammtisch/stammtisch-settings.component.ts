import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../api/api-client.service';
import { AuthService } from '../auth/auth.service';
import { TranslatePipe, translate } from '../i18n';
import { ModalComponent } from '../ui/modal.component';
import { StateComponent } from '../ui/state.component';
import {
  StammtischApiService,
  apiErrorText,
  type StammtischDto,
  type StammtischRoleDto,
  type StammtischRolesDto,
} from './stammtisch-api.service';

interface PermissionGroup {
  prefix: string;
  label: string;
  permissions: string[];
}

/** Gruppiert Berechtigungen nach dem Teil vor dem ersten Punkt (`ledger.read` → `ledger`). */
export function groupPermissions(permissions: readonly string[]): PermissionGroup[] {
  const groups = new Map<string, string[]>();
  for (const permission of [...permissions].sort()) {
    const prefix = permission.split('.')[0] || permission;
    groups.set(prefix, [...(groups.get(prefix) ?? []), permission]);
  }
  return [...groups.entries()].map(([prefix, list]) => {
    const key = `stammtisch.permissionGroups.${prefix}`;
    const label = translate(key);
    return { prefix, label: label === key ? prefix : label, permissions: list };
  });
}

/**
 * Einstellungen des gewählten Stammtischs (`/stammtisch`): Name, Rollen mit
 * ihren Berechtigungen und Austritt. Was sichtbar ist, richtet sich nach den
 * eigenen Berechtigungen dieses Stammtischs (`myPermissions`); verbindlich
 * prüft der Fachservice (`deny by default`).
 */
@Component({
  selector: 'app-stammtisch-settings',
  imports: [FormsModule, RouterLink, TranslatePipe, StateComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './stammtisch.css',
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="stammtisch-title">
        <span class="eyebrow">{{ 'stammtisch.settings.eyebrow' | t }}</span>
        @if (stammtisch(); as st) {
          <h1 id="stammtisch-title">{{ st.name }}</h1>
          <p>{{ 'stammtisch.settings.memberCount' | t: { count: st.memberCount } }}</p>
        } @else {
          <h1 id="stammtisch-title">{{ 'stammtisch.settings.title' | t }}</h1>
        }

        @if (canSwitch()) {
          <a class="member-back" routerLink="/stammtische">{{ 'stammtisch.settings.switch' | t }}</a>
        }

        @if (info(); as message) {
          <p class="st-info" role="status">{{ message }}</p>
        }
        @if (error(); as message) {
          <p class="st-error" role="alert">{{ message }}</p>
        }

        @if (loading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" />
        } @else if (loadError(); as message) {
          <vereint-state kind="error" [title]="'stammtisch.settings.unavailable' | t" [message]="message" (retry)="reload()" />
        } @else if (stammtisch(); as st) {
          @if (can('stammtisch.manage')) {
            <section class="st-section" aria-labelledby="st-name-title">
              <h2 class="member-subtitle" id="st-name-title">{{ 'stammtisch.settings.nameTitle' | t }}</h2>
              <form class="st-form" (ngSubmit)="rename()">
                <label>
                  <span class="st-label">{{ 'stammtisch.settings.name' | t }}</span>
                  <input name="stName" [(ngModel)]="name" maxlength="80" required />
                </label>
                <div class="st-actions">
                  <button type="submit" class="member-button" [disabled]="busy() || !name.trim() || name.trim() === st.name">
                    {{ 'common.save' | t }}
                  </button>
                </div>
              </form>
            </section>
          }

          @if (rolesData(); as data) {
            <section class="st-section" aria-labelledby="st-roles-title">
              <div class="st-row">
                <h2 class="member-subtitle" id="st-roles-title">{{ 'stammtisch.roles.title' | t }}</h2>
                @if (canManageRoles()) {
                  <button type="button" class="member-button" (click)="editRole(null)">
                    {{ 'stammtisch.roles.new' | t }}
                  </button>
                }
              </div>
              @if (!canManageRoles()) {
                <p class="member-hint member-muted">{{ 'stammtisch.roles.readOnly' | t }}</p>
              }
              <ul class="member-list">
                @for (role of data.roles; track role.id) {
                  <li class="member-list-item">
                    <div class="st-row">
                      <span class="st-row-main">
                        <span class="member-list-title">
                          {{ role.name }}
                          @if (role.systemRole) {
                            <span class="st-badge">{{ 'stammtisch.roles.system' | t }}</span>
                          }
                        </span>
                        <span class="member-list-meta">
                          <code>{{ role.code }}</code> · {{ 'stammtisch.roles.memberCount' | t: { count: role.memberCount } }}
                        </span>
                        @if (role.description) {
                          <span class="member-list-meta">{{ role.description }}</span>
                        }
                      </span>
                      @if (canManageRoles()) {
                        <span class="st-actions">
                          <button type="button" class="member-button member-button-ghost" (click)="editRole(role)">
                            {{ 'stammtisch.roles.edit' | t }}
                          </button>
                          @if (!role.systemRole) {
                            <button type="button" class="member-button member-button-ghost" [disabled]="busy()" (click)="deleteRole(role)">
                              {{ 'stammtisch.roles.delete' | t }}
                            </button>
                          }
                        </span>
                      }
                    </div>
                    <span class="st-perms" [attr.aria-label]="'stammtisch.roles.permissions' | t">
                      @for (permission of role.permissions; track permission) {
                        <code class="member-badge">{{ permission }}</code>
                      } @empty {
                        <span class="member-list-meta">{{ 'stammtisch.roles.noPermissions' | t }}</span>
                      }
                    </span>
                  </li>
                }
              </ul>
            </section>
          } @else if (rolesError(); as message) {
            <p class="st-error" role="alert">{{ message }}</p>
          }

          <section class="st-section" aria-labelledby="st-leave-title">
            <h2 class="member-subtitle" id="st-leave-title">{{ 'stammtisch.settings.leaveTitle' | t }}</h2>
            <p class="member-hint">{{ 'stammtisch.settings.leaveHint' | t: { name: st.name } }}</p>
            @if (leaveError(); as message) {
              <p class="st-error" role="alert">{{ message }}</p>
            }
            <div class="st-actions" style="margin-top: 0.75rem">
              <button type="button" class="member-button st-danger" [disabled]="busy()" (click)="leave()">
                {{ 'stammtisch.settings.leave' | t }}
              </button>
            </div>
          </section>
        }
      </section>

      <vereint-modal
        [open]="roleFormOpen()"
        [title]="(editingRole() ? 'stammtisch.roles.editTitle' : 'stammtisch.roles.new') | t"
        (closed)="roleFormOpen.set(false)"
      >
        <form class="st-form" (ngSubmit)="saveRole()">
          <label>
            <span class="st-label">{{ 'stammtisch.roles.name' | t }}</span>
            <input name="roleName" [(ngModel)]="roleName" maxlength="64" required />
          </label>
          <label>
            <span class="st-label">{{ 'stammtisch.roles.description' | t }}</span>
            <input name="roleDescription" [(ngModel)]="roleDescription" maxlength="255" />
          </label>
          @for (group of permissionGroups(); track group.prefix) {
            <fieldset class="st-fieldset">
              <legend>{{ group.label }}</legend>
              <div class="st-perm-grid">
                @for (permission of group.permissions; track permission) {
                  <label class="st-check">
                    <input
                      type="checkbox"
                      [checked]="rolePermissions().has(permission)"
                      (change)="togglePermission(permission)"
                    />
                    <code>{{ permission }}</code>
                  </label>
                }
              </div>
            </fieldset>
          }
          @if (formError(); as message) {
            <p class="st-error" role="alert">{{ message }}</p>
          }
          <div class="st-actions" style="justify-content: flex-end">
            <button type="button" class="member-button member-button-ghost" (click)="roleFormOpen.set(false)">
              {{ 'common.cancel' | t }}
            </button>
            <button type="submit" class="member-button" [disabled]="busy() || !roleName.trim()">
              {{ 'common.save' | t }}
            </button>
          </div>
        </form>
      </vereint-modal>
    </main>
  `,
})
export class StammtischSettingsComponent implements OnInit {
  private readonly api = inject(StammtischApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly stammtisch = signal<StammtischDto | null>(null);
  protected readonly rolesData = signal<StammtischRolesDto | null>(null);
  protected readonly rolesError = signal<string | null>(null);
  protected readonly canSwitch = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  protected readonly leaveError = signal<string | null>(null);

  protected readonly roleFormOpen = signal(false);
  protected readonly editingRole = signal<StammtischRoleDto | null>(null);
  protected readonly rolePermissions = signal<Set<string>>(new Set());
  protected readonly formError = signal<string | null>(null);
  protected readonly canManageRoles = computed(() => this.can('roles.manage'));
  protected readonly permissionGroups = computed(() => groupPermissions(this.rolesData()?.knownPermissions ?? []));

  protected name = '';
  protected roleName = '';
  protected roleDescription = '';

  ngOnInit(): void {
    void this.auth.getSession().then((session) => {
      this.canSwitch.set((session?.memberships?.length ?? 0) > 1 || session?.platformAdmin === true);
    });
    this.reload();
  }

  protected can(permission: string): boolean {
    return this.stammtisch()?.myPermissions.includes(permission) ?? false;
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.current().subscribe({
      next: (stammtisch) => {
        this.stammtisch.set(stammtisch);
        this.name = stammtisch.name;
        this.loading.set(false);
        this.loadRoles();
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorText(error));
        this.loading.set(false);
      },
    });
  }

  private loadRoles(): void {
    this.rolesError.set(null);
    if (!this.can('roles.manage') && !this.can('members.read')) {
      this.rolesData.set(null);
      return;
    }
    this.api.roles().subscribe({
      next: (data) => this.rolesData.set(data),
      error: (error: unknown) => this.rolesError.set(apiErrorText(error)),
    });
  }

  protected rename(): void {
    const name = this.name.trim();
    if (!name || this.busy()) return;
    this.start();
    this.api.rename(name).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.stammtisch.set(saved);
        this.name = saved.name;
        this.info.set(translate('stammtisch.settings.renamed'));
        // Name in der Shell (Session) auffrischen.
        void this.auth.getSession(true);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected editRole(role: StammtischRoleDto | null): void {
    this.editingRole.set(role);
    this.roleName = role?.name ?? '';
    this.roleDescription = role?.description ?? '';
    this.rolePermissions.set(new Set(role?.permissions ?? []));
    this.formError.set(null);
    this.roleFormOpen.set(true);
  }

  protected togglePermission(permission: string): void {
    this.rolePermissions.update((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  protected saveRole(): void {
    const name = this.roleName.trim();
    if (!name || this.busy()) return;
    const role = this.editingRole();
    const request = {
      name,
      description: this.roleDescription.trim() || null,
      permissions: [...this.rolePermissions()].sort(),
      ...(role ? { sortOrder: role.sortOrder } : {}),
    };
    this.busy.set(true);
    this.formError.set(null);
    const call = role ? this.api.updateRole(role.id, request) : this.api.createRole(request);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.roleFormOpen.set(false);
        this.loadRoles();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.formError.set(apiErrorText(error));
      },
    });
  }

  protected deleteRole(role: StammtischRoleDto): void {
    if (role.systemRole || this.busy()) return;
    if (!globalThis.confirm?.(translate('stammtisch.roles.deleteConfirm', { name: role.name }))) return;
    this.start();
    this.api.deleteRole(role.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.loadRoles();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected leave(): void {
    const st = this.stammtisch();
    if (!st || this.busy()) return;
    if (!globalThis.confirm?.(translate('stammtisch.settings.leaveConfirm', { name: st.name }))) return;
    this.start();
    this.leaveError.set(null);
    this.api.leave().subscribe({
      next: () => void this.afterLeave(),
      error: (error: unknown) => {
        this.busy.set(false);
        this.leaveError.set(
          error instanceof ApiError && error.code === 'last_role_manager_protected'
            ? error.detail || translate('stammtisch.settings.lastManager')
            : apiErrorText(error),
        );
      },
    });
  }

  private async afterLeave(): Promise<void> {
    await this.auth.selectStammtisch(null);
    await this.auth.getSession(true);
    this.busy.set(false);
    await this.router.navigateByUrl('/stammtische');
  }

  private start(): void {
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.error.set(apiErrorText(error));
  }
}
