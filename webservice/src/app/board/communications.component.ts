import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AsyncState } from '../member/async-state';
import { describeApiError } from '../api/api-client.service';
import { formatDateTime } from '../member/member-format';
import { auditActionLabel, boardRoleLabel } from './board-format';
import { BoardApiService } from './board-api.service';
import type {
  AuditLogEntry,
  BroadcastPayload,
  ConversationSummary,
  DirectoryMember,
} from '../api/api.types';
import { InfoPanelComponent, StatusBadgeComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

/** Empfängerkreis eines Rundbriefs. */
type RecipientMode = 'all' | 'selected';

/**
 * Kommunikationsansicht des Vorstands/Schriftführers (TICKET-026).
 *
 * Pflegt die Infotafel des Vereinschats (`GET /conversations/club`,
 * `PUT /conversations/club/pin`) und verschickt Rundbriefe an alle oder an
 * ausgewählte Mitglieder (`POST /notifications/broadcast`). Empfänger werden
 * per Name aus dem Mitgliederverzeichnis (`GET /users/directory`) gewählt.
 * Zuletzt versendete Benachrichtigungen kommen aus dem Audit-Protokoll
 * (Bereich `Notification`). Die Autorisierung prüft ausschließlich der
 * Fachservice (`deny by default`).
 */
@Component({
  selector: 'app-board-communications',
  imports: [StateComponent, FormsModule, RouterLink, InfoPanelComponent, StatusBadgeComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="comm-title">
        <span class="eyebrow">{{ 'board.comms.eyebrow' | t }}</span>
        <h1 id="comm-title">{{ 'board.comms.title' | t }}</h1>
        <p>{{ 'board.comms.intro' | t }}</p>
        <a class="member-back" routerLink="/board">{{ 'board.backToBoard' | t }}</a>

        <!-- Infotafel des Vereinschats -->
        <h2 class="member-subtitle">{{ 'board.comms.pinboardTitle' | t }}</h2>
        <vereint-info-panel icon="pin" [title]="'board.comms.infoTitle' | t">
          {{ 'board.comms.infoText' | t }}
        </vereint-info-panel>

        @if (club.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'board.comms.pin.loading' | t" />
        } @else if (club.isError()) {
          <vereint-state
            kind="error"
            [title]="'board.comms.pin.unavailable' | t"
            [message]="club.errorMessage()"
            (retry)="reloadClub()"
          />
        } @else if (club.data(); as conversation) {
          @if (conversation.pinned; as pinned) {
            <div class="comm-pinned" data-testid="current-pin">
              <strong>{{ 'board.comms.pin.current' | t }}</strong>
              <p class="comm-pinned-text">{{ pinned.text }}</p>
              <span class="member-list-meta">
                {{ 'board.comms.pin.meta' | t: { name: pinned.authorName, date: formatDateTime(pinned.pinnedAt) } }}
              </span>
            </div>
          } @else {
            <p class="member-muted">{{ 'board.comms.pin.none' | t }}</p>
          }
          <form class="manage-form" (ngSubmit)="savePin()">
            <label class="manage-field manage-field-grow">
              <span>{{ 'board.comms.pin.label' | t }}</span>
              <textarea name="pinText" rows="3" maxlength="2000" [(ngModel)]="pinText"></textarea>
            </label>
            <div class="comm-buttons">
              <button type="submit" class="member-button" [disabled]="pinBusy() || !pinText.trim()">
                {{ 'board.comms.pin.save' | t }}
              </button>
              <button
                type="button"
                class="member-button comm-button-secondary"
                [disabled]="pinBusy() || !conversation.pinned"
                (click)="removePin()"
              >
                {{ 'board.comms.pin.remove' | t }}
              </button>
            </div>
          </form>
          @if (pinError(); as err) {
            <p class="manage-action-error" role="alert">{{ err }}</p>
          }
          @if (pinInfo(); as info) {
            <p class="manage-action-info" role="status">{{ info }}</p>
          }
        }

        <!-- Rundbrief -->
        <h2 class="member-subtitle">{{ 'board.comms.composeTitle' | t }}</h2>
        <form class="manage-form" (ngSubmit)="send()">
          <fieldset class="comm-recipients">
            <legend>{{ 'board.comms.recipients.legend' | t }}</legend>
            <div class="comm-modes">
              <label class="comm-choice">
                <input type="radio" name="recipientMode" value="all" [ngModel]="mode()" (ngModelChange)="mode.set($event)" />
                <span>{{ 'board.comms.recipients.all' | t }}</span>
              </label>
              <label class="comm-choice">
                <input type="radio" name="recipientMode" value="selected" [ngModel]="mode()" (ngModelChange)="mode.set($event)" />
                <span>{{ 'board.comms.recipients.selected' | t }}</span>
              </label>
            </div>

            @if (mode() === 'selected') {
              @if (directory.isLoading()) {
                <p class="member-muted">{{ 'board.comms.recipients.loading' | t }}</p>
              } @else if (directory.isError()) {
                <vereint-state
                  kind="error"
                  [title]="'board.comms.unavailable' | t"
                  [message]="directory.errorMessage()"
                  (retry)="reloadDirectory()"
                />
              } @else {
                @if (chosenMembers().length > 0) {
                  <ul class="comm-chips" [attr.aria-label]="'board.comms.recipients.chosen' | t: { count: chosenMembers().length }">
                    @for (member of chosenMembers(); track member.id) {
                      <li class="ui-chip ui-chip-accent comm-chip">
                        {{ member.displayName }}
                        <button
                          type="button"
                          class="comm-chip-remove"
                          [attr.aria-label]="'board.comms.recipients.remove' | t: { name: member.displayName }"
                          (click)="toggle(member.id)"
                        >×</button>
                      </li>
                    }
                  </ul>
                }
                <label class="manage-field">
                  <span>{{ 'board.comms.recipients.search' | t }}</span>
                  <input
                    type="search"
                    name="recipientSearch"
                    autocomplete="off"
                    [placeholder]="'board.comms.recipients.searchPlaceholder' | t"
                    [ngModel]="search()"
                    (ngModelChange)="search.set($event)"
                  />
                </label>
                <ul class="comm-options">
                  @for (member of filteredDirectory(); track member.id) {
                    <li>
                      <label class="comm-choice">
                        <input
                          type="checkbox"
                          [name]="'recipient-' + member.id"
                          [checked]="chosen().has(member.id)"
                          (change)="toggle(member.id)"
                        />
                        <span>{{ member.displayName }}</span>
                        @if (member.boardRole) {
                          <span class="member-list-meta">{{ boardRoleLabel(member.boardRole) }}</span>
                        }
                      </label>
                    </li>
                  } @empty {
                    <li class="member-muted">{{ 'board.comms.recipients.none' | t }}</li>
                  }
                </ul>
              }
            }
          </fieldset>

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

        @if (actionError(); as err) {
          <p class="manage-action-error" role="alert">{{ err }}</p>
        }
        @if (actionInfo(); as info) {
          <div class="manage-action-info" role="status">
            <p>{{ info }}</p>
            @if (sentCount() !== null) {
              <p class="comm-sent-count">{{ 'board.comms.sentCount' | t: { count: sentCount() } }}</p>
            }
          </div>
        }

        <!-- Protokoll -->
        @if (audit.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'board.comms.loadingMessage' | t"
          />
        } @else if (audit.isError()) {
          <vereint-state
            kind="error"
            [title]="'board.comms.unavailable' | t"
            [message]="audit.errorMessage()"
            (retry)="reloadAudit()"
          />
        } @else if (audit.data(); as entries) {
          <h2 class="member-subtitle">{{ 'board.comms.sentHeading' | t: { count: entries.length } }}</h2>
          @if (entries.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'board.audit.emptyTitle' | t"
              [message]="'board.comms.sentEmpty' | t"
            />
          } @else {
            <ul class="member-list">
              @for (entry of entries; track entry.id) {
                <li class="member-list-item">
                  <span class="member-list-title">{{ entry.targetTitle ?? auditActionLabel(entry.action) }}</span>
                  <vereint-status-badge [label]="'board.comms.sent' | t" [tone]="'success'" />
                  @if (entry.targetName) {
                    <span class="member-list-sub">{{ 'board.auditRecipient' | t: { name: entry.targetName } }}</span>
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
        min-width: min(12rem, 100%);
      }
      .manage-field-grow {
        flex: 1 1 18rem;
      }
      .manage-field input,
      .manage-field textarea {
        padding: 0.5rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
        min-width: 0;
      }
      .comm-pinned {
        display: grid;
        gap: 0.25rem;
        margin: 0.75rem 0 0;
        padding: 0.75rem;
        border-left: 4px solid var(--color-brand);
        border-radius: 0.5rem;
        background: var(--color-brand-soft, transparent);
      }
      .comm-pinned-text {
        margin: 0;
        white-space: pre-line;
      }
      .comm-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .comm-button-secondary {
        background: transparent;
        color: var(--color-text);
        border: 1px solid var(--color-border, #cbd5e1);
      }
      .comm-button-secondary:hover:not(:disabled) {
        background: var(--color-brand-soft, transparent);
      }
      .comm-recipients {
        flex: 1 1 100%;
        display: grid;
        gap: 0.75rem;
        margin: 0;
        padding: 0.75rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: 0.5rem;
        min-width: 0;
      }
      .comm-recipients legend {
        padding: 0 0.25rem;
        font-weight: 600;
      }
      .comm-modes {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1.25rem;
      }
      .comm-choice {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.25rem;
        cursor: pointer;
      }
      .comm-options {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 16rem;
        overflow-y: auto;
      }
      .comm-chips {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .comm-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
      }
      .comm-chip-remove {
        border: none;
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        padding: 0 0.25rem;
        min-width: 1.5rem;
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
      .manage-action-info p {
        margin: 0;
      }
      .comm-sent-count {
        font-weight: 400;
      }
    `,
  ],
})
export class CommunicationsComponent implements OnInit, OnDestroy {
  private readonly api = inject(BoardApiService);

  protected readonly directory = new AsyncState<DirectoryMember[]>();
  protected readonly audit = new AsyncState<AuditLogEntry[]>();
  protected readonly club = new AsyncState<ConversationSummary>();

  protected readonly mode = signal<RecipientMode>('all');
  protected readonly search = signal('');
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());

  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionInfo = signal<string | null>(null);
  protected readonly sentCount = signal<number | null>(null);

  protected readonly pinBusy = signal(false);
  protected readonly pinError = signal<string | null>(null);
  protected readonly pinInfo = signal<string | null>(null);
  protected pinText = '';

  protected form = { title: '', body: '' };

  protected readonly formatDateTime = formatDateTime;
  protected readonly auditActionLabel = auditActionLabel;
  protected readonly boardRoleLabel = boardRoleLabel;

  /** Verzeichnis nach Name sortiert und nach Suchbegriff gefiltert. */
  protected readonly filteredDirectory = computed(() => {
    const term = this.search().trim().toLocaleLowerCase();
    const rows = [...(this.directory.data() ?? [])].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
    return term ? rows.filter((row) => row.displayName.toLocaleLowerCase().includes(term)) : rows;
  });

  /** Gewählte Empfänger in Anzeigereihenfolge. */
  protected readonly chosenMembers = computed(() => {
    const ids = this.chosen();
    return (this.directory.data() ?? [])
      .filter((member) => ids.has(member.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  ngOnInit(): void {
    this.reloadClub();
    this.reloadDirectory();
    this.reloadAudit();
  }

  ngOnDestroy(): void {
    this.directory.destroy();
    this.audit.destroy();
    this.club.destroy();
  }

  protected reloadClub(): void {
    this.club.run(this.api.getClubConversation(), (conversation) => {
      this.pinText = conversation.pinned?.text ?? '';
    });
  }

  protected reloadDirectory(): void {
    this.directory.run(this.api.listDirectory());
  }

  protected reloadAudit(): void {
    this.audit.run(this.api.listAuditLogs('Notification').pipe(map((page) => page.content)));
  }

  protected toggle(memberId: string): void {
    const next = new Set(this.chosen());
    if (next.has(memberId)) next.delete(memberId);
    else next.add(memberId);
    this.chosen.set(next);
  }

  protected savePin(): void {
    const text = this.pinText.trim();
    if (!text) return;
    this.updatePin(text, translate('board.comms.pin.saved'));
  }

  protected removePin(): void {
    this.updatePin(null, translate('board.comms.pin.removed'));
  }

  private updatePin(text: string | null, successInfo: string): void {
    this.pinBusy.set(true);
    this.pinError.set(null);
    this.pinInfo.set(null);
    this.api.pinClubNotice(text).subscribe({
      next: (conversation) => {
        this.pinBusy.set(false);
        this.club.data.set(conversation);
        this.pinText = conversation.pinned?.text ?? '';
        this.pinInfo.set(successInfo);
      },
      error: (error: unknown) => {
        this.pinBusy.set(false);
        this.pinError.set(describeApiError(error));
      },
    });
  }

  protected send(): void {
    const title = this.form.title.trim();
    const body = this.form.body.trim();
    this.actionError.set(null);
    this.actionInfo.set(null);
    this.sentCount.set(null);
    if (!title || !body) return;

    let payload: BroadcastPayload;
    if (this.mode() === 'all') {
      payload = { allMembers: true, title, body };
    } else {
      const userIds = this.chosenMembers().map((member) => member.id);
      if (userIds.length === 0) {
        this.actionError.set(translate('board.comms.recipients.missing'));
        return;
      }
      payload = { userIds, title, body };
    }

    this.busy.set(true);
    this.api.broadcast(payload).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.actionInfo.set(translate('board.comms.sentInfo'));
        this.sentCount.set(result.sent);
        this.form = { title: '', body: '' };
        this.chosen.set(new Set());
        this.reloadAudit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(describeApiError(error));
      },
    });
  }
}
