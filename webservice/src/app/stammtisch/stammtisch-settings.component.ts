import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import { ApiError } from '../api/api-client.service';
import { AuthService } from '../auth/auth.service';
import { TranslatePipe, translate } from '../i18n';
import { ModalComponent } from '../ui/modal.component';
import { StateComponent } from '../ui/state.component';
import { BillingStatusStore, ExternalNavigation } from './billing-status';
import { billingStatusLabel, formatBytes, formatCents, formatDay, planName, usagePercent } from './billing-format';
import {
  STAMMTISCH_EXPORT_URL,
  StammtischApiService,
  apiErrorText,
  type BillingInterval,
  type BillingOverviewDto,
  type BillingRedirectDto,
  type PlanOfferDto,
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

/** Rückkehr von Stripe (`?billing=…`) und die passende Meldung. */
const BILLING_RETURN_MESSAGES: Record<string, string> = {
  success: 'stammtisch.billing.success',
  thanks: 'stammtisch.billing.thanks',
  canceled: 'stammtisch.billing.canceled',
};

/** Nach erfolgreicher Buchung trifft der Stripe-Webhook kurz danach ein. */
const BILLING_ACTIVATION_DELAY_MS = 4000;

/**
 * Einstellungen des gewählten Stammtischs (`/stammtisch`): Name, Tarif mit
 * Verbrauch und Zahlung, Datenexport, Rollen mit ihren Berechtigungen und Austritt. Was sichtbar ist, richtet sich nach den
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

          <section class="st-section" aria-labelledby="st-billing-title">
            <h2 class="member-subtitle" id="st-billing-title">{{ 'stammtisch.billing.title' | t }}</h2>
            @if (billing(); as b) {
              @if (b.readOnly) {
                <p class="st-error" role="alert">{{ 'stammtisch.billing.readOnly' | t }}</p>
              } @else if (b.status === 'past_due') {
                <p class="st-error" role="alert">
                  {{ b.graceUntil ? ('stammtisch.billing.pastDue' | t: { date: formatDay(b.graceUntil) }) : ('stammtisch.billing.pastDueNoDate' | t) }}
                </p>
              }
              <p>
                <strong>{{ planName(b.plan) }}</strong>
                @if (statusLabel(b); as label) {
                  <span class="st-badge" [class.st-badge-brand]="b.status === 'active' || b.status === 'comped'">{{ label }}</span>
                }
              </p>
              @if (b.status === 'comped') {
                <p class="member-hint member-muted">{{ 'stammtisch.billing.comped' | t }}</p>
              } @else if (b.currentPeriodEnd) {
                <p class="member-hint member-muted">
                  {{ (b.status === 'canceled' ? 'stammtisch.billing.endsOn' : 'stammtisch.billing.renews') | t: { date: formatDay(b.currentPeriodEnd) } }}
                </p>
              }

              <dl class="st-usage" [attr.aria-label]="'stammtisch.billing.usage' | t">
                <div>
                  <dt>{{ 'stammtisch.billing.members' | t }}</dt>
                  <dd>
                    {{
                      b.limits.maxMembers === null
                        ? ('stammtisch.billing.membersUnlimited' | t: { count: b.usage.members })
                        : ('stammtisch.billing.membersOf' | t: { count: b.usage.members, max: b.limits.maxMembers })
                    }}
                  </dd>
                  @if (b.limits.maxMembers !== null) {
                    <span class="st-meter" aria-hidden="true">
                      <span [style.width.%]="usagePercent(b.usage.members, b.limits.maxMembers)"></span>
                    </span>
                  }
                </div>
                <div>
                  <dt>{{ 'stammtisch.billing.storage' | t }}</dt>
                  <dd>
                    {{ 'stammtisch.billing.storageOf' | t: { used: formatBytes(b.usage.storageBytes), limit: formatBytes(b.limits.storageBytes) } }}
                  </dd>
                  <span class="st-meter" aria-hidden="true">
                    <span [style.width.%]="usagePercent(b.usage.storageBytes, b.limits.storageBytes)"></span>
                  </span>
                </div>
                <div>
                  <dt>{{ 'stammtisch.billing.videos' | t }}</dt>
                  <dd>{{ (b.limits.videos ? 'stammtisch.billing.yes' : 'stammtisch.billing.no') | t }}</dd>
                </div>
                <div>
                  <dt>{{ 'stammtisch.billing.kiosks' | t }}</dt>
                  <dd>
                    {{ (b.limits.multipleKiosks ? 'stammtisch.billing.kiosksMany' : 'stammtisch.billing.kiosksOne') | t: { count: b.usage.activeKiosks } }}
                  </dd>
                </div>
              </dl>

              @if (b.canManage) {
                <div class="st-row" style="margin-top: 1.25rem">
                  <h3 class="st-label" style="margin: 0">{{ 'stammtisch.billing.choose' | t }}</h3>
                  @if (intervals().length > 1) {
                    <span class="st-toggle st-actions" role="group" [attr.aria-label]="'stammtisch.billing.interval' | t">
                      @for (option of intervals(); track option) {
                        <button
                          type="button"
                          [class.is-active]="interval() === option"
                          [attr.aria-pressed]="interval() === option"
                          (click)="interval.set(option)"
                        >
                          {{ 'stammtisch.billing.' + option | t }}
                        </button>
                      }
                    </span>
                  }
                </div>
                <div class="st-form-grid" style="margin-top: 0.75rem">
                  @for (offer of paidPlans(); track offer.plan) {
                    <article class="st-plan" [class.st-current]="isCurrentPlan(b, offer)">
                      <span class="member-list-title">
                        {{ planName(offer.plan) }}
                        @if (isCurrentPlan(b, offer)) {
                          <span class="st-badge st-badge-brand">{{ 'stammtisch.billing.current' | t }}</span>
                        }
                      </span>
                      @if (priceOf(offer); as price) {
                        <strong>{{ price }}</strong>
                      } @else {
                        <span class="member-list-meta">{{ 'stammtisch.billing.intervalMissing' | t }}</span>
                      }
                      <ul>
                        <li>
                          {{
                            offer.limits.maxMembers === null
                              ? ('stammtisch.billing.limitMembersUnlimited' | t)
                              : ('stammtisch.billing.limitMembers' | t: { count: offer.limits.maxMembers })
                          }}
                        </li>
                        <li>{{ 'stammtisch.billing.limitStorage' | t: { size: formatBytes(offer.limits.storageBytes) } }}</li>
                        <li>{{ (offer.limits.videos ? 'stammtisch.billing.limitVideos' : 'stammtisch.billing.limitNoVideos') | t }}</li>
                        <li>{{ (offer.limits.multipleKiosks ? 'stammtisch.billing.limitKiosks' : 'stammtisch.billing.limitOneKiosk') | t }}</li>
                      </ul>
                      @if (!isCurrentPlan(b, offer) && priceOf(offer)) {
                        <button
                          type="button"
                          class="member-button"
                          [disabled]="billingBusy() || !b.checkoutAvailable"
                          (click)="checkout(offer)"
                        >
                          {{ 'stammtisch.billing.book' | t }}
                        </button>
                      }
                    </article>
                  }
                </div>
                @if (!b.checkoutAvailable) {
                  <p class="member-hint member-muted">{{ 'stammtisch.billing.checkoutUnavailable' | t }}</p>
                }
                @if (b.hasPaymentAccount) {
                  <div class="st-actions" style="margin-top: 0.5rem">
                    <button type="button" class="member-button member-button-ghost" [disabled]="billingBusy()" (click)="portal()">
                      {{ 'stammtisch.billing.portal' | t }}
                    </button>
                  </div>
                  <p class="member-hint member-muted">{{ 'stammtisch.billing.portalHint' | t }}</p>
                }
              }

              @if (b.supporterAvailable) {
                <p class="member-hint">
                  {{
                    b.supporterAmountCents === null
                      ? ('stammtisch.billing.supporterHintNoAmount' | t)
                      : ('stammtisch.billing.supporterHint' | t: { price: formatCents(b.supporterAmountCents) })
                  }}
                </p>
                <div class="st-actions" style="margin-top: 0.5rem">
                  <button type="button" class="member-button member-button-ghost" [disabled]="billingBusy()" (click)="supporter()">
                    {{ 'stammtisch.billing.supporter' | t }}
                  </button>
                </div>
              }
            } @else if (billingError(); as message) {
              <p class="st-error" role="alert">{{ message }}</p>
            }
            @if (billingActionError(); as message) {
              <p class="st-error" role="alert">{{ message }}</p>
            }

            @if (can('stammtisch.manage') || can('billing.manage')) {
              <p class="member-hint">{{ 'stammtisch.billing.exportHint' | t }}</p>
              <div class="st-actions" style="margin-top: 0.5rem">
                <a class="member-button member-button-ghost" [href]="exportUrl" download>
                  {{ 'stammtisch.billing.export' | t }}
                </a>
              </div>
            }
          </section>

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
  private readonly route = inject(ActivatedRoute);
  private readonly billingStatus = inject(BillingStatusStore);
  private readonly external = inject(ExternalNavigation);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly planName = planName;
  protected readonly formatBytes = formatBytes;
  protected readonly formatCents = formatCents;
  protected readonly formatDay = formatDay;
  protected readonly usagePercent = usagePercent;
  protected readonly exportUrl = STAMMTISCH_EXPORT_URL;

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

  protected readonly billing = signal<BillingOverviewDto | null>(null);
  protected readonly billingError = signal<string | null>(null);
  protected readonly billingActionError = signal<string | null>(null);
  protected readonly billingBusy = signal(false);
  protected readonly interval = signal<BillingInterval>('month');
  /** Buchbare Tarife (ohne `free`). */
  protected readonly paidPlans = computed(() => (this.billing()?.plans ?? []).filter((offer) => offer.plan !== 'free'));
  /** Angebotene Zahlweisen; eine ohne Preis in allen Tarifen entfällt. */
  protected readonly intervals = computed<BillingInterval[]>(() => {
    const plans = this.paidPlans();
    return (['month', 'year'] as const).filter((interval) =>
      plans.some((offer) => (interval === 'month' ? offer.monthCents : offer.yearCents) !== null),
    );
  });

  protected name = '';
  protected roleName = '';
  protected roleDescription = '';

  ngOnInit(): void {
    void this.auth.getSession().then((session) => {
      this.canSwitch.set((session?.memberships?.length ?? 0) > 1 || session?.platformAdmin === true);
    });
    this.handleBillingReturn();
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
        this.loadBilling();
        this.loadRoles();
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorText(error));
        this.loading.set(false);
      },
    });
  }

  /**
   * Rückkehr von Stripe (`?billing=success|thanks|canceled`): Meldung einmal
   * zeigen und den Parameter aus der Adresse nehmen. Nach einer Buchung kommt
   * der Webhook kurz danach an, daher wird der Tarif noch einmal geladen. Nur
   * im Browser: eine Navigation beim SSR würde zur Weiterleitung ohne Meldung.
   */
  private handleBillingReturn(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const result = this.route.snapshot.queryParamMap.get('billing');
    const key = result ? BILLING_RETURN_MESSAGES[result] : undefined;
    if (!key) return;
    this.info.set(translate(key));
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { billing: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (result === 'success') {
      const timer = setTimeout(() => this.loadBilling(), BILLING_ACTIVATION_DELAY_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    }
  }

  protected loadBilling(): void {
    this.billingError.set(null);
    this.api.billing().subscribe({
      next: (billing) => {
        this.billing.set(billing);
        this.billingStatus.readOnly.set(billing.readOnly);
        const intervals = this.intervals();
        if (intervals.length > 0 && !intervals.includes(this.interval())) this.interval.set(intervals[0]);
      },
      error: (error: unknown) => this.billingError.set(apiErrorText(error)),
    });
  }

  protected statusLabel(billing: BillingOverviewDto): string {
    // Kostenlos ohne Buchung braucht kein Etikett.
    return billing.plan === 'free' && billing.status === 'none' ? '' : billingStatusLabel(billing.status);
  }

  /** Aktueller Tarif, solange er läuft (nicht gekündigt oder nie gebucht). */
  protected isCurrentPlan(billing: BillingOverviewDto, offer: PlanOfferDto): boolean {
    return billing.plan === offer.plan && billing.status !== 'none' && billing.status !== 'canceled';
  }

  protected priceOf(offer: PlanOfferDto): string | null {
    const interval = this.interval();
    const cents = interval === 'month' ? offer.monthCents : offer.yearCents;
    if (cents === null) return null;
    return translate(interval === 'month' ? 'stammtisch.billing.perMonth' : 'stammtisch.billing.perYear', {
      price: formatCents(cents),
    });
  }

  protected checkout(offer: PlanOfferDto): void {
    if (offer.plan === 'free') return;
    this.redirect(this.api.billingCheckout(offer.plan, this.interval()));
  }

  protected portal(): void {
    this.redirect(this.api.billingPortal());
  }

  protected supporter(): void {
    this.redirect(this.api.billingSupporter());
  }

  /** Öffnet die Stripe-Seite im ganzen Fenster; die App kommt per `?billing=…` zurück. */
  private redirect(call: Observable<BillingRedirectDto>): void {
    if (this.billingBusy()) return;
    this.billingBusy.set(true);
    this.billingActionError.set(null);
    call.subscribe({
      next: ({ url }) => this.external.assign(url),
      error: (error: unknown) => {
        this.billingBusy.set(false);
        this.billingActionError.set(apiErrorText(error));
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
