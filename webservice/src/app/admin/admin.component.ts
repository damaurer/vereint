import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { AsyncState } from '../member/async-state';
import { describeApiError } from '../api/api-client.service';
import { formatDateTime } from '../member/member-format';
import { auditTargetLabel } from '../board/board-format';
import { AdminApiService } from './admin-api.service';
import { RolesMatrixComponent } from './roles-matrix.component';
import { InviteModalComponent } from './invite-modal.component';
import type { BoardRole, PagedResponse, UserSummary } from '../auth/auth.types';
import type { AuditLogEntry, MemberProfile } from '../api/api.types';
import {
  AvatarBadgeComponent,
  DataTableComponent,
  type DataTableColumn,
  InfoPanelComponent,
  RoleChipComponent,
  StatusBadgeComponent,
  type StatusTone,
} from '../ui';

interface AdminView {
  users: UserSummary[];
  audit: AuditLogEntry[];
}

/** Zuweisbare Rollen inklusive der technischen Tablet-Rolle. */
const ASSIGNABLE_ROLES = ['member', 'board', 'admin', 'tabletRecorder'] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Auswählbare Vorstands-Unterrollen (leer = keine). */
const BOARD_ROLES = ['', 'chair', 'treasurer', 'secretary', 'assessor'] as const;

/** Optionen des clientseitigen Rollenfilters der Mitgliedertabelle. */
const ROLE_FILTERS = [
  { value: 'all', label: 'Rolle: Alle' },
  { value: 'admin', label: 'Admin' },
  { value: 'board', label: 'Vorstand' },
  { value: 'member', label: 'Mitglied' },
] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number]['value'];

/** Seitengröße der clientseitigen Paginierung (siehe Mockup). */
const PAGE_SIZE = 6;

/** Deutscher Klartext der angezeigten Mitgliederrolle. */
function memberRoleLabel(user: UserSummary): string {
  if (user.roles.includes('admin')) return 'Admin';
  switch (user.boardRole) {
    case 'chair':
      return 'Vorsitz';
    case 'treasurer':
      return 'Kassenwart';
    case 'secretary':
      return 'Schriftwart';
    case 'assessor':
      return 'Beisitzer';
    default:
      break;
  }
  if (user.roles.includes('board')) return 'Vorstand';
  return 'Mitglied';
}

/** Nur das Datum eines ISO-Zeitstempels (Beitrittsdatum). */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

/**
 * Administrationsansicht (TICKET-026, Redesign TICKET-038): Mitglieder & Gruppen,
 * Rollen & Berechtigungen sowie Einladungen.
 *
 * Die Mitgliedertabelle nutzt die geteilten `ui/`-Primitive (Tabelle, Avatar,
 * Rollen-Chip, Status-Badge) mit clientseitiger Suche, Filterung und
 * Paginierung. Die Rollen-Matrix und das Einladungs-Modal sind reine
 * Präsentation (siehe Abweichungen im Ticket). Sämtliche `admin-api`-Aufrufe
 * bleiben unverändert; die Rollen-/Statusprüfung (`admin`) verbessert nur die
 * Navigation, die verbindliche Autorisierung erfolgt serverseitig
 * (`deny by default`), unberechtigte Aufrufe erhalten `403`. Die Ansicht wird
 * nur im Browser gerendert und gibt keine privaten Daten in SSR-HTML aus.
 */
