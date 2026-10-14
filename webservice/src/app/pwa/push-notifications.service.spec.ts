import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { NotificationsApiService } from '../notifications/notifications-api.service';
import { PushNotificationsService, base64UrlToBytes } from './push-notifications.service';

const SERVER_KEY = 'BAECAwQ';

function fakeSubscription(endpoint: string, key?: Uint8Array) {
  return {
    endpoint,
    options: { applicationServerKey: key ? key.buffer : null },
    toJSON: () => ({ endpoint, keys: { p256dh: 'p-key', auth: 'a-key' } }),
    unsubscribe: vi.fn(async () => true),
  };
}

describe('PushNotificationsService', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let pushManager: {
    getSubscription: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  let permission: NotificationPermission;

  const setup = () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: NotificationsApiService, useValue: api },
      ],
    });
    return TestBed.inject(PushNotificationsService);
  };

  beforeEach(() => {
    permission = 'default';
    api = {
      vapidPublicKey: vi.fn(() => of({ enabled: true, publicKey: SERVER_KEY })),
      registerSubscription: vi.fn(() => of({ id: 's-1' })),
      listSubscriptions: vi.fn(() => of([{ id: 's-1', endpoint: 'https://push.example/me' }])),
      deleteSubscription: vi.fn(() => of(undefined)),
    };
    pushManager = {
      getSubscription: vi.fn(async () => null),
      subscribe: vi.fn(async () => fakeSubscription('https://push.example/me')),
    };
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', {
      get permission() {
        return permission;
      },
      requestPermission: vi.fn(async () => {
        permission = 'granted';
        return permission;
      }),
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager }) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as unknown as Record<string, unknown>)['serviceWorker'];
  });

  it('decodes base64url keys', () => {
    expect(Array.from(base64UrlToBytes(SERVER_KEY))).toEqual([4, 1, 2, 3, 4]);
  });

  it('is off on this device when the browser has no subscription', async () => {
    const service = setup();
    await service.sync();
    expect(service.state()).toBe('off');
    expect(api['registerSubscription']).not.toHaveBeenCalled();
  });

  it('subscribes with the server key and registers the device', async () => {
    const service = setup();
    await service.sync();

    await service.enable();

    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(SERVER_KEY),
    });
    expect(api['registerSubscription']).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://push.example/me',
        p256dh: 'p-key',
        auth: 'a-key',
      }),
    );
    expect(service.state()).toBe('on');
  });

  it('stays off when the user declines the permission', async () => {
    const service = setup();
    (Notification.requestPermission as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      permission = 'denied';
      return permission;
    });

    await service.enable();

    expect(service.state()).toBe('blocked');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('reports a server without push instead of subscribing', async () => {
    api['vapidPublicKey'] = vi.fn(() => of({ enabled: false, publicKey: '' }));
    const service = setup();

    await service.enable();

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(service.message()).toContain('nicht eingerichtet');
  });

  it('re-registers an existing subscription and renews it after a key change', async () => {
    permission = 'granted';
    const stale = fakeSubscription('https://push.example/old', new Uint8Array([9, 9, 9]));
    pushManager.getSubscription.mockResolvedValue(stale);
    const service = setup();

    await service.sync();

    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalled();
    expect(api['registerSubscription']).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/me' }),
    );
    expect(service.state()).toBe('on');
  });

  it('removes only this device when disabling', async () => {
    permission = 'granted';
    const current = fakeSubscription('https://push.example/me');
    pushManager.getSubscription.mockResolvedValue(current);
    api['listSubscriptions'] = vi.fn(() =>
      of([
        { id: 's-other', endpoint: 'https://push.example/laptop' },
        { id: 's-1', endpoint: 'https://push.example/me' },
      ]),
    );
    const service = setup();

    await service.disable();

    expect(api['deleteSubscription']).toHaveBeenCalledWith('s-1');
    expect(api['deleteSubscription']).toHaveBeenCalledTimes(1);
    expect(current.unsubscribe).toHaveBeenCalled();
    expect(service.state()).toBe('off');
  });

  it('asks iPhone users to install the app first', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('Notification', undefined);
    const ua = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)');
    delete (navigator as unknown as Record<string, unknown>)['serviceWorker'];
    const service = setup();

    await service.sync();

    expect(service.state()).toBe('needs-install');
    ua.mockRestore();
  });
});
