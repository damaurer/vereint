import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClient } from '../api/api-client.service';
import { NotificationsApiService } from './notifications-api.service';

describe('NotificationsApiService', () => {
  let service: NotificationsApiService;
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      get: vi.fn(() => of([])),
      post: vi.fn(() => of({})),
      delete: vi.fn(() => of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        NotificationsApiService,
        { provide: ApiClient, useValue: api },
      ],
    });
    service = TestBed.inject(NotificationsApiService);
  });

  it('lists notifications and gets unread count', () => {
    service.list();
    expect(api.get).toHaveBeenCalledWith('/notifications');

    service.unreadCount();
    expect(api.get).toHaveBeenCalledWith('/notifications/unread-count');
  });

  it('marks single and all notifications as read', () => {
    service.markRead('n-1');
    expect(api.post).toHaveBeenCalledWith('/notifications/n-1/read', {});

    service.markAllRead();
    expect(api.post).toHaveBeenCalledWith('/notifications/read-all', {});
  });

  it('retrieves VAPID key and manages push subscriptions', () => {
    service.vapidPublicKey();
    expect(api.get).toHaveBeenCalledWith('/notifications/vapid-public-key');

    const subReq = { endpoint: 'https://push.example.com', p256dh: 'p256', auth: 'auth' };
    service.registerSubscription(subReq);
    expect(api.post).toHaveBeenCalledWith('/notifications/subscriptions', subReq);

    service.deleteSubscription('sub-1');
    expect(api.delete).toHaveBeenCalledWith('/notifications/subscriptions/sub-1');
  });
});
