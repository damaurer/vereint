import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import {
  NotificationsApiService,
  type NotificationItem,
  type PushSubscriptionItem,
} from './notifications-api.service';
import { NotificationsComponent } from './notifications.component';

const mockNotifications: NotificationItem[] = [
  {
    id: 'n-1',
    title: 'Neues Event geplant',
    body: 'Das Sommerfest startet am Freitag um 18 Uhr.',
    type: 'event',
    read: false,
    createdAt: '2026-07-01T10:00:00Z',
  },
  {
    id: 'n-2',
    title: 'Guthaben aufgeladen',
    body: 'Dein Guthaben wurde um 20,00 EUR aufgeladen.',
    type: 'ledger',
    read: true,
    createdAt: '2026-06-25T14:30:00Z',
  },
];

describe('NotificationsComponent', () => {
  let api: {
    list: ReturnType<typeof vi.fn>;
    unreadCount: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    markAllRead: ReturnType<typeof vi.fn>;
    vapidPublicKey: ReturnType<typeof vi.fn>;
    listSubscriptions: ReturnType<typeof vi.fn>;
    registerSubscription: ReturnType<typeof vi.fn>;
    deleteSubscription: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationsApiService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(NotificationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    api = {
      list: vi.fn(() => of(mockNotifications)),
      unreadCount: vi.fn(() => of({ unread: 1 })),
      markRead: vi.fn((id: string) =>
        of({ ...mockNotifications[0], id, read: true }),
      ),
      markAllRead: vi.fn(() => of({ unread: 0 })),
      vapidPublicKey: vi.fn(() => of({ enabled: true, publicKey: 'test-vapid-key' })),
      listSubscriptions: vi.fn(() => of([])),
      registerSubscription: vi.fn(() => of({})),
      deleteSubscription: vi.fn(() => of(undefined)),
    };
  });

  it('renders notifications list with unread badge', async () => {
    const fixture = await create();
    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Benachrichtigungen');
    expect(text).toContain('1 ungelesen');
    expect(text).toContain('Neues Event geplant');
    expect(text).toContain('Guthaben aufgeladen');
  });

  it('marks individual notification as read', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp['markAsRead']('n-1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.markRead).toHaveBeenCalledWith('n-1');
    expect(cmp['unreadCount']()).toBe(0);
  });

  it('marks all notifications as read', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp['markAllAsRead']();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.markAllRead).toHaveBeenCalled();
    expect(cmp['unreadCount']()).toBe(0);
  });
});
