import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { describeApiError } from '../api/api-client.service';
import { TranslatePipe, translate } from '../i18n';
import { StatisticsDataService } from './statistics-data.service';

/**
 * Schalter und Löschen der Statistik.
 *
 * - `scope = 'mine'` (Mein Konto): „Meine Statistik erfassen“ und „Meine
 *   erfassten Statistikdaten löschen“.
 * - `scope = 'group'` (Gruppeneinstellungen, nur mit `stammtisch.manage`):
 *   „Statistik in dieser Gruppe“ und „Statistikdaten der Gruppe löschen“.
 *
 * Ausschalten wirkt ab sofort und löscht nichts. Löschen verlangt eine
 * Bestätigung im zweiten Schritt.
 */
@Component({
  selector: 'app-statistics-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  styleUrl: './statistics.css',
  template: `
    <section class="stats-stack" [attr.aria-labelledby]="'stats-settings-' + scope()">
      <h2 class="member-subtitle" [id]="'stats-settings-' + scope()">{{ 'statistics.settings.' + scope() + '.title' | t }}</h2>
      <label class="stats-switch">
        <span>
          <strong>{{ 'statistics.settings.' + scope() + '.switch' | t }}</strong><br />
          <span class="stats-note">{{ 'statistics.settings.' + scope() + '.hint' | t }}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          data-testid="statistics-switch"
          [checked]="enabled()"
          [disabled]="busy() || !loaded()"
          (change)="toggle($any($event.target).checked)"
        />
      </label>
      @if (scope() === 'mine') {
        <a class="stats-link" routerLink="/statistik/ich">{{ 'statistics.links.mine' | t }}</a>
      }
      <div class="stats-actions">
        @if (!confirming()) {
          <button type="button" class="member-button member-button-ghost" data-testid="statistics-delete" [disabled]="busy()" (click)="confirming.set(true)">
            {{ 'statistics.settings.' + scope() + '.delete' | t }}
          </button>
        } @else {
          <p class="stats-note" role="alert">{{ 'statistics.settings.' + scope() + '.confirm' | t }}</p>
          <button type="button" class="member-button" data-testid="statistics-delete-confirm" [disabled]="busy()" (click)="remove()">
            {{ 'statistics.settings.confirmDelete' | t }}
          </button>
          <button type="button" class="member-button member-button-ghost" (click)="confirming.set(false)">
            {{ 'common.cancel' | t }}
          </button>
        }
      </div>
      @if (message(); as text) {
        <p class="stats-note" role="status" data-testid="statistics-message">{{ text }}</p>
      }
    </section>
  `,
})
export class StatisticsSettingsComponent implements OnInit {
  readonly scope = input<'mine' | 'group'>('mine');
  private readonly data = inject(StatisticsDataService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly enabled = signal(true);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly message = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.isBrowser) return;
    const load = this.scope() === 'group' ? this.data.loadGroupSettings() : this.data.loadMySettings();
    load.subscribe({
      next: (settings) => {
        this.enabled.set(settings.enabled);
        this.loaded.set(true);
      },
      error: (error: unknown) => this.message.set(describeApiError(error)),
    });
  }

  protected toggle(enabled: boolean): void {
    this.busy.set(true);
    const save = this.scope() === 'group' ? this.data.saveGroupSettings(enabled) : this.data.saveMySettings(enabled);
    save.subscribe({
      next: (settings) => {
        this.enabled.set(settings.enabled);
        this.busy.set(false);
        this.message.set(null);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.message.set(describeApiError(error));
      },
    });
  }

  protected remove(): void {
    this.busy.set(true);
    const remove = this.scope() === 'group' ? this.data.deleteGroup() : this.data.deleteMine();
    remove.subscribe({
      next: (result) => {
        this.busy.set(false);
        this.confirming.set(false);
        this.message.set(this.deletedText(result.deleted));
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.message.set(describeApiError(error));
      },
    });
  }

  private deletedText(count: number): string {
    return translate('statistics.settings.deleted', { count });
  }
}
