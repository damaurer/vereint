import { Component, Injector, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InstallPromptService } from './pwa/install-prompt.service';
import { PwaService } from './pwa/pwa.service';
import { ServiceWorkerCleanupService } from './service-worker-cleanup.service';
import { ThemeService } from './shell/theme.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  template: '<router-outlet />',
})
export class App implements OnInit {
  protected readonly title = signal('vereint');

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
