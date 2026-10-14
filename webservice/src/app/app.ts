import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
  ) {}

  ngOnInit(): void {
    this.theme.init();
    void this.startServiceWorkers();
  }

  /** Erst veraltete/fremde Worker entfernen, dann den eigenen SW registrieren (nur Browser). */
  private async startServiceWorkers(): Promise<void> {
    await this.serviceWorkerCleanup.removeStaleWorkers();
    await this.pwa.register();
  }
}
