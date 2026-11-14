import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import type { EventStatistics, FeatureStat, FeatureStatistics, StatisticsPeriodCode } from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { AsyncState } from '../member/async-state';
import { StateComponent } from '../ui/state.component';
import { StatisticsDataService } from './statistics-data.service';
import { RSVP_SEGMENTS, StatisticsRecordingComponent, rsvpLabel } from './statistics-levels';
import { StatisticsPeriodComponent, periodFromParams, periodLabelKey, share } from './statistics-period';

/**
 * Funktions-Statistik (`/statistik/funktionen`): je Funktion der Gruppe, wie
 * oft sie ausgelöst und wie darauf geantwortet wurde.
 */
@Component({
  selector: 'app-feature-statistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, TranslatePipe, StatisticsPeriodComponent, StatisticsRecordingComponent],
  styleUrl: './statistics.css',
  template: `
    <main class="page-shell">
      <section class="page-card stats-card stats-stack" [attr.aria-label]="'statistics.featureStats.title' | t">
        <header>
          <p class="stats-eyebrow">{{ 'statistics.eyebrow' | t }}</p>
          <h1 class="stats-title">{{ 'statistics.featureStats.title' | t }}</h1>
          <p class="stats-note">{{ 'statistics.featureStats.intro' | t }}</p>
        </header>
        <app-statistics-period [period]="period()" />
        @if (!isBrowser) {
          <div class="state-card" role="status" data-testid="ssr-placeholder">
            <strong>{{ 'statistics.ssr.title' | t }}</strong>
          </div>
        } @else if (load.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'statistics.loadingMessage' | t" />
        } @else if (load.isError()) {
          <vereint-state kind="error" [title]="'statistics.unavailable' | t" [message]="load.errorMessage()" (retry)="reload()" />
        } @else if (load.data(); as view) {
          <app-statistics-recording [recording]="view.recording" />
          @if (view.recording.groupEnabled !== false || total(view) > 0) {
            <p class="stats-intro">{{ periodLabelKey(view.period) | t: { days: view.days } }}</p>
            <div class="stats-grid-2">
              @for (feature of view.features; track feature.feature) {
                <article class="stats-panel feature-card" data-testid="feature-card">
                  <h2 class="stats-panel-title">{{ 'statistics.features.' + feature.feature | t }}</h2>
                  <p class="feature-numbers">
                    <span><strong>{{ feature.triggered }}</strong> {{ 'statistics.featureStats.triggered' | t }}</span>
                    @if (feature.responseFeature) {
                      <span>
                        <strong>{{ feature.responses }}</strong>
                        {{ 'statistics.featureStats.response.' + feature.responseFeature | t }}
                      </span>
                    }
                  </p>
                  @if (feature.breakdown.length > 0) {
                    <ol class="bar-list">
                      @for (part of feature.breakdown; track part.key) {
                        <li class="bar-row bar-row-plain">
                          <span class="bar-name">{{ 'statistics.featureStats.variant.' + part.key | t }}</span>
                          <span class="bar-track" aria-hidden="true">
                            <span class="bar-fill bar-fill-brand" [style.width.%]="width(part.count, feature)"></span>
                          </span>
                          <span class="bar-value">{{ part.count }}</span>
                        </li>
                      }
                    </ol>
                  }
                </article>
              }
            </div>
          }
        }
      </section>
    </main>
  `,
})
export class FeatureStatisticsComponent implements OnInit, OnDestroy {
  private readonly data = inject(StatisticsDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly load = new AsyncState<FeatureStatistics>();
  protected readonly period = signal<StatisticsPeriodCode>('90');
  protected readonly periodLabelKey = periodLabelKey;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params: ParamMap) => {
      this.period.set(periodFromParams(params));
      if (this.isBrowser) this.reload();
    });
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.data.loadFeatures(this.period()));
  }

  protected total(view: FeatureStatistics): number {
    return view.features.reduce((sum, feature) => sum + feature.triggered + feature.responses, 0);
  }

  protected width(value: number, feature: FeatureStat): number {
    return share(value, Math.max(1, ...feature.breakdown.map((part) => part.count)));
  }
}

/**
 * Event-Statistik (`/events/:eventId/statistik`): Antworten, Anwesende,
 * Striche/Käufe, Runden, Moments, Reaktionen und Event-Chat. Nur, wer das
 * Event sehen darf (prüft der Fachservice).
 */
