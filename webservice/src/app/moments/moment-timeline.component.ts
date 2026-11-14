import { Component, input, output } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import type { MomentMediaDto, MomentResponseDto } from '../api/api.types';
import { formatDateTime } from '../member/member-format';
import { AvatarBadgeComponent } from '../ui';
import { TranslatePipe } from '../i18n';

/**
 * Visualisiert den chronologischen Feed aller Status- und Reaktionsbeiträge
 * eines Gemeinschaftsmoments (Moments & Rituale).
 *
 * Unterstützt beliebig viele Status-Updates pro Teilnehmer während der Session.
 */
@Component({
  selector: 'app-moment-timeline',
  imports: [IconComponent, AvatarBadgeComponent, TranslatePipe],
  template: `
    <section class="moment-timeline" [attr.aria-label]="'moments.timeline.title' | t">
      <div class="timeline-header">
        <h3 class="timeline-title">{{ 'moments.timeline.title' | t }}</h3>
        <span class="timeline-count">{{ 'moments.timeline.count' | t: { count: responses().length } }}</span>
      </div>

      @if (responses().length === 0) {
        <div class="timeline-empty" role="status">
          <vereint-icon class="timeline-empty-icon" name="chat" />
          <p>{{ 'moments.timeline.empty' | t }}</p>
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
                  @if (response.reaction) {
                    <span class="timeline-reaction-badge">
                      {{ reactionLabel(response) }}
                    </span>
                  }
                  <time class="timeline-time">{{ formatTime(response.createdAt) }}</time>
                </div>

                @if (response.statusText) {
                  <p class="timeline-text">{{ response.statusText }}</p>
                }

                @if (response.media?.length) {
                  <div class="timeline-media" [class.single]="response.media.length === 1">
                    @for (media of response.media; track media.id) {
                      <figure class="media-tile">
                        @if (media.kind === 'video') {
                          <video
                            class="media-video"
                            [src]="videoSrc(media)"
                            controls
                            playsinline
                            preload="metadata"
                            [attr.aria-label]="'moments.media.videoBy' | t: { name: response.userName }"
                          ></video>
                        } @else {
                          <a [href]="media.url" target="_blank" rel="noopener" class="media-image-link">
                            <img
                              class="media-image"
                              [src]="media.url"
                              loading="lazy"
                              [attr.width]="media.width"
                              [attr.height]="media.height"
                              [alt]="'moments.media.photoBy' | t: { name: response.userName }"
                            />
                          </a>
                        }
                        @if (media.canDelete) {
                          <button
                            type="button"
                            class="media-remove"
                            [attr.aria-label]="'moments.media.remove' | t"
                            [title]="'moments.media.remove' | t"
                            (click)="removeMedia.emit(media)"
                          >
                            <vereint-icon name="close" />
                          </button>
                        }
                      </figure>
                    }
                  </div>
                }

                @if (response.latitude !== null && response.longitude !== null) {
                  <div class="timeline-location">
                    <vereint-icon class="location-icon" name="location" />
                    <span class="location-coords">
                      {{ 'moments.timeline.locationShared' | t: coords(response) }}
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
      .timeline-media {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.4rem;
        margin-top: 0.25rem;
      }
      .timeline-media.single {
        grid-template-columns: minmax(0, 1fr);
        max-width: 26rem;
      }
      .media-tile {
        position: relative;
        margin: 0;
        border-radius: var(--radius-md);
        overflow: hidden;
        background-color: var(--color-surface);
        border: 1px solid var(--color-border);
      }
      .media-image-link {
        display: block;
      }
      .media-image,
      .media-video {
        display: block;
        width: 100%;
        height: auto;
        max-height: 22rem;
        object-fit: cover;
        background-color: #000;
      }
      .media-video {
        object-fit: contain;
      }
      .media-remove {
        position: absolute;
        top: 0.35rem;
        right: 0.35rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        border: none;
        background-color: rgba(0, 0, 0, 0.6);
        color: #fff;
        cursor: pointer;
      }
    `,
  ],
})
export class MomentTimelineComponent {
  readonly responses = input<MomentResponseDto[]>([]);
  /** Ein Bild/Video soll entfernt werden (Eigentümer, Event-Owner, Vorstand/Admin). */
  readonly removeMedia = output<MomentMediaDto>();

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

  /** Platzhalter für „Standort geteilt (…)“. */
  protected coords(response: MomentResponseDto): { lat: string; lng: string } {
    return { lat: this.formatCoord(response.latitude), lng: this.formatCoord(response.longitude) };
  }

  protected reactionLabel(response: MomentResponseDto): string {
    const name = response.reactionName ?? response.reaction ?? '';
    return response.reactionEmoji ? `${response.reactionEmoji} ${name}` : name;
  }

  /** Mit `#t=0.1` zeigen auch iOS-Browser das erste Bild als Vorschau. */
  protected videoSrc(media: MomentMediaDto): string {
    return `${media.url}#t=0.1`;
  }
}
