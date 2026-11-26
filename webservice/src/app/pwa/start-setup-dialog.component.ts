import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../i18n';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import {
  DevicePermission,
  cameraPermission,
  locationPermission,
  requestCamera,
  requestLocation,
} from './device-permissions';
import { InstallPromptService } from './install-prompt.service';
import { PushNotificationsService } from './push-notifications.service';
import { markStartSetupDone } from './start-setup';

/** Zustand einer Zeile im Dialog; `ask` zeigt den Knopf „Erlauben“. */
type RowState = 'ask' | 'granted' | 'denied' | 'later' | 'busy';

function rowOf(permission: DevicePermission): RowState | null {
  switch (permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'prompt':
      return 'ask';
    default:
      return null; // Gerät kann es nicht: Zeile ausblenden.
  }
}

/**
 * Startdialog „Vereint einrichten“ nach der ersten Anmeldung auf einem Gerät.
 *
 * Bietet die Installation auf dem Home-Bildschirm an (mit Hinweis, warum sie
 * nötig ist) und holt die Erlaubnisse für Mitteilungen, Kamera (Strichcode
 * scannen) und Standort (Moments) per Knopfdruck ein; Browser lassen solche
 * Abfragen nur nach einer Nutzeraktion zu. Was beim Schließen nicht erlaubt
 * ist, fragt der Dialog nie wieder; die Funktion fragt erst bei Benutzung.
 *
 * Gibt es nichts zu fragen (alles erlaubt und installiert), schließt sich der
 * Dialog sofort und unsichtbar.
 */
