import { Component, OnInit, inject, input } from '@angular/core';
import { TranslatePipe } from '../i18n';
import { InstallPromptService } from './install-prompt.service';
import { PushNotificationsService } from './push-notifications.service';

/**
 * App installieren und Mitteilungen auf diesem Gerät ein- oder ausschalten.
 *
 * Steht im Profil (mit Installation) und auf der Mitteilungsseite (nur Push).
 */
@Component({
  selector: 'vereint-pwa-settings',
  imports: [TranslatePipe],
  template: `
    <div class="pwa-settings">
      <div class="pwa-row">
        <div class="pwa-text">
          <span class="pwa-title" id="push-label"
            >{{ 'pwa.push.title' | t }}</span
          >
          <span class="member-muted">{{ pushHintKey() | t }}</span>
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

      <ng-content />

      @if (showInstall()) {
        <div class="pwa-row pwa-row-sep">
          <div class="pwa-text">
            <span class="pwa-title">{{ 'pwa.install.title' | t }}</span>
            @switch (installMode()) {
              @case ('installed') {
                <span class="member-muted">{{ 'pwa.install.installed' | t }}</span>
              }
              @case ('prompt') {
                <span class="member-muted">{{ 'pwa.install.prompt' | t }}</span>
              }
              @case ('ios') {
                <span class="member-muted">{{ 'pwa.install.ios' | t }}</span>
              }
              @default {
                <span class="member-muted">{{ 'pwa.install.manual' | t }}</span>
              }
            }
          </div>
          @if (installMode() === 'prompt') {
            <button type="button" class="member-button" (click)="install()">
              {{ 'pwa.install.button' | t }}
            </button>
          }
        </div>
      }

      @if (push.message(); as message) {
        <p class="member-hint" role="status">{{ message }}</p>
      }
    </div>
  `,
  styles: [
    `
      .pwa-settings {
        display: grid;
        margin: var(--space-3) 0 0;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-surface);
      }

      .pwa-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: 0.8rem var(--space-3);
      }

      .pwa-text {
        display: grid;
        gap: 0.1rem;
      }

      .pwa-text .member-muted {
        font-size: 0.8rem;
        line-height: 1.4;
      }

      .pwa-title {
        color: var(--color-text);
        font-size: 0.95rem;
        font-weight: 700;
      }

      .pwa-row .member-button {
        flex: none;
      }

      .pwa-row-sep {
        border-top: 1px solid var(--color-border);
      }

      .pwa-settings > .member-hint {
        border-top: 1px solid var(--color-border);
        margin: 0;
        padding: 0.6rem var(--space-3);
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

  protected pushHintKey(): string {
    switch (this.push.state()) {
      case 'on':
        return 'pwa.push.hint.on';
      case 'off':
        return 'pwa.push.hint.off';
      case 'blocked':
        return 'pwa.push.hint.blocked';
      case 'needs-install':
        return 'pwa.push.hint.needsInstall';
      case 'unsupported':
        return 'pwa.push.hint.unsupported';
      default:
        return 'pwa.push.hint.checking';
    }
  }

  protected togglePush(): void {
    void (this.push.state() === 'on' ? this.push.disable() : this.push.enable());
  }

  protected install(): void {
    void this.installer.install();
  }
}