@Component({
  selector: 'app-admin',
  imports: [
    FormsModule,
    RouterLink,
    AvatarBadgeComponent,
    DataTableComponent,
    InfoPanelComponent,
    RoleChipComponent,
    StatusBadgeComponent,
    RolesMatrixComponent,
    InviteModalComponent,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="admin-title">
        <span class="eyebrow">Administration</span>
        <h1 id="admin-title">Mitglieder &amp; Gruppen</h1>
        <p>Mitglieder, Rollen und Einladungen der „Durstigen Eber“.</p>
        <a class="member-back" routerLink="/dashboard">← Zur Übersicht</a>

        <vereint-info-panel icon="🛡" title="Administration">
          Rollen und Berechtigungen werden serverseitig autorisiert; hier wird die
          Verwaltung nur vorbereitet.
        </vereint-info-panel>

        @if (actionError(); as err) {
          <p class="manage-action-error" role="alert">{{ err }}</p>
        }
        @if (actionInfo(); as info) {
          <p class="manage-action-info" role="status">{{ info }}</p>
        }

        @if (load.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Benutzer und Protokoll werden abgerufen.</span>
          </div>
        } @else if (load.isError()) {
          <div class="state-card state-error" role="alert">
            <strong>Administration nicht verfügbar</strong>
            <span>{{ load.errorMessage() }}</span>
            <button type="button" class="member-button" (click)="reload()">Erneut versuchen</button>
          </div>
        } @else if (load.data(); as view) {
          <div class="admin-toolbar">
            <div class="admin-filters">
              <label class="manage-field manage-field-grow">
                <span class="sr-only">Mitglieder suchen</span>
                <input
                  name="search"
                  [ngModel]="search()"
                  (ngModelChange)="onSearch($event)"
                  placeholder="Mitglieder suchen …"
                  aria-label="Mitglieder suchen"
                />
              </label>
              <label class="manage-field">
                <span class="sr-only">Nach Rolle filtern</span>
                <select
                  name="roleFilter"
                  [ngModel]="roleFilter()"
                  (ngModelChange)="onRoleFilter($event)"
                  aria-label="Nach Rolle filtern"
                >
                  @for (option of roleFilters; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </label>
            </div>
            <button type="button" class="member-button" (click)="openInvite()">
              + Mitglied einladen
            </button>
          </div>

          <h2 class="member-subtitle">Mitglieder ({{ filteredUsers().length }})</h2>
          <vereint-data-table
            [columns]="columns"
            [rows]="pagedUsers()"
            [cellTemplate]="cell"
            [trackBy]="trackUser"
            emptyLabel="Für die aktuelle Suche wurden keine Mitglieder gefunden."
          />

          <ng-template #cell let-user let-column="column">
            @switch (column.key) {
              @case ('avatar') {
                <vereint-avatar-badge [name]="user.displayName" />
              }
              @case ('name') {
                <span class="admin-name">
                  {{ user.displayName }}
                  @if (user.disabled) { <em class="admin-disabled">(deaktiviert)</em> }
                </span>
              }
              @case ('email') {
                <span class="member-list-meta">{{ user.email ?? '—' }}</span>
              }
              @case ('role') {
                <vereint-role-chip
                  [label]="memberRoleLabel(user)"
                  [tone]="user.roles.includes('admin') ? 'accent' : 'default'"
                />
              }
              @case ('balance') {
                <span class="admin-balance">—</span>
              }
              @case ('status') {
                <vereint-status-badge
                  [label]="user.disabled ? 'Inaktiv' : 'Aktiv'"
                  [tone]="statusTone(user)"
                />
              }
              @case ('joined') {
                <span class="member-list-meta">{{ formatDate(user.createdAt) }}</span>
              }
              @case ('actions') {
                <button type="button" class="member-button" (click)="selectUser(user.id)">
                  Bearbeiten
                </button>
              }
            }
          </ng-template>

          @if (filteredUsers().length > 0) {
            <div class="admin-pagination">
              <span class="member-list-meta">
                Zeige {{ rangeStart() }}–{{ rangeEnd() }} von
                {{ filteredUsers().length }} Mitgliedern
              </span>
              <span class="admin-pagination-actions">
                <button
                  type="button"
                  class="member-button member-button-ghost"
                  [disabled]="page() === 0"
                  (click)="prevPage()"
                >
                  Zurück
                </button>
                <button
                  type="button"
                  class="member-button"
                  [disabled]="page() >= totalPages() - 1"
                  (click)="nextPage()"
                >
                  Weiter
                </button>
              </span>
            </div>
          }

          @if (selectedError(); as serr) {
            <p class="manage-action-error" role="alert">{{ serr }}</p>
          }
          @if (selected(); as user) {
            <h2 class="member-subtitle">{{ user.displayName }} bearbeiten</h2>
            <p class="member-list-meta">ID: {{ user.id }}</p>

            <form class="manage-form" (ngSubmit)="saveRoles(user.id)">
              <fieldset class="admin-fieldset">
                <legend>Rollen</legend>
                @for (role of assignableRoles; track role) {
                  <label class="admin-check">
                    <input type="checkbox" [(ngModel)]="roleState[role]" [name]="'role-' + role" />
                    <span>{{ role }}</span>
                  </label>
                }
              </fieldset>
              <button type="submit" class="member-button" [disabled]="busy()">Rollen speichern</button>
            </form>

            <form class="manage-form manage-inline" (ngSubmit)="saveProfile(user.id)">
              <label class="manage-field">
                <span>Vorstands-Unterrolle</span>
                <select name="boardRole" [(ngModel)]="boardRole">
                  @for (value of boardRoles; track value) {
                    <option [value]="value">{{ value || 'keine' }}</option>
                  }
                </select>
              </label>
              <label class="admin-check">
                <input type="checkbox" name="drinkRecorder" [(ngModel)]="drinkRecorder" />
                <span>Drink Recorder</span>
              </label>
              <button type="submit" class="member-button" [disabled]="busy()">Profil speichern</button>
            </form>

            <form class="manage-form manage-inline" (ngSubmit)="toggleStatus(user.id)">
              <label class="admin-check">
                <input type="checkbox" name="disabled" [(ngModel)]="disabled" />
                <span>Deaktiviert</span>
              </label>
              <button type="submit" class="member-button" [disabled]="busy()">Status speichern</button>
            </form>
          }

          <app-admin-roles-matrix [roleCounts]="roleCounts()" />

          <h2 class="member-subtitle">Audit-Protokoll ({{ view.audit.length }})</h2>
          @if (view.audit.length === 0) {
            <div class="state-card" role="status">
              <strong>Keine Einträge</strong>
              <span>Es liegen keine Protokolleinträge vor.</span>
            </div>
          } @else {
            <ul class="member-list">
              @for (entry of view.audit; track entry.id) {
                <li class="member-list-item">
                  <span class="member-list-title">
                    {{ auditTargetLabel(entry.targetEntity) }} · {{ entry.action }}
                  </span>
                  @if (entry.details) {
                    <span class="member-chat-text">{{ entry.details }}</span>
                  }
                  <span class="member-list-meta">
                    {{ entry.actorDisplayName ?? 'System' }} · {{ formatDateTime(entry.createdAt) }}
                  </span>
                </li>
              }
            </ul>
          }
        }
      </section>
    </main>

    <app-admin-invite-modal [open]="inviteOpen()" (closed)="closeInvite()" />
  `,
  styles: [
    `
      .admin-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        justify-content: space-between;
        gap: 0.75rem;
        margin: 0.75rem 0 1rem;
      }
      .admin-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        flex: 1 1 20rem;
      }
      .manage-form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: end;
        margin: 0.75rem 0 1.5rem;
      }
      .manage-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 12rem;
      }
      .manage-field-grow {
        flex: 1 1 18rem;
      }
      .manage-field input,
      .manage-field select {
        padding: 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        font: inherit;
      }
      .admin-fieldset {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
      }
      .admin-check {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      .admin-disabled {
        color: #b91c1c;
      }
      .admin-name {
        font-weight: 600;
      }
      .admin-balance {
        font-weight: 600;
      }
      .admin-pagination {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin: 0.75rem 0 1.5rem;
      }
      .admin-pagination-actions {
        display: inline-flex;
        gap: 0.5rem;
      }
      .member-chat-text {
        display: block;
      }
      .manage-action-error {
        color: #b91c1c;
        font-weight: 600;
      }
      .manage-action-info {
        color: #15803d;
        font-weight: 600;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class AdminComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminApiService);

  protected readonly load = new AsyncState<AdminView>();
  protected readonly selected = signal<MemberProfile | null>(null);
  protected readonly selectedError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionInfo = signal<string | null>(null);

  protected readonly assignableRoles = ASSIGNABLE_ROLES;
  protected readonly boardRoles = BOARD_ROLES;
  protected readonly roleFilters = ROLE_FILTERS;

  /** Clientseitige Tabellensteuerung (Suche/Filter/Paginierung). */
  protected readonly search = signal('');
  protected readonly roleFilter = signal<RoleFilter>('all');
  protected readonly page = signal(0);
  protected readonly inviteOpen = signal(false);

  /** Nach Suche und Rollenfilter reduzierte Mitgliederliste. */
  protected readonly filteredUsers = computed<UserSummary[]>(() => {
    const users = this.load.data()?.users ?? [];
    const term = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    return users.filter((user) => {
      const matchesTerm =
        !term ||
        user.displayName.toLowerCase().includes(term) ||
        (user.email ?? '').toLowerCase().includes(term);
      const matchesRole = role === 'all' || user.roles.includes(role);
      return matchesTerm && matchesRole;
    });
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredUsers().length / PAGE_SIZE)),
  );

  /** Auf die aktuelle Seite zugeschnittene Mitglieder. */
  protected readonly pagedUsers = computed<UserSummary[]>(() => {
    const start = this.page() * PAGE_SIZE;
    return this.filteredUsers().slice(start, start + PAGE_SIZE);
  });

  protected readonly rangeStart = computed(() =>
    this.filteredUsers().length === 0 ? 0 : this.page() * PAGE_SIZE + 1,
  );

  protected readonly rangeEnd = computed(() =>
    Math.min(this.filteredUsers().length, (this.page() + 1) * PAGE_SIZE),
  );

  /** Mitgliederverteilung für die Karten der Rollen-Matrix. */
  protected readonly roleCounts = computed(() => {
    const users = this.load.data()?.users ?? [];
    const counts = { admin: 0, treasurer: 0, secretary: 0, host: 0, member: 0 };
    for (const user of users) {
      if (user.roles.includes('admin')) counts.admin++;
      else if (user.boardRole === 'treasurer') counts.treasurer++;
      else if (user.boardRole === 'secretary') counts.secretary++;
      else if (user.boardRole === 'chair') counts.host++;
      else counts.member++;
    }
    return counts;
  });

  protected roleState: Record<AssignableRole, boolean> = {
    member: false,
    board: false,
    admin: false,
    tabletRecorder: false,
  };
  protected boardRole: '' | BoardRole = '';
  protected drinkRecorder = false;
  protected disabled = false;

  /** Spalten der Mitgliedertabelle (geteilte `DataTable`, Zellen via Vorlage). */
  protected readonly columns: DataTableColumn<UserSummary>[] = [
    { key: 'avatar', header: 'Avatar' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'E-Mail' },
    { key: 'role', header: 'Rolle' },
    { key: 'balance', header: 'Guthaben' },
    { key: 'status', header: 'Status' },
    { key: 'joined', header: 'Beitrittsdatum' },
    { key: 'actions', header: 'Aktionen' },
  ];

  protected readonly trackUser = (_index: number, user: UserSummary): string => user.id;

  protected readonly formatDateTime = formatDateTime;
  protected readonly formatDate = formatDate;
  protected readonly auditTargetLabel = auditTargetLabel;
  protected readonly memberRoleLabel = memberRoleLabel;

  protected statusTone(user: UserSummary): StatusTone {
    return user.disabled ? 'neutral' : 'success';
  }

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.page.set(0);
    this.load.run(
      forkJoin({
        users: this.api.listUsers().pipe(map((page: PagedResponse<UserSummary>) => page.content)),
        audit: this.api.listAuditLogs().pipe(map((page) => page.content)),
      }),
    );
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.page.set(0);
  }

  protected onRoleFilter(value: RoleFilter): void {
    this.roleFilter.set(value);
    this.page.set(0);
  }

  protected prevPage(): void {
    this.page.update((current) => Math.max(0, current - 1));
  }

  protected nextPage(): void {
    this.page.update((current) => Math.min(this.totalPages() - 1, current + 1));
  }

  protected openInvite(): void {
    this.inviteOpen.set(true);
  }

  protected closeInvite(): void {
    this.inviteOpen.set(false);
  }

  protected selectUser(userId: string): void {
    this.selectedError.set(null);
    this.selected.set(null);
    this.api.getUser(userId).subscribe({
      next: (profile) => {
        this.selected.set(profile);
        this.roleState = {
          member: profile.roles.includes('member'),
          board: profile.roles.includes('board'),
          admin: profile.roles.includes('admin'),
          tabletRecorder: (profile.roles as string[]).includes('tabletRecorder'),
        };
        this.boardRole = profile.boardRole ?? '';
        this.drinkRecorder = profile.drinkRecorder;
        this.disabled = profile.disabled;
      },
      error: (error: unknown) => this.selectedError.set(describeApiError(error)),
    });
  }

  private runAction(source: ReturnType<AdminApiService['getUser']>, successInfo: string): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    source.subscribe({
      next: (profile) => {
        this.busy.set(false);
        this.actionInfo.set(successInfo);
        this.selected.set(profile);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(describeApiError(error));
      },
    });
  }

  protected saveRoles(userId: string): void {
    const roles = this.assignableRoles.filter((role) => this.roleState[role]);
    this.runAction(this.api.assignRoles(userId, { roles }), 'Rollen gespeichert.');
  }

  protected saveProfile(userId: string): void {
    this.runAction(
      this.api.updateUser(userId, {
        boardRole: this.boardRole || null,
        drinkRecorder: this.drinkRecorder,
      }),
      'Profil gespeichert.',
    );
  }

  protected toggleStatus(userId: string): void {
    this.runAction(
      this.api.updateStatus(userId, { disabled: this.disabled }),
      'Status gespeichert.',
    );
  }
}
