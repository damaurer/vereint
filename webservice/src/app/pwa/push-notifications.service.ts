import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { translate } from '../i18n/i18n.service';
import { NotificationsApiService } from '../notifications/notifications-api.service';
import { isIosDevice, isStandalone } from './platform';

/**
 * Push-Zustand dieses Geräts.
 *
 * - `unsupported`: Browser kann kein Web Push.
 * - `needs-install`: iPhone/iPad; Push geht erst in der installierten App.
 * - `blocked`: Mitteilungen wurden im Browser abgelehnt.
 * - `off` / `on`: Opt-in möglich bzw. aktiv.
 */
export type PushState = 'unknown' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function sameKey(current: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!current) return true; // Nicht jeder Browser legt den Schlüssel offen.
  const bytes = new Uint8Array(current);
  return (
    bytes.length === expected.length && bytes.every((value, index) => value === expected[index])
  );
}

/**
 * Opt-in für Web-Push-Mitteilungen auf diesem Gerät.
 *
 * Maßgeblich ist das Abonnement des Browsers, nicht die Serverliste: Ein Mitglied
 * kann Push auf dem Handy aktiv und am Laptop aus haben. Beim Start gleicht
 * [sync] ein vorhandenes Abonnement mit dem Server ab und erneuert es, wenn sich
 * der VAPID-Schlüssel geändert hat.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private readonly api = inject(NotificationsApiService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly state = signal<PushState>('unknown');
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);

  private initialized?: Promise<void>;

  /** Ermittelt den Zustand und gleicht ein vorhandenes Abonnement ab (einmalig). */
  sync(): Promise<void> {
    this.initialized ??= this.detect(true);
    return this.initialized;
  }

  async enable(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.state.set(permission === 'denied' ? 'blocked' : 'off');
        this.message.set(translate('pwa.push.message.permissionDenied'));
        return;
      }
      const key = await this.serverKey();
      if (!key) {
        this.message.set(translate('pwa.push.message.serverDisabled'));
        return;
      }
      const registration = await this.registration();
      if (!registration) {
        this.message.set(
          translate('pwa.push.message.notReady'),
        );
        return;
      }
      const subscription = await this.subscribe(registration, key);
      await this.register(subscription);
      this.state.set('on');
      this.message.set(translate('pwa.push.message.enabled'));
    } catch {
      this.message.set(
        translate('pwa.push.message.enableFailed'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      const registration = await this.registration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const serverSide = await firstValueFrom(this.api.listSubscriptions());
        const match = serverSide.find((item) => item.endpoint === subscription.endpoint);
        if (match) await firstValueFrom(this.api.deleteSubscription(match.id));
        await subscription.unsubscribe();
      }
      this.state.set('off');
      this.message.set(translate('pwa.push.message.disabled'));
    } catch {
      this.message.set(
        translate('pwa.push.message.disableFailed'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async detect(syncWithServer: boolean): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const supported =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) {
      this.state.set(isIosDevice() && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      this.state.set('blocked');
      return;
    }

    const registration = await this.registration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription || Notification.permission !== 'granted') {
      this.state.set('off');
      return;
    }

    this.state.set('on');
    if (syncWithServer && registration) {
      try {
        await this.refresh(registration, subscription);
      } catch {
        // Abgleich ist optional; der nächste Start versucht es erneut.
      }
    }
  }

  /** Meldet das Abonnement erneut an und tauscht es bei geändertem Serverschlüssel. */
  private async refresh(
    registration: ServiceWorkerRegistration,
    subscription: PushSubscription,
  ): Promise<void> {
    const key = await this.serverKey();
    if (!key) return;
    let current = subscription;
    if (!sameKey(subscription.options?.applicationServerKey, key)) {
      await subscription.unsubscribe();
      current = await this.subscribe(registration, key);
    }
    await this.register(current);
  }

  private async serverKey(): Promise<Uint8Array<ArrayBuffer> | null> {
    const vapid = await firstValueFrom(this.api.vapidPublicKey());
    return vapid.enabled && vapid.publicKey ? base64UrlToBytes(vapid.publicKey) : null;
  }

  private subscribe(
    registration: ServiceWorkerRegistration,
    key: Uint8Array<ArrayBuffer>,
  ): Promise<PushSubscription> {
    return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }

  private async register(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    await firstValueFrom(
      this.api.registerSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.['p256dh'] ?? '',
        auth: json.keys?.['auth'] ?? '',
        userAgent: navigator.userAgent.slice(0, 512),
      }),
    );
  }

  /** Wartet höchstens kurz auf den Service Worker, statt ewig zu hängen. */
  private async registration(): Promise<ServiceWorkerRegistration | undefined> {
    const ready = navigator.serviceWorker.ready;
    const timeout = new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), 10_000),
    );
    return Promise.race([ready, timeout]);
  }
}
