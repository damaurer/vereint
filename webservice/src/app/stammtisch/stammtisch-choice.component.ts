import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthNavigationService } from '../auth/auth-navigation.service';
import { AuthService } from '../auth/auth.service';
import { TranslatePipe, translate } from '../i18n';
import { IconComponent } from '../ui/icon.component';
import { StateComponent } from '../ui/state.component';
import { GroupAvatarComponent } from './group-avatar.component';
import { StammtischApiService, apiErrorText, type StammtischMembershipDto } from './stammtisch-api.service';

/** Nur relative Ziele innerhalb der App (kein `//host`). */
function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/**
 * Stammtisch-Auswahl (`/gruppen`), außerhalb der App-Shell.
 *
 * Listet die eigenen Mitgliedschaften; „Öffnen“ wählt den Stammtisch für diese
 * Session (HttpOnly-Cookie in Express) und kehrt zum Ziel `returnTo` zurück.
 * Mit genau einer Mitgliedschaft und ohne Auswahl geschieht das von selbst.
 * Ohne Mitgliedschaft hilft ein Einladungslink des Vorstands – oder ein
 * eigener Stammtisch (`/gruppe-eroeffnen`).
 */
@Component({
  selector: 'app-stammtisch-choice',
  imports: [RouterLink, TranslatePipe, IconComponent, StateComponent, GroupAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './stammtisch.css',
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="stammtische-title">
        <span class="eyebrow">{{ 'stammtisch.choice.eyebrow' | t }}</span>
        <h1 id="stammtische-title">{{ 'stammtisch.choice.title' | t }}</h1>
        <p>{{ 'stammtisch.choice.intro' | t }}</p>

        @if (error(); as message) {
          <p class="st-error" role="alert">{{ message }}</p>
        }

        @if (loading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" />
        } @else if (memberships().length === 0) {
          <vereint-state
            kind="empty"
            icon="users"
            [title]="'stammtisch.choice.emptyTitle' | t"
            [message]="'stammtisch.choice.emptyMessage' | t"
          />
        } @else {
          <ul class="st-choices">
            @for (item of memberships(); track item.id) {
              <li>
                <button
                  type="button"
                  class="st-choice"
                  [class.st-current]="item.id === currentId()"
                  [disabled]="busyId() !== null"
                  (click)="open(item.id)"
                >
                  <vereint-group-avatar [groupId]="item.id" [name]="item.name" [imageVersion]="item.imageVersion" size="2.75rem" />
                  <span class="st-row-main">
                    <span class="st-choice-name">{{ item.name }}</span>
                    @if (item.roles.length > 0) {
                      <span class="member-list-meta">{{ rolesText(item.roles) }}</span>
                    }
                  </span>
                  <span class="visually-hidden">
                    {{ (busyId() === item.id ? 'stammtisch.choice.opening' : 'stammtisch.choice.open') | t }}
                  </span>
                  @if (item.id === currentId()) {
                    <span class="st-badge st-badge-brand">{{ 'stammtisch.choice.current' | t }}</span>
                  } @else {
                    <vereint-icon class="st-choice-chevron" name="chevron-right" />
                  }
                </button>
              </li>
            }
          </ul>
        }

        @if (!loading()) {
          <p class="st-open-own">
            <a routerLink="/gruppe-eroeffnen">
              <span class="st-open-own-title">
                <vereint-icon name="plus" /> {{ 'stammtisch.choice.openOwn' | t }}
              </span>
            </a>
          </p>
        }

        <div class="st-footer-links">
          @if (platformAdmin()) {
            <a routerLink="/plattform"><vereint-icon name="admin" /> {{ 'stammtisch.choice.platform' | t }}</a>
          }
          <button type="button" class="st-link-button" (click)="logout()">
            <vereint-icon name="logout" /> {{ 'shell.logout' | t }}
          </button>
        </div>
      </section>
    </main>
  `,
})
export class StammtischChoiceComponent implements OnInit {
  private readonly api = inject(StammtischApiService);
  private readonly auth = inject(AuthService);
  private readonly authNavigation = inject(AuthNavigationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly memberships = signal<StammtischMembershipDto[]>([]);
  protected readonly currentId = signal<string | null>(null);
  protected readonly platformAdmin = signal(false);
  protected readonly busyId = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const session = await this.auth.getSession();
    this.currentId.set(session?.stammtisch?.id ?? null);
    this.platformAdmin.set(session?.platformAdmin === true);
    try {
      this.memberships.set(await firstValueFrom(this.api.listMine()));
    } catch (error) {
      // Die Session kennt die Mitgliedschaften ebenfalls; sie reichen zum Auswählen.
      const fallback = session?.memberships ?? [];
      this.memberships.set(fallback.map((m) => ({ ...m, boardRole: m.boardRole ?? null })));
      if (fallback.length === 0) this.error.set(apiErrorText(error));
    }
    // Genau eine Gruppe und noch keine gewählt (etwa direkt nach Eröffnen und
    // Anmelden): ohne Klick hinein. Ab zwei Gruppen bleibt die Auswahl.
    const only = this.memberships();
    if (this.currentId() === null && only.length === 1) {
      await this.open(only[0].id);
    }
    this.loading.set(false);
  }

  /** Rollen lesbar, die höchste zuerst (z. B. „Admin, Vorstand, Mitglied“). */
  protected rolesText(roles: string[]): string {
    return roles
      .map((role) => {
        const key = `admin.roles.${role}`;
        const label = translate(key);
        return label === key ? role : label;
      })
      .join(' · ');
  }

  protected async open(id: string): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(id);
    this.error.set(null);
    const ok = await this.auth.selectStammtisch(id);
    if (!ok) {
      this.busyId.set(null);
      this.error.set(translate('stammtisch.choice.selectFailed'));
      return;
    }
    await this.auth.getSession(true);
    this.busyId.set(null);
    await this.router.navigateByUrl(safeReturnTo(this.route.snapshot.queryParamMap.get('returnTo')));
  }

  protected logout(): void {
    void this.authNavigation.logout();
  }
}
