import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { describeApiError } from '../api/api-client.service';
import {
  MemberInvitesApiService,
  type MemberInvite,
  type MemberInviteStatus,
} from '../invites/member-invites-api.service';
import { formatDateTime } from '../member/member-format';
import { ModalComponent, StatusBadgeComponent, type StatusTone } from '../ui';
import { IconComponent } from '../ui/icon.component';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe, translate } from '../i18n';

/** Auswählbare Gültigkeitsdauer eines Links in Tagen. */
const VALIDITY_DAYS = [1, 7, 30] as const;

const STATUS_TONES: Record<MemberInviteStatus, StatusTone> = {
  active: 'warning',
  used: 'success',
  expired: 'neutral',
  revoked: 'danger',
};

/**
 * „Mitglied einladen“ für Vorstand und Administration.
 *
 * Erzeugt einen Einladungslink, mit dem sich eine Person selbst als Mitglied
 * registriert. Der Link wird genau einmal angezeigt (der Fachservice speichert
 * nur den Hash) und lässt sich kopieren oder über das Teilen-Menü des Geräts
 * verschicken. Darunter stehen die bisherigen Links mit Status und der
 * Möglichkeit, offene Links zurückzuziehen. Neue Konten erhalten immer nur die
 * Rolle „Mitglied“; weitere Rollen vergibt die Administration danach.
 */
@Component({
  selector: 'app-admin-invite-modal',
  imports: [StateComponent, IconComponent, FormsModule, ModalComponent, StatusBadgeComponent, TranslatePipe],
  template: `
    <vereint-modal [open]="open" [title]="'admin.invite.title' | t" (closed)="close()">
      @if (created(); as link) {
        <section class="invite-created" aria-labelledby="invite-created-title">
          <h3 class="member-subtitle" id="invite-created-title">{{ 'admin.invite.createdTitle' | t }}</h3>
          <p class="member-hint">
            {{ 'admin.invite.createdHint' | t: { date: formatDateTime(link.expiresAt) } }}
          </p>
          <input
            class="invite-link"
            name="inviteLink"
            readonly
            [value]="link.url"
            [attr.aria-label]="'admin.invite.linkLabel' | t"
            (focus)="selectAll($event)"
          />
          <div class="invite-actions">
            @if (canShare) {
              <button type="button" class="member-button member-button-ghost" (click)="share(link.url)">
                <vereint-icon name="send" /> {{ 'admin.invite.share' | t }}
              </button>
            }
            <button type="button" class="member-button" (click)="copy(link.url)">
              {{ (copied() ? 'admin.invite.copied' : 'admin.invite.copy') | t }}
            </button>
          </div>
          <button type="button" class="invite-text-button" (click)="created.set(null)">
            {{ 'admin.invite.another' | t }}
          </button>
        </section>
      } @else {
        <form class="invite-form" (ngSubmit)="create()">
          <p class="member-hint">
            {{ 'admin.invite.intro' | t }}
          </p>
          <label class="manage-field manage-field-grow">
            <span>{{ 'admin.invite.labelField' | t }}</span>
            <input
              name="inviteLabel"
              maxlength="120"
              [(ngModel)]="label"
              [placeholder]="'admin.invite.labelPlaceholder' | t"
            />
          </label>

          <div class="invite-row-fields">
            <label class="manage-field">
              <span>{{ 'admin.invite.validity' | t }}</span>
              <select name="inviteValidity" [(ngModel)]="validityDays">
                @for (days of validityOptions; track days) {
                  <option [ngValue]="days">{{ 'admin.invite.validityDays' | t: { count: days } }}</option>
                }
              </select>
            </label>
            <label class="manage-field">
              <span>{{ 'admin.invite.maxUses' | t }}</span>
              <input name="inviteMaxUses" type="number" min="1" max="50" [(ngModel)]="maxUses" />
            </label>
          </div>

          @if (error()) {
            <p class="manage-action-error" role="alert">{{ error() }}</p>
          }

          <div class="invite-actions">
            <button type="button" class="member-button member-button-ghost" (click)="close()">
              {{ 'common.cancel' | t }}
            </button>
            <button type="submit" class="member-button" [disabled]="busy()">
              <vereint-icon name="send" /> {{ 'admin.invite.create' | t }}
            </button>
          </div>
        </form>
      }

      <section class="invite-open" aria-labelledby="invite-open-title">
        <h3 class="member-subtitle" id="invite-open-title">{{ 'admin.invite.listTitle' | t }}</h3>
        @if (loading()) {
          <vereint-state kind="loading" [title]="'admin.invite.loading' | t" />
        } @else if (listError()) {
          <vereint-state kind="error" [title]="'admin.invite.loadFailed' | t" [message]="listError()!" />
        } @else if (invites().length === 0) {
          <vereint-state
            kind="empty"
            [title]="'admin.invite.emptyTitle' | t"
            [message]="'admin.invite.emptyMessage' | t"
          />
        } @else {
          <ul class="member-list">
            @for (invite of invites(); track invite.id) {
              <li class="member-list-item invite-row">
                <span class="invite-meta">
                  <span class="member-list-title">{{ invite.label || ('admin.invite.noLabel' | t) }}</span>
                  <span class="member-list-meta">
                    {{
                      'admin.invite.usage'
                        | t: { used: invite.usesCount, max: invite.maxUses, date: formatDateTime(invite.expiresAt) }
                    }}
                  </span>
                  @if (invite.registeredMembers.length > 0) {
                    <span class="member-list-meta">{{
                      'admin.invite.registered' | t: { names: invite.registeredMembers.join(', ') }
                    }}</span>
                  }
                </span>
                <vereint-status-badge [label]="'admin.invite.status.' + invite.status | t" [tone]="statusTone(invite.status)" />
                @if (invite.status === 'active') {
                  <button
                    type="button"
                    class="member-button member-button-ghost"
                    [disabled]="busy()"
                    (click)="revoke(invite)"
                  >
                    {{ 'admin.invite.revoke' | t }}
                  </button>
                }
              </li>
            }
          </ul>
        }
      </section>
    </vereint-modal>
  `,
  styles: [
    `
      .invite-form,
      .invite-created {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .invite-row-fields {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .manage-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .manage-field input,
      .manage-field select,
      .invite-link {
        padding: 0.5rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
        background: var(--color-surface, #ffffff);
        color: inherit;
      }
      .invite-link {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--opt-font-mono, monospace);
        font-size: 0.85rem;
      }
      .invite-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .invite-text-button {
        align-self: flex-start;
        background: none;
        border: none;
        padding: 0;
        color: var(--color-brand);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .invite-open {
        margin-top: 1.25rem;
      }
      .invite-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        justify-content: space-between;
      }
      .invite-meta {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
    `,
  ],
})
export class InviteModalComponent implements OnChanges {
  private readonly api = inject(MemberInvitesApiService);

  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  protected readonly validityOptions = VALIDITY_DAYS;
  protected readonly formatDateTime = formatDateTime;
  protected readonly canShare =
    typeof globalThis.navigator !== 'undefined' && typeof globalThis.navigator.share === 'function';

