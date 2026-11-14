import { Component, Injector, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { KioskLockComponent } from './kiosk/kiosk-lock.component';
import { KioskModeService } from './kiosk/kiosk-mode.service';
import { InstallPromptService } from './pwa/install-prompt.service';
import { PwaService } from './pwa/pwa.service';
import { ServiceWorkerCleanupService } from './service-worker-cleanup.service';
import { ThemeService } from './shell/theme.service';

@Component({
  imports: [RouterOutlet, KioskLockComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  // Das Kiosk-Schloss wird erst geladen, wenn der Modus auf dem Gerät aktiv ist.
  template: `
    <router-outlet />
    @defer (when kiosk.active()) {
      <app-kiosk-lock />
    }
  `,
})
export class App implements OnInit {
  protected readonly title = signal('vereint');
  protected readonly kiosk = inject(KioskModeService);

  constructor(
    private readonly serviceWorkerCleanup: ServiceWorkerCleanupService,
    private readonly pwa: PwaService,
    private readonly theme: ThemeService,
    private readonly installPrompt: InstallPromptService,
    private readonly injector: Injector,
  ) {}

  ngOnInit(): void {
    this.theme.init();
    this.installPrompt.init();
    void this.startServiceWorkers();
  }

  /**
   * Erst veraltete/fremde Worker entfernen, dann den eigenen SW registrieren und
   * ein vorhandenes Push-Abonnement mit dem Server abgleichen (nur Browser).
   */
  private async startServiceWorkers(): Promise<void> {
    await this.serviceWorkerCleanup.removeStaleWorkers();
    const registration = await this.pwa.register();
    if (!registration) return;
    // Lazy, damit der Push-Code nicht im Start-Bundle landet.
    const { PushNotificationsService } = await import('./pwa/push-notifications.service');
    await this.injector.get(PushNotificationsService).sync();
  }
}
