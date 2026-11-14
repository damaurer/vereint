import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { describeApiError } from '../api/api-client.service';
import { TranslatePipe, translate } from '../i18n';
import { KioskApiService, type KioskSession } from '../kiosk/kiosk-api.service';
import { formatDateTime } from '../member/member-format';
import { ModalComponent } from '../ui';
import { StateComponent } from '../ui/state.component';

/**
 * „Kiosk-Geräte“ für Vorstand und Administration: zeigt alle Geräte, auf denen
 * der Kiosk-Modus gerade läuft, und entsperrt jedes davon aus der Ferne, ohne
 * die PIN des Geräts zu kennen. Das Gerät bemerkt das beim nächsten Abgleich
 * und verlässt den Modus.
 */
@Component({
  selector: 'app-board-kiosk-devices-modal',
  imports: [ModalComponent, StateComponent, TranslatePipe],
  template: `
    <vereint-modal [open]="open" [title]="'board.kioskDevices.title' | t" (closed)="closed.emit()">
      <p class="member-hint">{{ 'board.kioskDevices.intro' | t }}</p>

      @if (info(); as message) {
        <p class="manage-action-info" role="status">{{ message }}</p>
      }
      @if (error(); as message) {
        <p class="manage-action-error" role="alert">{{ message }}</p>
      }

      @if (loading()) {
        <vereint-state kind="loading" [title]="'common.loading' | t" />
      } @else if (sessions().length === 0) {
        <vereint-state
          kind="empty"
          [title]="'board.kioskDevices.emptyTitle' | t"
          [message]="'board.kioskDevices.emptyMessage' | t"
        />
      } @else {
        <ul class="member-list">
          @for (session of sessions(); track session.id) {
            <li class="member-list-item kiosk-device-row">
              <span class="kiosk-device-meta">
                <span class="member-list-title">{{ session.label }}</span>
                <span class="member-list-meta">
                  {{
                    'board.kioskDevices.since'
                      | t: { name: session.startedByName ?? '', date: formatDateTime(session.startedAt) }
                  }}
                </span>
                @if (session.lockedUntil) {
                  <span class="member-list-meta">
                    {{ 'board.kioskDevices.lockedUntil' | t: { date: formatDateTime(session.lockedUntil) } }}
                  </span>
                }
              </span>
              <button type="button" class="member-button" [disabled]="busy()" (click)="end(session)">
                {{ 'board.kioskDevices.unlock' | t }}
              </button>
            </li>
          }
        </ul>
      }
    </vereint-modal>
  `,
  styles: [
    `
      .kiosk-device-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .kiosk-device-meta {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
      }
    `,
  ],
})
export class KioskDevicesModalComponent implements OnChanges {
  private readonly api = inject(KioskApiService);

  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  protected readonly formatDateTime = formatDateTime;
  protected readonly sessions = signal<KioskSession[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.error.set(null);
      this.info.set(null);
      this.load();
    }
  }

  protected end(session: KioskSession): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    this.api.endRemotely(session.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.sessions.update((list) => list.filter((item) => item.id !== session.id));
        this.info.set(translate('board.kioskDevices.unlocked', { label: session.label }));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(describeApiError(err));
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.listActive().subscribe({
      next: (list) => {
        this.loading.set(false);
        this.sessions.set(list);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.sessions.set([]);
        this.error.set(describeApiError(err));
      },
    });
  }
}
