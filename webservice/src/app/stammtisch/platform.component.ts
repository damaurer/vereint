import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, translate } from '../i18n';
import { formatDateTime } from '../member/member-format';
import { StateComponent } from '../ui/state.component';
import { StammtischApiService, apiErrorText, type PlatformStammtischDto } from './stammtisch-api.service';

/**
 * Plattform-Administration (`/plattform`), außerhalb der App-Shell und nur für
 * Plattform-Admins: alle Stammtische mit Mitgliederzahl, neu anlegen,
 * umbenennen sowie archivieren bzw. wiederherstellen.
 */
@Component({
  selector: 'app-platform',
  imports: [FormsModule, RouterLink, TranslatePipe, StateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './stammtisch.css',
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="platform-title">
        <a class="member-back" routerLink="/stammtische">{{ 'stammtisch.platform.back' | t }}</a>
        <span class="eyebrow">{{ 'stammtisch.platform.eyebrow' | t }}</span>
        <h1 id="platform-title">{{ 'stammtisch.platform.title' | t }}</h1>
        <p>{{ 'stammtisch.platform.intro' | t }}</p>

        <h2 class="member-subtitle">{{ 'stammtisch.platform.createTitle' | t }}</h2>
        <form class="st-form" (ngSubmit)="create()">
          <div class="st-form-grid">
            <label>
              <span class="st-label">{{ 'stammtisch.platform.name' | t }}</span>
              <input name="newName" [(ngModel)]="newName" maxlength="80" required />
            </label>
            <label>
              <span class="st-label">{{ 'stammtisch.platform.adminEmail' | t }}</span>
              <input name="adminEmail" type="email" [(ngModel)]="adminEmail" maxlength="255" autocomplete="off" />
            </label>
          </div>
          <p class="member-hint member-muted">{{ 'stammtisch.platform.adminEmailHint' | t }}</p>
          <div class="st-actions">
            <button type="submit" class="member-button" [disabled]="busy() || !newName.trim()">
              {{ 'stammtisch.platform.create' | t }}
            </button>
          </div>
        </form>

        @if (info(); as message) {
          <p class="st-info" role="status">{{ message }}</p>
        }
        @if (error(); as message) {
          <p class="st-error" role="alert">{{ message }}</p>
        }

        <h2 class="member-subtitle">{{ 'stammtisch.platform.listTitle' | t }}</h2>
        @if (loading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" />
        } @else if (loadError(); as message) {
          <vereint-state kind="error" [title]="'stammtisch.platform.unavailable' | t" [message]="message" (retry)="reload()" />
        } @else if (items().length === 0) {
          <vereint-state kind="empty" [title]="'stammtisch.platform.empty' | t" />
        } @else {
          <ul class="member-list">
            @for (item of items(); track item.id) {
              <li class="member-list-item">
                @if (editingId() === item.id) {
                  <form class="st-form" (ngSubmit)="saveName(item)">
                    <label>
                      <span class="st-label">{{ 'stammtisch.platform.name' | t }}</span>
                      <input name="editName" [(ngModel)]="editName" maxlength="80" required />
                    </label>
                    <div class="st-actions">
                      <button type="button" class="member-button member-button-ghost" (click)="editingId.set(null)">
                        {{ 'common.cancel' | t }}
                      </button>
                      <button type="submit" class="member-button" [disabled]="busy() || !editName.trim()">
                        {{ 'common.save' | t }}
                      </button>
                    </div>
                  </form>
                } @else {
                  <div class="st-row">
                    <span class="st-row-main">
                      <span class="member-list-title">
                        {{ item.name }}
                        @if (item.archived) {
                          <span class="st-badge">{{ 'stammtisch.platform.archived' | t }}</span>
                        }
                      </span>
                      <span class="member-list-meta">
                        {{ 'stammtisch.platform.members' | t: { count: item.memberCount } }} ·
                        {{ 'stammtisch.platform.createdAt' | t: { date: formatDateTime(item.createdAt) } }}
                      </span>
                    </span>
                    <span class="st-actions">
                      <button type="button" class="member-button member-button-ghost" (click)="startEdit(item)">
                        {{ 'stammtisch.platform.rename' | t }}
                      </button>
                      <button type="button" class="member-button member-button-ghost" [disabled]="busy()" (click)="toggleArchived(item)">
                        {{ (item.archived ? 'stammtisch.platform.unarchive' : 'stammtisch.platform.archive') | t }}
                      </button>
                    </span>
                  </div>
                }
              </li>
            }
          </ul>
        }
      </section>
    </main>
  `,
})
export class PlatformComponent implements OnInit {
  private readonly api = inject(StammtischApiService);

  protected readonly formatDateTime = formatDateTime;
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly items = signal<PlatformStammtischDto[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);

  protected newName = '';
  protected adminEmail = '';
  protected editName = '';

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.platformList().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorText(error));
        this.loading.set(false);
      },
    });
  }

  protected create(): void {
    const name = this.newName.trim();
    if (!name || this.busy()) return;
    const adminEmail = this.adminEmail.trim();
    this.start();
    this.api.platformCreate({ name, ...(adminEmail ? { adminEmail } : {}) }).subscribe({
      next: (created) => {
        this.busy.set(false);
        this.newName = '';
        this.adminEmail = '';
        this.info.set(translate('stammtisch.platform.created', { name: created.name }));
        this.reload();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected startEdit(item: PlatformStammtischDto): void {
    this.editName = item.name;
    this.editingId.set(item.id);
  }

  protected saveName(item: PlatformStammtischDto): void {
    const name = this.editName.trim();
    if (!name || this.busy()) return;
    this.start();
    this.api.platformUpdate(item.id, { name }).subscribe({
      next: (saved) => this.applied(saved),
      error: (error: unknown) => this.fail(error),
    });
  }

  protected toggleArchived(item: PlatformStammtischDto): void {
    if (this.busy()) return;
    if (!item.archived && !globalThis.confirm?.(translate('stammtisch.platform.archiveConfirm', { name: item.name }))) {
      return;
    }
    this.start();
    this.api.platformUpdate(item.id, { archived: !item.archived }).subscribe({
      next: (saved) => this.applied(saved),
      error: (error: unknown) => this.fail(error),
    });
  }

  private start(): void {
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
  }

  private applied(saved: PlatformStammtischDto): void {
    this.busy.set(false);
    this.editingId.set(null);
    this.items.update((list) => list.map((entry) => (entry.id === saved.id ? saved : entry)));
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.error.set(apiErrorText(error));
  }
}
