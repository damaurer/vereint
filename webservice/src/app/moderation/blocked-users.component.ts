import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { BlockedUser } from '../api/api.types';
import { describeApiError } from '../api/api-client.service';
import { TranslatePipe } from '../i18n';
import { formatDateTime } from '../member/member-format';
import { ModerationApiService } from './moderation-api.service';

/**
 * „Blockierte Personen“ im Profil (#153): Liste mit „Aufheben“.
 * Blockiert wird im Chat oder bei Moments über „Melden oder blockieren“.
 */
@Component({
  selector: 'app-blocked-users',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="member-subtitle">{{ 'moderation.blocked.title' | t }}</h2>
    <p class="member-hint">{{ 'moderation.blocked.hint' | t }}</p>
    @if (blocked(); as list) {
      @if (list.length === 0) {
        <p class="member-hint">{{ 'moderation.blocked.empty' | t }}</p>
      } @else {
        <ul class="blocked-list">
          @for (entry of list; track entry.userId) {
            <li class="blocked-item">
              <span>
                <strong>{{ entry.displayName }}</strong>
                <small class="member-hint">{{
                  'moderation.blocked.since' | t: { date: format(entry.since) }
                }}</small>
              </span>
              <button
                type="button"
                class="member-button member-button-ghost"
                [disabled]="busy() === entry.userId"
                (click)="unblock(entry)"
              >
                {{ 'moderation.blocked.unblock' | t }}
              </button>
            </li>
          }
        </ul>
      }
    }
    @if (error(); as message) {
      <p class="member-hint member-hint-error" role="alert">{{ message }}</p>
    }
  `,
  styles: [
    `
      .blocked-list {
        list-style: none;
        margin: 0 0 var(--space-3);
        padding: 0;
        display: grid;
        gap: var(--space-2);
      }
      .blocked-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .blocked-item span {
        display: grid;
      }
    `,
  ],
})
export class BlockedUsersComponent implements OnInit {
  private readonly api = inject(ModerationApiService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly blocked = signal<BlockedUser[] | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.api.blocks().subscribe({
      next: (list) => this.blocked.set(list),
      error: (error: unknown) => this.error.set(describeApiError(error)),
    });
  }

  protected format(iso: string): string {
    return formatDateTime(iso);
  }

  protected unblock(entry: BlockedUser): void {
    this.busy.set(entry.userId);
    this.error.set(null);
    this.api.unblock(entry.userId).subscribe({
      next: () => {
        this.busy.set(null);
        this.blocked.update((list) => (list ?? []).filter((item) => item.userId !== entry.userId));
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.error.set(describeApiError(error));
      },
    });
  }
}
