import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ClubStatistics, MemberCount, StatisticsPeriodCode } from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { AsyncState } from '../member/async-state';
import { IconComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import { StatisticsDataService } from './statistics-data.service';
import {
  StatisticsPeriodComponent,
  periodFromParams,
  periodLabelKey,
  periodQuery,
  share,
} from './statistics-period';

/** Anzeigedaten des Einstiegs (Antwort von `GET /api/v1/statistics`). */
export type StatisticsView = ClubStatistics;

/**
 * Statistik der Gruppe (Einstieg, Handy).
 *
 * Links zur Getränkestatistik und zur Übersicht, Zeitraum (30 Tage, 90 Tage,
 * dieses Jahr), Kennzahlen Gruppe/Du/Platz, Rangliste mit Balken (eigener
 * Eintrag hervorgehoben) und Zusagequote. Für alle Mitglieder sichtbar.
 *
 * Statistiken sind Aggregate: Sie rendern ausschließlich im Browser
 * (`isPlatformBrowser`); serverseitig erscheint nur ein neutraler Platzhalter.
 */
@Component({
  selector: 'app-statistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, RouterLink, TranslatePipe, IconComponent, StatisticsPeriodComponent],
  styleUrl: './statistics.css',
  template: `
    <main class="page-shell">
      <section class="page-card stats-card stats-stack" [attr.aria-label]="'statistics.ariaLabel' | t">
        <header>
          <p class="stats-eyebrow">{{ 'statistics.eyebrow' | t }}</p>
          <h1 class="stats-title">{{ 'statistics.title' | t }}</h1>
        </header>

        <nav class="stats-links" [attr.aria-label]="'statistics.links.label' | t">
          <a class="stats-link stats-link-primary" routerLink="/statistik/getraenke" [queryParams]="query()">
            <span>{{ 'statistics.links.drinks' | t }}</span>
            <vereint-icon name="chevron-right" />
          </a>
          <a class="stats-link" routerLink="/statistik/uebersicht" [queryParams]="query()">
            <span>{{ 'statistics.links.overview' | t }}</span>
            <vereint-icon name="chevron-right" />
          </a>
        </nav>

        <app-statistics-period [period]="period()" />

        @if (!isBrowser) {
          <div class="state-card" role="status" aria-live="polite" data-testid="ssr-placeholder">
            <strong>{{ 'statistics.ssr.title' | t }}</strong>
            <span>{{ 'statistics.ssr.message' | t }}</span>
          </div>
        } @else if (load.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'statistics.loadingMessage' | t" />
        } @else if (load.isError()) {
          <vereint-state kind="error" [title]="'statistics.unavailable' | t" [message]="load.errorMessage()" (retry)="reload()" />
        } @else if (load.data(); as view) {
          <p class="stats-intro">{{ periodLabelKey(view.period) | t: { days: view.days } }}</p>
          <div class="stats-kpis">
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.consumption.total' | t }}</p>
              <p class="stats-kpi-value">{{ view.totalItems }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.consumption.unit' | t }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.consumption.mine' | t }}</p>
              <p class="stats-kpi-value">{{ view.myItems }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.consumption.unit' | t }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.consumption.myRank' | t }}</p>
              <p class="stats-kpi-value">{{ view.myRank ?? '–' }}</p>
              <p class="stats-kpi-hint">
                {{ view.myRank !== null ? ('statistics.consumption.ofMembers' | t: { count: view.rankedMembers }) : ('statistics.consumption.noRank' | t) }}
              </p>
            </article>
          </div>

          <article class="stats-panel" [attr.aria-label]="'statistics.consumption.ariaLabel' | t">
            <h2 class="stats-panel-title">{{ 'statistics.consumption.title' | t }}</h2>
            @if (view.topConsumers.length === 0) {
              <p class="stats-empty">{{ 'statistics.consumption.empty' | t }}</p>
            } @else {
              <ol class="bar-list">
                @for (row of view.topConsumers; track row.memberId; let i = $index) {
                  <li class="bar-row" [class.bar-row-me]="isMe(i, view)" [attr.aria-current]="isMe(i, view) ? 'true' : null">
                    <span class="bar-rank">{{ i + 1 }}.</span>
                    <span class="bar-name">
                      {{ row.displayName }}
                      @if (isMe(i, view)) {
                        <span class="bar-me">{{ 'statistics.consumption.you' | t }}</span>
                      }
                    </span>
                    <span class="bar-track" aria-hidden="true">
                      <span class="bar-fill" [style.width.%]="barWidth(row, view.topConsumers)"></span>
                    </span>
                    <span class="bar-value">{{ 'statistics.consumption.count' | t: { count: row.count } }}</span>
                  </li>
                }
              </ol>
            }
          </article>

          <article class="stats-panel" [attr.aria-label]="'statistics.attendance.title' | t">
            @if (view.attendancePercent === null) {
              <h2 class="stats-panel-title">{{ 'statistics.attendance.title' | t }}</h2>
              <p class="stats-empty" data-testid="attendance-empty">{{ 'statistics.attendance.empty' | t }}</p>
            } @else {
              <div class="ring-row">
                <div class="ring" [style.--ring-value]="view.attendancePercent" role="img"
                     [attr.aria-label]="'statistics.attendance.ringLabel' | t: { percent: view.attendancePercent }">
                  <span class="ring-label">{{ view.attendancePercent }}&nbsp;%</span>
                </div>
                <div>
                  <h2 class="stats-panel-title">{{ 'statistics.attendance.title' | t }}</h2>
                  <p class="stats-note">{{ 'statistics.attendance.hint' | t }}</p>
                </div>
              </div>
            }
          </article>
        }
      </section>
    </main>
  `,
})
export class StatisticsComponent implements OnInit, OnDestroy {
  private readonly data = inject(StatisticsDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly isBrowser = isPlatformBrowser(this.platformId);
  protected readonly load = new AsyncState<StatisticsView>();
  protected readonly period = signal<StatisticsPeriodCode>('90');
  protected readonly periodLabelKey = periodLabelKey;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.period.set(periodFromParams(params));
      // Aggregate niemals serverseitig laden/rendern (kein Leak im SSR-HTML).
      if (this.isBrowser) this.reload();
    });
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.data.loadStatistics(this.period()));
  }

  protected query(): Record<string, string> {
    return periodQuery(this.period());
  }

  /** Eigene Zeile der Rangliste (Platz = Position + 1). */
  protected isMe(index: number, view: StatisticsView): boolean {
    return view.myRank !== null && view.myRank === index + 1;
  }

  protected barWidth(row: MemberCount, rows: MemberCount[]): number {
    return share(row.count, Math.max(...rows.map((entry) => entry.count), 1));
  }
}
