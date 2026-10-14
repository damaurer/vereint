import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { PwaSettingsComponent } from '../pwa/pwa-settings.component';
import {
  NotificationsApiService,
  type NotificationItem,
} from './notifications-api.service';
import { UnreadBadgeStore } from './unread-badge.store';
import { AsyncState } from '../member/async-state';
import { formatDateTime } from '../member/member-format';
import { StatusBadgeComponent, type StatusTone } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

@Component({
  selector: 'app-notifications',
  imports: [StateComponent, StatusBadgeComponent, PwaSettingsComponent, TranslatePipe],
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
            <p>{{ 'notifications.intro' | t }}</p>
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
                    <div class="head-left">
                      <span class="unread-dot" [class.visible]="!item.read" aria-hidden="true"></span>
                      <h3 class="item-title">{{ item.title }}</h3>
                      <vereint-status-badge
                        [label]="typeLabel(item.type)"
                        [tone]="typeTone(item.type)"
                      />
                    </div>
                    <time class="item-time">{{ formatDateTime(item.createdAt) }}</time>
                  </div>

                  <p class="item-body">{{ item.body }}</p>

                  @if (!item.read) {
                    <div class="item-actions">
                      <button
                        type="button"
                        class="btn-secondary-sm"
                        [disabled]="busy()"
                        (click)="markAsRead(item.id)"
                      >
                        {{ 'notifications.markRead' | t }}
                      </button>
                    </div>
                  }
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
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.5rem;
      }
      .title-with-badge {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .title-with-badge h1 {
        margin: 0;
      }
      .header-actions {
        display: flex;
        gap: 0.5rem;
      }
      .notifications-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .notification-item {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 0.75rem);
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        transition: border-color 0.2s;
      }
      .notification-item.unread {
        border-left: 4px solid var(--color-brand, #3b82f6);
        background: rgba(59, 130, 246, 0.02);
      }
      .notification-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .head-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .unread-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--color-brand, #3b82f6);
        visibility: hidden;
      }
      .unread-dot.visible {
        visibility: visible;
      }
      .item-title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--color-text, #0f172a);
      }
      .item-time {
        font-size: 0.8rem;
        color: var(--color-text-muted, #64748b);
      }
      .item-body {
        margin: 0;
        font-size: 0.95rem;
        color: var(--color-text, #334155);
        line-height: 1.5;
      }
      .item-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 0.25rem;
      }
      .member-button-outline {
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
        font-weight: 600;
        background: transparent;
        color: var(--color-brand, #3b82f6);
        border: 1px solid var(--color-brand, #3b82f6);
        border-radius: var(--radius-md, 0.5rem);
        cursor: pointer;
        transition: all 0.2s;
      }
      .member-button-outline:hover:not(:disabled) {
        background: var(--color-brand, #3b82f6);
        color: #ffffff;
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

  protected readonly formatDateTime = formatDateTime;

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

  protected typeLabel(type: string): string {
    switch (type) {
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
      default:
        return type || translate('notifications.type.info');
    }
  }

  protected typeTone(type: string): StatusTone {
    switch (type) {
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