@Component({
  selector: 'vereint-start-setup-dialog',
  imports: [ModalComponent, IconComponent, NgTemplateOutlet, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <vereint-modal [open]="ready()" [title]="'pwa.setup.title' | t" (closed)="finish()">
      <p class="setup-intro">{{ 'pwa.setup.intro' | t }}</p>

      @if (installMode() !== 'installed') {
        <section class="setup-home" aria-labelledby="setup-home-title">
          <vereint-icon class="setup-icon" name="install" />
          <div class="setup-text">
            <strong id="setup-home-title">{{ 'pwa.setup.home.title' | t }}</strong>
            <span>{{ 'pwa.setup.home.why' | t }}</span>
            @switch (installMode()) {
              @case ('ios') {
                <ol class="setup-steps">
                  <li>{{ 'pwa.setup.home.ios1' | t }}</li>
                  <li>{{ 'pwa.setup.home.ios2' | t }}</li>
                  <li>{{ 'pwa.setup.home.ios3' | t }}</li>
                </ol>
              }
              @case ('manual') {
                <span class="member-muted">{{ 'pwa.install.manual' | t }}</span>
              }
            }
          </div>
          @if (installMode() === 'prompt') {
            <button type="button" class="member-button" (click)="install()">
              {{ 'pwa.install.button' | t }}
            </button>
          }
        </section>
      }

      <ul class="setup-list">
        @if (pushRow(); as state) {
          <li class="setup-row">
            <vereint-icon class="setup-icon" name="bell" />
            <div class="setup-text">
              <strong>{{ 'pwa.setup.push.title' | t }}</strong>
              <span>{{ (state === 'later' ? 'pwa.setup.push.needsInstall' : 'pwa.setup.push.why') | t }}</span>
            </div>
            <ng-container
              *ngTemplateOutlet="action; context: { state: state, run: allowPush }"
            />
          </li>
        }
        @if (camera(); as state) {
          <li class="setup-row">
            <vereint-icon class="setup-icon" name="camera" />
            <div class="setup-text">
              <strong>{{ 'pwa.setup.camera.title' | t }}</strong>
              <span>{{ 'pwa.setup.camera.why' | t }}</span>
            </div>
            <ng-container
              *ngTemplateOutlet="action; context: { state: state, run: allowCamera }"
            />
          </li>
        }
        @if (location(); as state) {
          <li class="setup-row">
            <vereint-icon class="setup-icon" name="location" />
            <div class="setup-text">
              <strong>{{ 'pwa.setup.location.title' | t }}</strong>
              <span>{{ 'pwa.setup.location.why' | t }}</span>
            </div>
            <ng-container
              *ngTemplateOutlet="action; context: { state: state, run: allowLocation }"
            />
          </li>
        }
      </ul>

      <ng-template #action let-state="state" let-run="run">
        @switch (state) {
          @case ('ask') {
            <button type="button" class="member-button" (click)="run()">
              {{ 'pwa.setup.allow' | t }}
            </button>
          }
          @case ('busy') {
            <span class="setup-status" role="status">{{ 'pwa.setup.busy' | t }}</span>
          }
          @case ('granted') {
            <span class="setup-status setup-status-ok">
              <vereint-icon name="check" /> {{ 'pwa.setup.granted' | t }}
            </span>
          }
          @case ('denied') {
            <span class="setup-status">{{ 'pwa.setup.denied' | t }}</span>
          }
          @default {
            <span class="setup-status">{{ 'pwa.setup.later' | t }}</span>
          }
        }
      </ng-template>

      <p class="setup-note">{{ 'pwa.setup.note' | t }}</p>
      <div class="setup-actions">
        <button type="button" class="member-button" (click)="finish()">
          {{ (allDone() ? 'pwa.setup.done' : 'pwa.setup.skip') | t }}
        </button>
      </div>
    </vereint-modal>
  `,
  styles: [
    `
      .setup-intro,
      .setup-note {
        margin: 0 0 var(--space-3);
        color: var(--color-text-muted);
        font-size: 0.9rem;
        line-height: 1.45;
      }
      .setup-note {
        margin: var(--space-3) 0 0;
        font-size: 0.8rem;
      }
      .setup-home,
      .setup-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .setup-home {
        margin-bottom: var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-brand-soft);
      }
      .setup-list {
        display: grid;
        margin: 0;
        padding: 0;
        list-style: none;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
      }
      .setup-row {
        padding: 0.75rem var(--space-3);
      }
      .setup-row + .setup-row {
        border-top: 1px solid var(--color-border);
      }
      .setup-icon {
        flex: none;
        align-self: flex-start;
        margin-top: 0.15rem;
        color: var(--color-brand);
      }
      .setup-text {
        display: grid;
        flex: 1 1 auto;
        gap: 0.15rem;
        min-width: 0;
        font-size: 0.85rem;
        line-height: 1.4;
      }
      .setup-text strong {
        color: var(--color-text);
        font-size: 0.95rem;
      }
      .setup-steps {
        margin: 0.25rem 0 0;
        padding-left: 1.2rem;
      }
      .setup-home .member-button,
      .setup-row .member-button {
        flex: none;
      }
      .setup-status {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        max-width: 8rem;
        color: var(--color-text-muted);
        font-size: 0.8rem;
        text-align: right;
      }
      .setup-status-ok {
        color: var(--color-success);
        font-weight: 600;
      }
      .setup-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: var(--space-3);
      }
    `,
  ],
})
export class StartSetupDialogComponent implements OnInit {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly push = inject(PushNotificationsService);
  private readonly installer = inject(InstallPromptService);

  /** Dialog ist fertig (geschlossen oder es gab nichts zu fragen). */
  readonly closed = output<void>();

  protected readonly ready = signal(false);
  protected readonly installMode = this.installer.mode;
  protected readonly camera = signal<RowState | null>(null);
  protected readonly location = signal<RowState | null>(null);
  private readonly pushBusy = signal(false);

  protected readonly pushRow = computed<RowState | null>(() => {
    if (this.pushBusy() || this.push.busy()) return 'busy';
    switch (this.push.state()) {
      case 'on':
        return 'granted';
      case 'off':
        return 'ask';
      case 'blocked':
        return 'denied';
      case 'needs-install':
        return 'later';
      default:
        return null;
    }
  });

  /** Nichts mehr offen: alles erlaubt bzw. abgelehnt und die App installiert. */
  protected readonly allDone = computed(() => {
    const rows = [this.pushRow(), this.camera(), this.location()];
    const open = rows.some((row) => row === 'ask' || row === 'busy' || row === 'later');
    return !open && this.installMode() === 'installed';
  });

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;
    // Der Push-Abgleich wartet ggf. auf den Service Worker; höchstens kurz warten.
    const pushChecked = Promise.race([
      this.push.sync(),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
    const [, camera, location] = await Promise.all([
      pushChecked,
      cameraPermission(),
      locationPermission(),
    ]);
    this.camera.set(rowOf(camera));
    this.location.set(rowOf(location));
    const rows = [this.pushRow(), this.camera(), this.location()];
    const pushUnknown = this.push.state() === 'unknown';
    const nothingToAsk = !pushUnknown && !rows.includes('ask') && !rows.includes('later');
    if (nothingToAsk && this.installMode() === 'installed') {
      this.finish();
      return;
    }
    this.ready.set(true);
  }

  protected readonly allowPush = async (): Promise<void> => {
    this.pushBusy.set(true);
    try {
      await this.push.enable();
    } finally {
      this.pushBusy.set(false);
    }
  };

  protected readonly allowCamera = async (): Promise<void> => {
    this.camera.set('busy');
    this.camera.set(rowOf(await requestCamera()));
  };

  protected readonly allowLocation = async (): Promise<void> => {
    this.location.set('busy');
    this.location.set(rowOf(await requestLocation()));
  };

  protected install(): void {
    void this.installer.install();
  }

  /** Einmal pro Gerät: Offenes gilt ab jetzt als „nicht beim Start fragen“. */
  protected finish(): void {
    markStartSetupDone();
    this.ready.set(false);
    this.closed.emit();
  }
}
