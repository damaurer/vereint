import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { FormsModule } from '@angular/forms';
import { EMAIL_PATTERN } from '../auth/auth.types';
import { formatDateTime } from '../member/member-format';
import { ModalComponent, StatusBadgeComponent, type StatusTone } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

/** Auswählbare Startrollen einer Einladung (Präsentation). */
const START_ROLES = [
  { value: 'member', labelKey: 'admin.invite.roleMemberDefault' },
  { value: 'host', labelKey: 'admin.roles.host' },
  { value: 'treasurer', labelKey: 'admin.roles.treasurer' },
  { value: 'secretary', labelKey: 'admin.roles.secretary' },
  { value: 'admin', labelKey: 'admin.roles.admin' },
] as const;

/** Offene Einladung in der Präsentationsliste. */
interface OpenInvite {
  id: string;
  email: string;
  /** Übersetzungsschlüssel der Startrolle. */
  roleKey: string;
  createdAt: string;
  status: 'pending' | 'expired';
}

/** Beispielhafte offene Einladungen gemäß Mockup `web-einladung-modal`. */
function demoInvites(): OpenInvite[] {
  return [
    {
      id: 'inv-1',
      email: 'flo.eber@web.de',
      roleKey: 'admin.roles.member',
      createdAt: '2026-11-24T14:22:00Z',
      status: 'pending',
    },
    {
      id: 'inv-2',
      email: 'braumeister-stefan@gmail.com',
      roleKey: 'admin.roles.host',
      createdAt: '2026-11-20T09:15:00Z',
      status: 'pending',
    },
    {
      id: 'inv-3',
      email: 'josef.schreiner@gmx.at',
      roleKey: 'admin.roles.member',
      createdAt: '2026-11-01T11:30:00Z',
      status: 'expired',
    },
  ];
}

/**
 * Einladungs-Modal der Administration (TICKET-038).
 *
 * Reine Präsentation innerhalb des geteilten `vereint-modal`: E-Mail (mit
 * clientseitiger Validierung), Startrolle, optionale Nachricht sowie eine Liste
 * offener Einladungen mit „Erneuern“. Es existiert kein serverseitiger
 * Einladungs-Endpunkt; das Senden hält den Zustand ausschließlich clientseitig.
 * Die verbindliche Autorisierung verbleibt im Fachservice (`deny by default`).
 */
@Component({
  selector: 'app-admin-invite-modal',
  imports: [StateComponent, IconComponent, FormsModule, ModalComponent, StatusBadgeComponent, TranslatePipe],
  template: `
    <vereint-modal [open]="open" [title]="'admin.invite.title' | t" (closed)="close()">
      <form class="invite-form" (ngSubmit)="send()">
        <label class="manage-field manage-field-grow">
          <span>{{ 'admin.invite.email' | t }}</span>
          <input
            name="inviteEmail"
            type="email"
            [(ngModel)]="email"
            placeholder="name@example.org"
            (ngModelChange)="onEmailChange()"
          />
        </label>

        <label class="manage-field manage-field-grow">
          <span>{{ 'admin.invite.startRole' | t }}</span>
          <select name="inviteRole" [(ngModel)]="role">
            @for (option of startRoles; track option.value) {
              <option [value]="option.value">{{ option.labelKey | t }}</option>
            }
          </select>
        </label>

        <label class="manage-field manage-field-grow">
          <span>{{ 'admin.invite.message' | t }}</span>
          <textarea
            name="inviteMessage"
            rows="3"
            [(ngModel)]="message"
            [placeholder]="'admin.invite.messagePlaceholder' | t"
          ></textarea>
        </label>

        @if (error()) {
          <p class="manage-action-error" role="alert">{{ error() }}</p>
        }
        @if (info()) {
          <p class="manage-action-info" role="status">{{ info() }}</p>
        }

        <div class="invite-actions">
          <button type="button" class="member-button member-button-ghost" (click)="close()">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="member-button"><vereint-icon name="send" /> {{ 'admin.invite.send' | t }}</button>
        </div>
      </form>

      <section class="invite-open" aria-labelledby="invite-open-title">
        <h3 class="member-subtitle" id="invite-open-title">{{ 'admin.invite.openTitle' | t }}</h3>
        @if (invites().length === 0) {
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
                  <span class="member-list-title">{{ invite.email }}</span>
                  <span class="member-list-meta">
                    {{ formatDateTime(invite.createdAt) }} · {{ invite.roleKey | t }}
                  </span>
                </span>
                <vereint-status-badge
                  [label]="(invite.status === 'expired' ? 'admin.invite.expired' : 'admin.invite.pending') | t"
                  [tone]="inviteTone(invite.status)"
                />
                <button type="button" class="member-button" (click)="renew(invite.id)">
                  {{ 'admin.invite.renew' | t }}
                </button>
              </li>
            }
          </ul>
        }
      </section>
    </vereint-modal>
  `,
  styles: [
    `
      .invite-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .manage-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .manage-field input,
      .manage-field select,
      .manage-field textarea {
        padding: 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        font: inherit;
      }
      .invite-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .invite-open {
        margin-top: 1rem;
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
      }
    `,
  ],
})
export class InviteModalComponent {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  protected readonly startRoles = START_ROLES;
  protected readonly invites = signal<OpenInvite[]>(demoInvites());
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);

  protected email = '';
  protected role: string = START_ROLES[0].value;
  protected message = '';

  protected readonly formatDateTime = formatDateTime;

  protected inviteTone(status: OpenInvite['status']): StatusTone {
    return status === 'expired' ? 'danger' : 'warning';
  }

  protected onEmailChange(): void {
    this.error.set(null);
  }

  /**
   * Validiert die E-Mail clientseitig und stellt die Einladung nur lokal dar
   * (kein Server-Endpunkt). Eingaben bleiben bei Fehlern erhalten.
   */
  protected send(): void {
    const email = this.email.trim();
    if (!EMAIL_PATTERN.test(email)) {
      this.info.set(null);
      this.error.set(translate('admin.invite.invalidEmail'));
      return;
    }
    const roleKey = START_ROLES.find((option) => option.value === this.role)?.labelKey ?? this.role;
    this.invites.update((list) => [
      {
        id: `inv-${Date.now()}`,
        email,
        roleKey,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
      ...list,
    ]);
    this.error.set(null);
    this.info.set(translate('admin.invite.queued'));
    this.email = '';
    this.message = '';
  }

  /** Setzt eine offene Einladung wieder auf „Ausstehend“ (nur Anzeige). */
  protected renew(id: string): void {
    this.invites.update((list) =>
      list.map((invite) =>
        invite.id === id
          ? { ...invite, status: 'pending', createdAt: new Date().toISOString() }
          : invite,
      ),
    );
    this.info.set(translate('admin.invite.renewed'));
  }

  protected close(): void {
    this.error.set(null);
    this.info.set(null);
    this.closed.emit();
  }
}