@Component({
  selector: 'app-event-statistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, RouterLink, TranslatePipe, StatisticsRecordingComponent],
  styleUrl: './statistics.css',
  template: `
    <main class="page-shell">
      <section class="page-card stats-card stats-stack" [attr.aria-label]="'statistics.eventStats.title' | t">
        @if (!isBrowser) {
          <div class="state-card" role="status" data-testid="ssr-placeholder">
            <strong>{{ 'statistics.ssr.title' | t }}</strong>
          </div>
        } @else if (load.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'statistics.loadingMessage' | t" />
        } @else if (load.isError()) {
          <vereint-state kind="error" [title]="'statistics.unavailable' | t" [message]="load.errorMessage()" (retry)="reload()" />
        } @else if (load.data(); as view) {
          <header>
            <p class="stats-eyebrow">{{ 'statistics.eventStats.title' | t }}</p>
            <h1 class="stats-title">{{ view.title }}</h1>
            <a class="stats-note" [routerLink]="['/events', view.eventId]">{{ 'statistics.eventStats.back' | t }}</a>
          </header>
          <app-statistics-recording [recording]="view.recording" />

          <article class="stats-panel">
            <h2 class="stats-panel-title">{{ 'statistics.eventStats.answers' | t }}</h2>
            <ul class="stats-legend">
              @for (part of segments; track part.key) {
                <li>
                  <span class="stats-legend-dot" [style.background]="part.color"></span>
                  {{ 'statistics.overview.rsvp.' + part.key | t }}: {{ view[part.key] }}
                </li>
              }
            </ul>
            <span class="bar-track" role="img" [attr.aria-label]="label(view)">
              @for (part of segments; track part.key) {
                <span class="bar-segment" [style.width.%]="(view[part.key] / (view.invited || 1)) * 100" [style.background]="part.color"></span>
              }
            </span>
          </article>

          <div class="stats-kpis stats-kpis-wide">
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.events.attendees' | t }}</p>
              <p class="stats-kpi-value" data-testid="event-attendees">{{ view.attendees }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.events.purchases' | t }}</p>
              <p class="stats-kpi-value" data-testid="event-purchases">{{ view.purchases }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.features.round' | t }}</p>
              <p class="stats-kpi-value">{{ view.rounds }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.events.moments' | t }}</p>
              <p class="stats-kpi-value">{{ view.moments }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.eventStats.reactions' | t: { reactions: view.reactions, media: view.media } }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.events.chat' | t }}</p>
              <p class="stats-kpi-value">{{ view.chatMessages }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.eventStats.chatReactions' | t: { count: view.chatReactions } }}</p>
            </article>
          </div>

          <article class="stats-panel">
            <h2 class="stats-panel-title">{{ 'statistics.eventStats.consumers' | t }}</h2>
            @if (view.topConsumers.length === 0) {
              <p class="stats-empty">{{ 'statistics.consumption.empty' | t }}</p>
            } @else {
              <ol class="bar-list">
                @for (row of view.topConsumers; track row.memberId; let i = $index) {
                  <li class="bar-row">
                    <span class="bar-rank">{{ i + 1 }}.</span>
                    <span class="bar-name">{{ row.displayName }}</span>
                    <span class="bar-track" aria-hidden="true">
                      <span class="bar-fill bar-fill-brand" [style.width.%]="consumerWidth(row.count, view)"></span>
                    </span>
                    <span class="bar-value">{{ row.count }}</span>
                  </li>
                }
              </ol>
            }
          </article>
        }
      </section>
    </main>
  `,
})
export class EventStatisticsComponent implements OnInit, OnDestroy {
  private readonly data = inject(StatisticsDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly load = new AsyncState<EventStatistics>();
  protected readonly segments = RSVP_SEGMENTS;
  private eventId = '';

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.eventId = params.get('eventId') ?? '';
      if (this.isBrowser) this.reload();
    });
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.data.loadEvent(this.eventId));
  }

  protected label(view: EventStatistics): string {
    return rsvpLabel(view);
  }

  protected consumerWidth(value: number, view: EventStatistics): number {
    return share(value, Math.max(1, ...view.topConsumers.map((row) => row.count)));
  }
}
