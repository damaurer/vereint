import { Component, input } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import type { MomentResponseDto } from '../api/api.types';
import { formatDateTime } from '../member/member-format';
import { AvatarBadgeComponent } from '../ui';

/**
 * Visualisiert den chronologischen Feed aller Status- und Reaktionsbeiträge
 * eines Gemeinschaftsmoments (Moments & Rituale).
 *
 * Unterstützt beliebig viele Status-Updates pro Teilnehmer während der Session.
 */
@Component({
  selector: 'app-moment-timeline',
  imports: [IconComponent, AvatarBadgeComponent],
  template: `
    <section class="moment-timeline" aria-label="Status-Timeline">
      <div class="timeline-header">
        <h3 class="timeline-title">Status-Timeline</h3>
        <span class="timeline-count">{{ responses().length }} Beiträge</span>
      </div>

      @if (responses().length === 0) {
        <div class="timeline-empty" role="status">
          <vereint-icon class="timeline-empty-icon" name="chat" />
          <p>Noch keine Statusbeiträge geteilt. Sei der Erste und teile deine Reaktion!</p>
        </div>
      } @else {
        <ol class="timeline-list">
          @for (response of sortedResponses(); track response.id) {
            <li class="timeline-item">
              <div class="timeline-avatar">
                <vereint-avatar-badge [name]="response.userName" />
              </div>

              <div class="timeline-body">
                <div class="timeline-item-head">
                  <span class="timeline-user">{{ response.userName }}</span>
                  <span class="timeline-reaction-badge" [attr.aria-label]="response.reaction">
                    {{ reactionLabel(response.reaction) }}
                  </span>
                  <time class="timeline-time">{{ formatTime(response.createdAt) }}</time>
                </div>

                @if (response.statusText) {
                  <p class="timeline-text">{{ response.statusText }}</p>
                }

                @if (response.latitude !== null && response.longitude !== null) {
                  <div class="timeline-location">
                    <vereint-icon class="location-icon" name="location" />
                    <span class="location-coords">
                      Standort geteilt ({{ formatCoord(response.latitude) }}, {{ formatCoord(response.longitude) }})
                    </span>
                  </div>
                }
              </div>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [
    `
      .moment-timeline {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .timeline-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
        border-bottom: 1px solid var(--color-border);
        padding-bottom: var(--space-2);
      }
      .timeline-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .timeline-count {
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }
      .timeline-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem 1rem;
        text-align: center;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px dashed var(--color-border);
        gap: 0.5rem;
      }
      .timeline-empty-icon {
        font-size: 2rem;
      }
      .timeline-empty p {
        margin: 0;
        font-size: 0.9rem;
        color: var(--color-text-muted);
      }
      .timeline-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        position: relative;
      }
      .timeline-item {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.75rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
        transition: border-color 0.2s ease;
      }
      .timeline-item:hover {
        border-color: var(--color-brand);
      }
      .timeline-avatar {
        flex: none;
        margin-top: 0.1rem;
      }
      .timeline-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .timeline-item-head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .timeline-user {
        font-weight: 700;
        font-size: 0.95rem;
        color: var(--color-text);
      }
      .timeline-reaction-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        background-color: var(--color-brand-soft);
        color: var(--color-brand-strong);
        border: 1px solid var(--color-brand);
      }
      .timeline-time {
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--color-text-muted);
        white-space: nowrap;
      }
      .timeline-text {
        margin: 0;
        font-size: 0.9rem;
        line-height: 1.45;
        color: var(--color-text);
        overflow-wrap: anywhere;
      }
      .timeline-location {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.75rem;
        color: var(--color-text-muted);
        margin-top: 0.2rem;
      }
      .location-icon {
        font-size: 0.85rem;
      }
      .location-coords {
        font-family: monospace;
      }
    `,
  ],
})
export class MomentTimelineComponent {
  readonly responses = input<MomentResponseDto[]>([]);

  /** Sortiert Statusbeiträge chronologisch (neueste oben). */
  protected sortedResponses(): MomentResponseDto[] {
    return [...this.responses()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  protected formatTime(isoDate: string): string {
    return formatDateTime(isoDate);
  }

  protected formatCoord(val: number | null): string {
    if (val === null || val === undefined) return '';
    return val.toFixed(2) + '°';
  }

  protected reactionLabel(reaction: string): string {
    const r = reaction.toUpperCase();
    switch (r) {
      case 'TOAST':
      case 'CHEERS':
        return '🍻 Anstoßen';
      case 'PRAYER':
        return '🙏 Gebet';
      case 'CHEER':
        return '📣 Jubeln';
      case 'THUMBS_UP':
        return '👍 Daumen hoch';
      case 'CELEBRATE':
        return '🎉 Feiern';
      case 'HEART':
        return '❤️ Herz';
      case 'CHECKIN':
        return '📍 Check-in';
      default:
        return reaction;
    }
  }
}
