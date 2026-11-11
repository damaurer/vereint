import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { FeatureCount, MyStatistics, StatisticsPeriodCode } from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { AsyncState } from '../member/async-state';
import { StateComponent } from '../ui/state.component';
import { StatisticsDataService } from './statistics-data.service';
import { MY_FEATURES, StatisticsRecordingComponent, countOf } from './statistics-levels';
import { StatisticsPeriodComponent, periodFromParams, periodLabelKey, periodQuery, share } from './statistics-period';

/**
 * Eigene Statistik (`/statistik/ich`): alles, was ich ausgelöst habe, über
 * alle meine Gruppen und Events, aufgeschlüsselt nach Gruppe. Nur für mich.
 * Der Schalter „Meine Statistik erfassen“ und das Löschen liegen in Mein Konto.
 */
@Component({
  selector: 'app-my-statistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, RouterLink, TranslatePipe, StatisticsPeriodComponent, StatisticsRecordingComponent],
  styleUrl: './statistics.css',
  template: `
    <main class="page-shell">
      <section class="page-card stats-card stats-stack" [attr.aria-label]="'statistics.mine.title' | t">
        <header>
          <p class="stats-eyebrow">{{ 'statistics.mine.eyebrow' | t }}</p>
          <h1 class="stats-title">{{ 'statistics.mine.title' | t }}</h1>
          <p class="stats-note">{{ 'statistics.mine.intro' | t }}</p>
        </header>
        <nav class="stats-links" [attr.aria-label]="'statistics.links.label' | t">
          <a class="stats-link" routerLink="/statistik/events" [queryParams]="query()">
            <span>{{ 'statistics.links.crossEvents' | t }}</span>
          </a>
        </nav>
        <app-statistics-period [period]="period()" />

        @if (!isBrowser) {
          <div class="state-card" role="status" data-testid="ssr-placeholder">
            <strong>{{ 'statistics.ssr.title' | t }}</strong>
            <span>{{ 'statistics.ssr.message' | t }}</span>
          </div>
        } @else if (load.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'statistics.loadingMessage' | t" />
        } @else if (load.isError()) {
          <vereint-state kind="error" [title]="'statistics.unavailable' | t" [message]="load.errorMessage()" (retry)="reload()" />
        } @else if (load.data(); as view) {
          <app-statistics-recording [recording]="view.recording" />
          <p class="stats-intro">{{ periodLabelKey(view.period) | t: { days: view.days } }}</p>
          @if (view.total === 0) {
            <p class="stats-empty" data-testid="mine-empty">{{ 'statistics.mine.empty' | t }}</p>
          } @else {
            <div class="stats-kpis">
              <article class="stats-kpi">
                <p class="stats-kpi-label">{{ 'statistics.features.purchase' | t }}</p>
                <p class="stats-kpi-value" data-testid="mine-purchases">{{ count(view.counts, 'purchase') }}</p>
              </article>
              <article class="stats-kpi">
                <p class="stats-kpi-label">{{ 'statistics.mine.accepted' | t }}</p>
                <p class="stats-kpi-value">{{ view.accepted }}</p>
              </article>
              <article class="stats-kpi">
                <p class="stats-kpi-label">{{ 'statistics.mine.attended' | t }}</p>
                <p class="stats-kpi-value">{{ view.attended }}</p>
              </article>
            </div>

            <article class="stats-panel">
              <h2 class="stats-panel-title">{{ 'statistics.mine.byFeature' | t }}</h2>
              <ol class="bar-list">
                @for (feature of visible(view.counts); track feature) {
                  <li class="bar-row bar-row-plain">
                    <span class="bar-name">{{ 'statistics.features.' + feature | t }}</span>
                    <span class="bar-track" aria-hidden="true">
                      <span class="bar-fill bar-fill-brand" [style.width.%]="width(count(view.counts, feature), view.counts)"></span>
                    </span>
                    <span class="bar-value">{{ count(view.counts, feature) }}</span>
                  </li>
                }
              </ol>
            </article>

            <article class="stats-panel">
              <h2 class="stats-panel-title">{{ 'statistics.mine.byGroup' | t }}</h2>
              <ol class="bar-list">
                @for (group of view.groups; track group.stammtischId) {
                  <li class="bar-row bar-row-plain" data-testid="mine-group">
                    <span class="bar-name">{{ group.stammtischName }}</span>
                    <span class="bar-track" aria-hidden="true">
                      <span class="bar-fill" [style.width.%]="groupWidth(group.total, view)"></span>
                    </span>
                    <span class="bar-value">
                      {{ group.total }}
                      @if (!group.groupEnabled) {
                        · {{ 'statistics.mine.groupOff' | t }}
                      }
                    </span>
                  </li>
                }
              </ol>
            </article>
          }
        }
      </section>
    </main>
  `,
})
export class MyStatisticsComponent implements OnInit, OnDestroy {
  private readonly data = inject(StatisticsDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly load = new AsyncState<MyStatistics>();
  protected readonly period = signal<StatisticsPeriodCode>('90');
  protected readonly periodLabelKey = periodLabelKey;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.period.set(periodFromParams(params));
      if (this.isBrowser) this.reload();
    });
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.data.loadMine(this.period()));
  }

  protected query(): Record<string, string> {
    return periodQuery(this.period());
  }

  protected count(counts: FeatureCount[], feature: FeatureCount['feature']): number {
    return countOf(counts, feature);
  }

  protected visible(counts: FeatureCount[]): FeatureCount['feature'][] {
    return MY_FEATURES.filter((feature) => countOf(counts, feature) > 0);
  }

  protected width(value: number, counts: FeatureCount[]): number {
    return share(value, Math.max(1, ...counts.map((entry) => entry.count)));
  }

  protected groupWidth(value: number, view: MyStatistics): number {
    return share(value, Math.max(1, ...view.groups.map((group) => group.total)));
  }
}