  protected readonly invites = signal<MemberInvite[]>([]);
  protected readonly loading = signal(false);
  protected readonly listError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly created = signal<{ url: string; expiresAt: string } | null>(null);
  protected readonly copied = signal(false);

  protected label = '';
  protected validityDays = 7;
  protected maxUses = 1;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.load();
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.listError.set(null);
    this.api.list().subscribe({
      next: (invites) => {
        this.invites.set(invites);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.listError.set(describeApiError(err));
        this.loading.set(false);
      },
    });
  }

  protected create(): void {
    if (this.busy()) return;
    const maxUses = Math.trunc(Number(this.maxUses));
    if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 50) {
      this.error.set(translate('admin.invite.maxUsesInvalid'));
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    const label = this.label.trim();
    this.api
      .create({ label: label || undefined, expiresInDays: this.validityDays, maxUses })
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.copied.set(false);
          this.created.set({ url: this.absoluteUrl(result.registerPath), expiresAt: result.invite.expiresAt });
          this.invites.update((list) => [result.invite, ...list]);
          this.label = '';
          this.maxUses = 1;
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(describeApiError(err));
        },
      });
  }

  protected revoke(invite: MemberInvite): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.revoke(invite.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.invites.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.listError.set(describeApiError(err));
      },
    });
  }

  protected async copy(url: string): Promise<void> {
    try {
      await globalThis.navigator.clipboard.writeText(url);
      this.copied.set(true);
    } catch {
      this.error.set(translate('admin.invite.copyFailed'));
    }
  }

  protected async share(url: string): Promise<void> {
    try {
      await globalThis.navigator.share({
        title: translate('admin.invite.shareTitle'),
        text: translate('admin.invite.shareText'),
        url,
      });
    } catch {
      // Abgebrochenes Teilen ist kein Fehler.
    }
  }

  protected selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  protected statusTone(status: MemberInviteStatus): StatusTone {
    return STATUS_TONES[status] ?? 'neutral';
  }

  protected close(): void {
    this.error.set(null);
    this.created.set(null);
    this.copied.set(false);
    this.closed.emit();
  }

  private absoluteUrl(path: string): string {
    const origin = globalThis.location?.origin ?? '';
    return `${origin}${path}`;
  }
}
