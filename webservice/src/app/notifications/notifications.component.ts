import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import {
  NotificationsApiService,
  type NotificationItem,
  type PushSubscriptionItem,
  type RegisterPushSubscriptionRequest,
} from './notifications-api.service';
import { AsyncState } from '../member/async-state';
import { formatDateTime } from '../member/member-format';
import { StatusBadgeComponent, type StatusTone } from '../ui';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

@Component({
  selector: 'app-notifications',
  imports: [StatusBadgeComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="notifications-title">
        <div class="notifications-header">
          <div>
            <span class="eyebrow">Mitteilungen</span>
            <div class="title-with-badge">
              <h1 id="notifications-title">Benachrichtigungen</h1>
              @if (unreadCount() > 0) {
                <vereint-status-badge [label]="unreadCount() + ' ungelesen'" tone="warning" />
              }
            </div>
            <p>Bleibe über Events, Vereinsankündigungen und Neuigkeiten auf dem Laufenden.</p>
          </div>

          <div class="header-actions">
            @if (unreadCount() > 0) {
              <button
                type="button"
                class="member-button-outline"
                [disabled]="busy()"
                (click)="markAllAsRead()"
              >
                Alle als gelesen markieren
              </button>
            }
          </div>
        </div>

        <!-- Web Push Card -->
        <div class="push-card">
          <div class="push-card-content">
            <span class="push-icon">🔔</span>
            <div>
              <h3 class="push-title">Web-Push-Benachrichtigungen</h3>
              <p class="push-desc">
                @if (isPushSubscribed()) {
                  Push-Benachrichtigungen sind für dieses Gerät aktiviert.
                } @else {
                  Erhalte sofortige Benachrichtigungen zu Events, Thekendienst und Vereinsnews auch bei geschlossenem Browser.
                }
              </p>
            </div>
          </div>

          <div class="push-actions">
            @if (isPushSubscribed()) {
              @if (currentSubscription(); as sub) {
                <button
                  type="button"
                  class="btn-danger-sm"
                  [disabled]="busy()"
                  (click)="unsubscribePush(sub.id)"
                >
                  Push deaktivieren
                </button>
              }
            } @else {
              <button
                type="button"
                class="member-button"
                [disabled]="busy() || !pushSupported()"
                (click)="subscribePush()"
              >
                {{ pushSupported() ? 'Push aktivieren' : 'Push nicht unterstützt' }}
              </button>
            }
          </div>
        </div>

        @if (pushMessage()) {
          <div class="state-card state-info" role="status">
            <span>{{ pushMessage() }}</span>
          </div>
        }

        @if (load.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Benachrichtigungen werden abgerufen.</span>
          </div>
        } @else if (load.isError()) {
          <div class="state-card state-error" role="alert">
            <strong>Benachrichtigungen nicht verfügbar</strong>
            <span>{{ load.errorMessage() }}</span>
            <button type="button" class="member-button" (click)="reload()">Erneut versuchen</button>
          </div>
        } @else if (load.data(); as notifications) {
          @if (notifications.length === 0) {
            <div class="state-card" role="status">
              <strong>Keine Benachrichtigungen</strong>
              <span>Du hast aktuell keine Benachrichtigungen.</span>
            </div>
          } @else {
            <ul class="notifications-list" aria-label="Benachrichtigungsliste">
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
                        Als gelesen markieren
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
      .push-card {
        background: var(--color-surface-subtle, #f8fafc);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 0.75rem);
        padding: 1.25rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.5rem;
      }
      .push-card-content {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      .push-icon {
        font-size: 1.75rem;
      }
      .push-title {
        margin: 0 0 0.25rem 0;
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-text, #0f172a);
      }
      .push-desc {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-muted, #64748b);
        max-width: 32rem;
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
      .btn-danger-sm {
        padding: 0.4rem 0.8rem;
        font-size: 0.8rem;
        font-weight: 600;
        background-color: #fee2e2;
        color: #b91c1c;
        border: none;
        border-radius: var(--radius-sm, 0.375rem);
        cursor: pointer;
      }
      .state-info {
        background-color: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1e40af;
        padding: 0.75rem 1rem;
        border-radius: var(--radius-md, 0.5rem);
        margin-bottom: 1.5rem;
      }
    `,
  ],
})
export class NotificationsComponent implements OnInit, OnDestroy {
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly load = new AsyncState<NotificationItem[]>();
  protected readonly unreadCount = signal(0);
  protected readonly busy = signal(false);

  // Push state
  protected readonly pushSupported = signal(false);
  protected readonly isPushSubscribed = signal(false);
  protected readonly currentSubscription = signal<PushSubscriptionItem | null>(null);
  protected readonly pushMessage = signal<string | null>(null);

  protected readonly formatDateTime = formatDateTime;

  ngOnInit(): void {
    this.checkPushSupport();
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  private checkPushSupport(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    this.pushSupported.set(supported);
  }

  protected reload(): void {
    this.load.run(this.notificationsApi.list(), (items) => {
      this.unreadCount.set(items.filter((i) => !i.read).length);
    });

    this.notificationsApi.unreadCount().subscribe({
      next: (res) => this.unreadCount.set(res.unread),
    });

    if (isPlatformBrowser(this.platformId)) {
      this.notificationsApi.listSubscriptions().subscribe({
        next: (subs) => {
          if (subs.length > 0) {
            this.isPushSubscribed.set(true);
            this.currentSubscription.set(subs[0]);
          } else {
            this.isPushSubscribed.set(false);
            this.currentSubscription.set(null);
          }
        },
      });
    }
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

  protected async subscribePush(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.busy.set(true);
    this.pushMessage.set(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.busy.set(false);
        this.pushMessage.set('Berechtigung für Benachrichtigungen wurde nicht erteilt.');
        return;
      }

      this.notificationsApi.vapidPublicKey().subscribe({
        next: async (vapid) => {
          if (!vapid.enabled || !vapid.publicKey) {
            this.busy.set(false);
            this.pushMessage.set('Web-Push ist auf dem Server derzeit nicht aktiviert.');
            return;
          }

          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
            });

            const p256dhBuffer = subscription.getKey('p256dh');
            const authBuffer = subscription.getKey('auth');

            const payload: RegisterPushSubscriptionRequest = {
              endpoint: subscription.endpoint,
              p256dh: arrayBufferToBase64(p256dhBuffer),
              auth: arrayBufferToBase64(authBuffer),
              userAgent: navigator.userAgent,
            };

            this.notificationsApi.registerSubscription(payload).subscribe({
              next: (saved) => {
                this.busy.set(false);
                this.isPushSubscribed.set(true);
                this.currentSubscription.set(saved);
                this.pushMessage.set('Web-Push-Benachrichtigungen erfolgreich aktiviert!');
              },
              error: (err: unknown) => {
                this.busy.set(false);
                this.pushMessage.set((err as Error)?.message || 'Fehler beim Registrieren des Push-Abonnements.');
              },
            });
          } catch (err: unknown) {
            this.busy.set(false);
            this.pushMessage.set((err as Error)?.message || 'PushManager-Registrierung fehlgeschlagen.');
          }
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.pushMessage.set((err as Error)?.message || 'VAPID-Schlüssel konnte nicht abgerufen werden.');
        },
      });
    } catch (err: unknown) {
      this.busy.set(false);
      this.pushMessage.set((err as Error)?.message || 'Fehler bei der Push-Aktivierung.');
    }
  }

  protected unsubscribePush(subscriptionId: string): void {
    this.busy.set(true);
    this.pushMessage.set(null);

    this.notificationsApi.deleteSubscription(subscriptionId).subscribe({
      next: async () => {
        if (isPlatformBrowser(this.platformId) && 'serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
              await subscription.unsubscribe();
            }
          } catch {
            // Ignore client-side unsubscribe error
          }
        }
        this.busy.set(false);
        this.isPushSubscribed.set(false);
        this.currentSubscription.set(null);
        this.pushMessage.set('Push-Benachrichtigungen deaktiviert.');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.pushMessage.set((err as Error)?.message || 'Fehler beim Abbestellen des Push-Abonnements.');
      },
    });
  }

  protected typeLabel(type: string): string {
    switch (type) {
      case 'event':
        return 'Event';
      case 'ledger':
        return 'Kasse';
      case 'announcement':
        return 'Ankündigung';
      case 'system':
        return 'System';
      default:
        return type || 'Info';
    }
  }

  protected typeTone(type: string): StatusTone {
    switch (type) {
      case 'event':
        return 'success';
      case 'ledger':
        return 'warning';
      case 'announcement':
        return 'success';
      case 'system':
        return 'neutral';
      default:
        return 'neutral';
    }
  }
}
