import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EventComparison, FeatureCount, StatisticsRecording } from '../api/api.types';
import { TranslatePipe, activeLocale, translate } from '../i18n';
import { share } from './statistics-period';

/** Antworten auf Einladungen als gestapelter Balken (nur Tokens aus `styles.css`). */
export const RSVP_SEGMENTS: readonly { key: 'accepted' | 'maybe' | 'declined' | 'noAnswer'; color: string }[] = [
  { key: 'accepted', color: 'var(--color-success)' },
  { key: 'maybe', color: 'var(--color-warning)' },
  { key: 'declined', color: 'var(--color-danger)' },
  { key: 'noAnswer', color: 'var(--color-border-dark)' },
];

/** Reihenfolge der Funktionen auf der eigenen Statistik. */
export const MY_FEATURES: readonly FeatureCount['feature'][] = [
  'purchase',
  'foreign_drink',
  'round',
  'rsvp',
  'event',
  'moment',
  'moment_reaction',
  'moment_media',
  'chat_message',
  'chat_reaction',
  'top_up',
  'invite_link',
  'invite_join',
];

export function countOf(counts: FeatureCount[], feature: FeatureCount['feature']): number {
  return counts.find((entry) => entry.feature === feature)?.count ?? 0;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(activeLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function rsvpLabel(row: Pick<EventComparison, 'accepted' | 'maybe' | 'declined' | 'noAnswer'>): string {
  return RSVP_SEGMENTS.map((part) => `${translate('statistics.overview.rsvp.' + part.key)}: ${row[part.key]}`).join(', ');
}

/**
 * Hinweis, wenn die Erfassung ausgeschaltet ist (Nutzer, Gruppe oder Event).
 * Seiten zeigen ihn statt leerer Diagramme.
 */
@Component({
  selector: 'app-statistics-recording',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  styleUrl: './statistics.css',
  template: `
    @if (recording(); as state) {
      @if (state.groupEnabled === false) {
        <p class="state-card" role="status" data-testid="recording-group-off">
          <strong>{{ 'statistics.recording.groupOff' | t }}</strong>
          <span>{{ 'statistics.recording.groupOffHint' | t }}</span>
        </p>
      }
      @if (state.eventEnabled === false) {
        <p class="state-card" role="status" data-testid="recording-event-off">
          <strong>{{ 'statistics.recording.eventOff' | t }}</strong>
          <span>{{ 'statistics.recording.eventOffHint' | t }}</span>
        </p>
      }
      @if (!state.userEnabled) {
        <p class="state-card" role="status" data-testid="recording-user-off">
          <strong>{{ 'statistics.recording.userOff' | t }}</strong>
          <span>
            {{ 'statistics.recording.userOffHint' | t }}
            <a routerLink="/profile">{{ 'statistics.recording.toAccount' | t }}</a>
          </span>
        </p>
      }
    }
  `,
  host: { style: 'display: contents' },
})
export class StatisticsRecordingComponent {
  readonly recording = input<StatisticsRecording | null | undefined>(null);
}

/**
 * Events im Vergleich: Antworten als gestapelter Balken, Teilnehmende,
 * Striche (Balken relativ zum stärksten Event), Moments und Chat. Mit
 * `crossGroup` zusätzlich Gruppe und eigene Werte; Namen anderer Personen
 * kommen in diesen Daten nicht vor.
 */
@Component({
  selector: 'app-event-comparison',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  styleUrl: './statistics.css',
  template: `
    <ul class="stats-legend">
      @for (part of segments; track part.key) {
        <li><span class="stats-legend-dot" [style.background]="part.color"></span>{{ 'statistics.overview.rsvp.' + part.key | t }}</li>
      }
    </ul>
    @if (rows().length === 0) {
      <p class="stats-empty" data-testid="events-empty">{{ 'statistics.events.empty' | t }}</p>
    }
    <ol class="bar-list compare-list">
      @for (row of rows(); track row.eventId) {
        <li class="compare-row" data-testid="event-row">
          <div class="compare-head">
            @if (crossGroup()) {
              <strong class="bar-name">{{ row.title }}</strong>
            } @else {
              <a class="bar-name" [routerLink]="['/events', row.eventId, 'statistik']">{{ row.title }}</a>
            }
            <span class="stats-note">
              {{ date(row.startsAt) }}
              @if (crossGroup() && row.stammtischName) {
                · {{ row.stammtischName }}
              }
              @if (!row.statisticsEnabled) {
                · {{ 'statistics.events.off' | t }}
              }
            </span>
          </div>
          <span class="bar-track" role="img" [attr.aria-label]="label(row)">
            @for (part of segments; track part.key) {
              <span class="bar-segment" [style.width.%]="(row[part.key] / (row.invited || 1)) * 100" [style.background]="part.color"></span>
            }
          </span>
          <div class="bar-row bar-row-plain">
            <span class="bar-name">{{ 'statistics.events.purchases' | t }}</span>
            <span class="bar-track" aria-hidden="true"><span class="bar-fill bar-fill-brand" [style.width.%]="width(row)"></span></span>
            <span class="bar-value">{{ row.purchases }}</span>
          </div>
          <dl class="stats-kv compare-kv">
            <dt>{{ 'statistics.events.attendees' | t }}</dt><dd>{{ row.attendees }}</dd>
            <dt>{{ 'statistics.events.moments' | t }}</dt><dd>{{ row.moments }}</dd>
            <dt>{{ 'statistics.events.chat' | t }}</dt><dd>{{ row.chatMessages }}</dd>
            @if (crossGroup()) {
              <dt>{{ 'statistics.events.mine' | t }}</dt><dd>{{ row.myPurchases ?? 0 }}</dd>
              <dt>{{ 'statistics.events.myAnswer' | t }}</dt>
              <dd>{{ row.myRsvp ? ('statistics.events.answer.' + row.myRsvp | t) : '–' }}</dd>
            }
          </dl>
        </li>
      }
    </ol>
  `,
})
export class EventComparisonComponent {
  readonly rows = input<EventComparison[]>([]);
  readonly crossGroup = input(false);
  protected readonly segments = RSVP_SEGMENTS;
  private readonly max = computed(() => Math.max(1, ...this.rows().map((row) => row.purchases)));

  protected width(row: EventComparison): number {
    return share(row.purchases, this.max());
  }

  protected date(value: string): string {
    return formatDate(value);
  }

  protected label(row: EventComparison): string {
    return rsvpLabel(row);
  }
}
