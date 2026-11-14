import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { describeApiError } from '../api/api-client.service';
import { PwaSettingsComponent } from '../pwa/pwa-settings.component';
import {
  NotificationsApiService,
  type NotificationItem,
} from './notifications-api.service';
import { UnreadBadgeStore } from './unread-badge.store';
import { AsyncState } from '../member/async-state';
import { formatDateTime, formatDayTime } from '../member/member-format';
import { StatusBadgeComponent, type StatusTone } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

@Component({
  selector: 'app-notifications',
  imports: [StateComponent, StatusBadgeComponent, PwaSettingsComponent, RouterLink, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="notifications-title">
        <div class="notifications-header">
          <div>
            <span class="eyebrow">{{ 'notifications.eyebrow' | t }}</span>
            <div class="title-with-badge">
              <h1 id="notifications-title">{{ 'notifications.title' | t }}</h1>
              @if (unreadCount() > 0) {
                <vereint-status-badge [label]="'notifications.unread' | t: { count: unreadCount() }" tone="warning" />
              }
            </div>
          </div>

          <div class="header-actions">
            @if (unreadCount() > 0) {
              <button
                type="button"
                class="member-button-outline"
                [disabled]="busy()"
                (click)="markAllAsRead()"
              >
                {{ 'notifications.markAllRead' | t }}
              </button>
            }
          </div>
        </div>

        <vereint-pwa-settings [showInstall]="false" />

        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'notifications.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'notifications.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as notifications) {
          @if (notifications.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'notifications.emptyTitle' | t"
              [message]="'notifications.emptyMessage' | t"
            />
          } @else {
            <ul class="notifications-list" [attr.aria-label]="'notifications.listLabel' | t">
              @for (item of notifications; track item.id) {
                <li class="notification-item" [class.unread]="!item.read">
                  <div class="notification-head">
                    <span class="unread-dot" [class.visible]="!item.read" aria-hidden="true"></span>
                    <h3 class="item-title">{{ item.title }}</h3>
                    <vereint-status-badge
                      [label]="typeLabel(item.type)"
                      [tone]="typeTone(item.type)"
                    />
                  </div>

                  <p class="item-body">{{ item.body }}</p>

                  @if (answered()[item.id]; as answer) {
                    <p class="item-answered" role="status">{{ answeredText(answer) }}</p>
                  }
                  @if (rsvpErrors()[item.id]; as error) {
                    <p class="item-error" role="alert">{{ error }}</p>
                  }

                  <div class="item-foot">
                    <time class="item-time" [attr.datetime]="item.createdAt">{{ formatDayTime(item.createdAt) }}</time>
                    <div class="item-actions">
                      @if (item.type === 'event_invitation' && eventIdOf(item.link); as eventId) {
                        @if (answered()[item.id] !== 'accepted') {
                          <button
                            type="button"
                            class="btn-primary-sm item-accept"
                            [disabled]="busy()"
                            (click)="respond(item, eventId, 'accepted')"
                          >
                            {{ 'member.rsvp.accept' | t }}
                          </button>
                        }
                        @if (answered()[item.id] !== 'declined') {
                          <button
                            type="button"
                            class="btn-secondary-sm item-decline"
                            [disabled]="busy()"
                            (click)="respond(item, eventId, 'declined')"
                          >
                            {{ 'member.rsvp.decline' | t }}
                          </button>
                        }
                      }
                      @if (item.link) {
                        <a class="btn-secondary-sm item-open" [routerLink]="item.link">
                          {{ (eventIdOf(item.link) ? 'notifications.openEvent' : 'notifications.open') | t }}
                        </a>
                      }
                      @if (!item.read) {
                        <button
                          type="button"
                          class="item-read"
                          [attr.aria-label]="'notifications.markRead' | t"
                          [disabled]="busy()"
                          (click)="markAsRead(item.id)"
                        >
                          {{ 'notifications.markReadShort' | t }}
                        </button>
                      }
                    </div>
                  </div>
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
      .notifications-header {
        display: grid;
        gap: 0.75rem;
        margin-bottom: var(--space-3);
      }
      .title-with-badge {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem 0.75rem;
        min-width: 0;
      }
      .title-with-badge h1 {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .header-actions {
        display: flex;
        gap: 0.5rem;
      }
      .header-actions:empty {
        display: none;
      }
      .notifications-list {
        list-style: none;
        padding: 0;
        margin: var(--space-3) 0 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .notification-item {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: var(--space-3);
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .notification-head {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: start;
        gap: 0.5rem;
      }
      .unread-dot {
        width: 0.5rem;
        height: 0.5rem;
        margin-top: 0.45rem;
        border-radius: 50%;
        background-color: var(--color-brand);
        visibility: hidden;
      }
      .unread-dot.visible {
        visibility: visible;
      }
      .item-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        line-height: 1.35;
        color: var(--color-text);
      }
      .item-body {
        margin: 0 0 0 1rem;
        font-size: 0.875rem;
        color: var(--color-text-muted);
        line-height: 1.5;
      }
      .item-foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin: 0.25rem 0 0 1rem;
      }
      .item-time {
        font-size: 0.8rem;
        color: var(--color-text-muted);
      }
      .item-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .item-actions a,
      .item-actions button {
        display: inline-flex;
        align-items: center;
        min-height: 2.25rem;
        text-decoration: none;
      }
      .item-read {
        padding: 0 0.25rem;
        border: none;
        background: none;
        color: var(--color-brand);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 700;
        cursor: pointer;
      }
      .btn-primary-sm {
        padding: 0.35rem 0.75rem;
        font-size: 0.8rem;
        font-weight: 600;
        background-color: var(--color-brand, #3b82f6);
        color: var(--color-on-brand, #ffffff);
        border: 1px solid var(--color-brand, #3b82f6);
        border-radius: var(--radius-sm, 0.375rem);
        cursor: pointer;
      }
      .item-answered {
        margin: 0;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-success, #15803d);
      }
      .item-error {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-danger, #b91c1c);
      }
      .member-button-outline {
        min-height: 2.25rem;
        padding: 0 1rem;
        font-size: 0.85rem;
        font-weight: 700;
        background: var(--color-surface);
        color: var(--color-brand);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .member-button-outline:hover:not(:disabled) {
        background: var(--color-brand, #3b82f6);
        color: var(--color-on-brand);
      }
      .btn-secondary-sm {
        padding: 0.35rem 0.75rem;
        font-size: 0.8rem;
        font-weight: 600;
        background-color: var(--color-surface-subtle, #f1f5f9);
        color: var(--color-text, #0f172a);
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-sm, 0.375rem);
        cursor: pointer;
      }
    `,
  ],
})
export class NotificationsComponent implements OnInit, OnDestroy {
  private readonly notificationsApi = inject(NotificationsApiService);

  protected readonly load = new AsyncState<NotificationItem[]>();
  /** Geteilt mit dem Glocken-Badge in der Shell. */
  protected readonly unreadCount = inject(UnreadBadgeStore).count;
  protected readonly busy = signal(false);
  /** Antworten auf Einladungen, die in dieser Ansicht gegeben wurden. */
  protected readonly answered = signal<Record<string, 'accepted' | 'declined'>>({});
  protected readonly rsvpErrors = signal<Record<string, string>>({});

  protected readonly formatDateTime = formatDateTime;
  protected readonly formatDayTime = formatDayTime;

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.notificationsApi.list(), (items) => {
      this.unreadCount.set(items.filter((i) => !i.read).length);
    });

    this.notificationsApi.unreadCount().subscribe({
      next: (res) => this.unreadCount.set(res.unread),
    });
  }

  protected markAsRead(id: string): void {
    this.busy.set(true);
    this.notificationsApi.markRead(id).subscribe({
      next: () => {
        this.busy.set(false);
        this.load.data.update((items) =>
          items ? items.map((i) => (i.id === id ? { ...i, read: true } : i)) : items,
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
      error: () => this.busy.set(false),
    });
  }

  protected markAllAsRead(): void {
    this.busy.set(true);
    this.notificationsApi.markAllRead().subscribe({
      next: () => {
        this.busy.set(false);
        this.load.data.update((items) =>
          items ? items.map((i) => ({ ...i, read: true })) : items,
        );
        this.unreadCount.set(0);
      },
      error: () => this.busy.set(false),
    });
  }

  /** Event-ID aus einem Link der Form `/events/{id}`; sonst `null`. */
  protected eventIdOf(link: string | null | undefined): string | null {
    const match = /^\/events\/([^/?#]+)\/?$/.exec(link ?? '');
    return match && match[1] !== 'new' ? decodeURIComponent(match[1]) : null;
  }

  protected answeredText(answer: 'accepted' | 'declined'): string {
    return translate(answer === 'accepted' ? 'notifications.answered.accepted' : 'notifications.answered.declined');
  }

  /** Zu- oder Absage direkt aus der Einladung; markiert sie danach als gelesen. */
  protected respond(item: NotificationItem, eventId: string, status: 'accepted' | 'declined'): void {
    this.busy.set(true);
    this.rsvpErrors.update((map) => {
      const next = { ...map };
      delete next[item.id];
      return next;
    });
    this.notificationsApi.respondToEvent(eventId, status).subscribe({
      next: () => {
        this.busy.set(false);
        this.answered.update((map) => ({ ...map, [item.id]: status }));
        if (!item.read) this.markAsRead(item.id);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.rsvpErrors.update((map) => ({ ...map, [item.id]: describeApiError(error) }));
      },
    });
  }

  protected typeLabel(type: string): string {
    switch (type) {
      case 'event_invitation':
        return translate('notifications.type.eventInvitation');
      case 'event_reminder':
        return translate('notifications.type.eventReminder');
      case 'event_cancelled':
        return translate('notifications.type.eventCancelled');
      case 'event':
        return translate('notifications.type.event');
      case 'ledger':
        return translate('notifications.type.ledger');
      case 'announcement':
        return translate('notifications.type.announcement');
      case 'system':
        return translate('notifications.type.system');
      case 'moment':
        return translate('notifications.type.moment');
      case 'general':
        return translate('notifications.type.general');
      default:
        return type || translate('notifications.type.info');
    }
  }

  protected typeTone(type: string): StatusTone {
    switch (type) {
      case 'event_invitation':
        return 'success';
      case 'event_reminder':
        return 'warning';
      case 'event_cancelled':
        return 'danger';
      case 'event':
        return 'success';
      case 'ledger':
        return 'warning';
      case 'announcement':
      case 'moment':
        return 'success';
      case 'system':
        return 'neutral';
      default:
        return 'neutral';
    }
  }
}
