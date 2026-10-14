import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isIosDevice, isStandalone } from './platform';

/** Nicht standardisiertes Ereignis von Chrome, Edge und Samsung Internet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Wie sich Vereint auf diesem Gerät installieren lässt.
 *
 * - `installed`: läuft bereits als App.
 * - `prompt`: der Browser bietet einen eigenen Installationsdialog an.
 * - `ios`: Safari kennt keinen Dialog; Installation über „Zum Home-Bildschirm“.
 * - `manual`: Installation über das Browsermenü (z. B. Firefox, Desktop-Safari).
 */
export type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual';

/**
 * Fängt `beforeinstallprompt` früh ab, damit das Profil später einen eigenen
 * „App installieren“-Knopf zeigen kann. [init] läuft beim App-Start.
 */
@Injectable({ providedIn: 'root' })
export class InstallPromptService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly deferred = signal<BeforeInstallPromptEvent | null>(null);
  private readonly installed = signal(false);
  private readonly ios = signal(false);
  private started = false;

  readonly mode = computed<InstallMode>(() => {
    if (this.installed()) return 'installed';
    if (this.deferred()) return 'prompt';
    return this.ios() ? 'ios' : 'manual';
  });

  init(): void {
    if (this.started || !isPlatformBrowser(this.platformId)) return;
    this.started = true;
    this.installed.set(isStandalone());
    this.ios.set(isIosDevice());

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferred.set(event as BeforeInstallPromptEvent);
    });
    window.addEventListener('appinstalled', () => {
      this.deferred.set(null);
      this.installed.set(true);
    });
  }

  /** Zeigt den Installationsdialog des Browsers; `true`, wenn angenommen. */
  async install(): Promise<boolean> {
    const event = this.deferred();
    if (!event) return false;
    this.deferred.set(null); // Ein Ereignis lässt sich nur einmal verwenden.
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') this.installed.set(true);
    return choice.outcome === 'accepted';
  }
}
