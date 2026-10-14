import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { AsyncState } from '../member/async-state';
import { describeApiError } from '../api/api-client.service';
import { formatDateTime } from '../member/member-format';
import { auditTargetLabel } from './board-format';
import { BoardApiService } from './board-api.service';
import type { UserSummary } from '../auth/auth.types';
import type { AuditLogEntry } from '../api/api.types';
import { InfoPanelComponent, RoleChipComponent, StatusBadgeComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface CommunicationsView {
  recipients: UserSummary[];
  audit: AuditLogEntry[];
}

/**
 * Kommunikationsansicht des Vorstands/Schriftführers (TICKET-026).
 *
 * Bereitet Mitteilungen an einzelne Mitglieder vor und zeigt die zuletzt
 * versendeten Benachrichtigungen aus dem Audit-Protokoll (Bereich
 * `Notification`). Der Versand (`POST /notifications`) ist Vorstand und
 * Administration vorbehalten und wird serverseitig auditiert; die
 * Autorisierung prüft ausschließlich der Fachservice (`deny by default`),
 * unberechtigte Aufrufe erhalten `403`. Die Ansicht wird nur im Browser
 * gerendert.
 */
@Component({
  selector: 'app-board-communications',
  imports: [StateComponent, FormsModule, RouterLink, InfoPanelComponent, RoleChipComponent, StatusBadgeComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="comm-title">
        <span class="eyebrow">{{ 'board.comms.eyebrow' | t }}</span>
        <h1 id="comm-title">{{ 'board.comms.title' | t }}</h1>
        <p>{{ 'board.comms.intro' | t }}</p>
        <a class="member-back" routerLink="/board">{{ 'board.backToBoard' | t }}</a>

        <h2 class="member-subtitle">{{ 'board.comms.pinboardTitle' | t }}</h2>
        <vereint-info-panel icon="pin" [title]="'board.comms.infoTitle' | t">
          {{ 'board.comms.infoText' | t }}
        </vereint-info-panel>

        @if (actionError(); as err) {
          <p class="manage-action-error" role="alert">{{ err }}</p>
        }
        @if (actionInfo(); as info) {
          <p class="manage-action-info" role="status">{{ info }}</p>
        }

        <h2 class="member-subtitle">{{ 'board.comms.composeTitle' | t }}</h2>
        <form class="manage-form" (ngSubmit)="send()">
          <label class="manage-field">
            <span>{{ 'board.comms.recipientId' | t }}</span>
            <input name="userId" [(ngModel)]="form.userId" required />
          </label>
          <label class="manage-field">
            <span>{{ 'board.comms.messageTitle' | t }}</span>
            <input name="title" [(ngModel)]="form.title" maxlength="255" required />
          </label>
          <label class="manage-field manage-field-grow">
            <span>{{ 'board.comms.messageBody' | t }}</span>
            <textarea name="body" [(ngModel)]="form.body" maxlength="4000" required></textarea>
          </label>
          <button type="submit" class="member-button" [disabled]="busy()">{{ 'board.comms.send' | t }}</button>
        </form>

        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'board.comms.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'board.comms.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as view) {
          <h2 class="member-subtitle">{{ 'board.comms.recipientsHeading' | t: { count: view.recipients.length } }}</h2>
          @if (view.recipients.length === 0) {
            <p class="member-muted">{{ 'board.comms.noRecipients' | t }}</p>
          } @else {
            <ul class="member-list">
              @for (recipient of view.recipients; track recipient.id) {
                <li class="member-list-item board-row">
                  <span class="member-list-title">{{ recipient.displayName }}</span>
                  @for (role of recipient.roles; track role) {
                    <vereint-role-chip [label]="role" />
                  }
                  <span class="member-list-meta">{{ recipient.id }}</span>
                  <button type="button" class="member-button" (click)="pick(recipient.id)">
                    {{ 'board.comms.pickRecipient' | t }}
                  </button>
                </li>
              }
            </ul>
          }

          <h2 class="member-subtitle">{{ 'board.comms.sentHeading' | t: { count: view.audit.length } }}</h2>
          @if (view.audit.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'board.audit.emptyTitle' | t"
              [message]="'board.comms.sentEmpty' | t"
            />
          } @else {
            <ul class="member-list">
              @for (entry of view.audit; track entry.id) {
                <li class="member-list-item">
                  <span class="member-list-title">
                    {{ auditTargetLabel(entry.targetEntity) }} · {{ entry.action }}
                  </span>
                  <vereint-status-badge [label]="'board.comms.sent' | t" [tone]="'success'" />
                  @if (entry.details) {
                    <span class="member-chat-text">{{ entry.details }}</span>
                  }
                  <span class="member-list-meta">{{ formatDateTime(entry.createdAt) }}</span>
                </li>
              }
            </ul>
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
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
      .manage-field textarea {
        padding: 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        font: inherit;
      }
      .board-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        justify-content: space-between;
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
    `,
  ],
})
export class CommunicationsComponent implements OnInit, OnDestroy {
  private readonly api = inject(BoardApiService);

  protected readonly load = new AsyncState<CommunicationsView>();
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionInfo = signal<string | null>(null);

  protected form = { userId: '', title: '', body: '' };

  protected readonly formatDateTime = formatDateTime;
  protected readonly auditTargetLabel = auditTargetLabel;

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(
      forkJoin({
        recipients: this.api.listUsers().pipe(map((page) => page.content)),
        audit: this.api.listAuditLogs('Notification').pipe(map((page) => page.content)),
      }),
    );
  }

  protected pick(userId: string): void {
    this.form.userId = userId;
  }

  protected send(): void {
    const userId = this.form.userId.trim();
    const title = this.form.title.trim();
    const body = this.form.body.trim();
    if (!userId || !title || !body) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    this.api.sendNotification({ userId, title, body }).subscribe({
      next: () => {
        this.busy.set(false);
        this.actionInfo.set(translate('board.comms.sentInfo'));
        this.form = { userId: '', title: '', body: '' };
        this.reload();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(describeApiError(error));
      },
    });
  }
}
