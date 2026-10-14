import { Component, OnInit, inject, input } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { InstallPromptService } from './install-prompt.service';
import { PushNotificationsService } from './push-notifications.service';

/**
 * App installieren und Mitteilungen auf diesem Gerät ein- oder ausschalten.
 *
 * Steht im Profil (mit Installation) und auf der Mitteilungsseite (nur Push).
 */
@Component({
  selector: 'vereint-pwa-settings',
  imports: [IconComponent],
  template: `
    <div class="pwa-settings">
      @if (showInstall()) {
        <div class="pwa-row">
          <div class="pwa-text">
            <span class="pwa-title"><vereint-icon name="install" /> App auf diesem Gerät</span>
            @switch (installMode()) {
              @case ('installed') {
                <span class="member-muted">Vereint ist installiert.</span>
              }
              @case ('prompt') {
                <span class="member-muted"
                  >Startet wie eine App vom Home-Bildschirm, ohne Browserleiste.</span
                >
              }
              @case ('ios') {
                <span class="member-muted">
                  In Safari unten auf <strong>Teilen</strong> tippen, dann
                  <strong>Zum Home-Bildschirm</strong>.
                </span>
              }
              @default {
                <span class="member-muted"
                  >Im Browsermenü „App installieren“ oder „Zum Startbildschirm“ wählen.</span
                >
              }
            }
          </div>
          @if (installMode() === 'prompt') {
            <button type="button" class="member-button" (click)="install()">Installieren</button>
          }
        </div>
      }

      <div class="pwa-row">
        <div class="pwa-text">
          <span class="pwa-title" id="push-label"
            ><vereint-icon name="bell" /> Mitteilungen auf diesem Gerät</span
          >
          <span class="member-muted">{{ pushHint() }}</span>
        </div>
        @if (pushToggleable()) {
          <input
            type="checkbox"
            role="switch"
            aria-labelledby="push-label"
            [checked]="push.state() === 'on'"
            [attr.aria-checked]="push.state() === 'on'"
            [disabled]="push.busy()"
            (change)="togglePush()"
          />
        }
      </div>

      @if (push.message(); as message) {
        <p class="member-hint" role="status">{{ message }}</p>
      }
    </div>
  `,
  styles: [
    `
      .pwa-settings {
        display: grid;
        gap: var(--space-2);
        margin: var(--space-3) 0 0;
      }

      .pwa-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
      }

      .pwa-text {
        display: grid;
        gap: 0.2rem;
      }

      .pwa-title {
        color: var(--color-text);
        font-weight: 700;
      }

      .pwa-row input {
        flex: none;
        width: 1.25rem;
        height: 1.25rem;
        accent-color: var(--color-brand);
      }

      .pwa-row .member-button {
        flex: none;
      }
    `,
  ],
})
export class PwaSettingsComponent implements OnInit {
  protected readonly push = inject(PushNotificationsService);
  private readonly installer = inject(InstallPromptService);

  readonly showInstall = input(true);

  protected readonly installMode = this.installer.mode;

  ngOnInit(): void {
    void this.push.sync();
  }

  protected pushToggleable(): boolean {
    const state = this.push.state();
    return state === 'on' || state === 'off';
  }

  protected pushHint(): string {
    switch (this.push.state()) {
      case 'on':
        return 'Du bekommst neue Mitteilungen auch bei geschlossener App.';
      case 'off':
        return 'Neue Mitteilungen auch bei geschlossener App erhalten.';
      case 'blocked':
        return 'Im Browser blockiert. Erlaube Mitteilungen in den Website-Einstellungen.';
      case 'needs-install':
        return 'Auf iPhone und iPad erst nach der Installation auf dem Home-Bildschirm möglich.';
      case 'unsupported':
        return 'Dieser Browser unterstützt keine Mitteilungen.';
      default:
        return 'Wird geprüft …';
    }
  }

  protected togglePush(): void {
    void (this.push.state() === 'on' ? this.push.disable() : this.push.enable());
  }

  protected install(): void {
    void this.installer.install();
  }
}
