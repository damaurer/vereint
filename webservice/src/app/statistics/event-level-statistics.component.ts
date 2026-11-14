import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Directive, OnDestroy, OnInit, PLATFORM_ID, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type { CrossEventStatistics, EventTotals, GroupEventStatistics, StatisticsPeriodCode } from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { AsyncState } from '../member/async-state';
import { StateComponent } from '../ui/state.component';
import { StatisticsDataService } from './statistics-data.service';
import { EventComparisonComponent, StatisticsRecordingComponent } from './statistics-levels';
import { StatisticsPeriodComponent, formatNumber, periodFromParams, periodLabelKey } from './statistics-period';

/** Kennzahlen über alle Events im Zeitraum. */
@Component({
  selector: 'app-event-totals',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  styleUrl: './statistics.css',
  template: `
    @if (totals(); as t) {
      <div class="stats-kpis">
        <article class="stats-kpi">
          <p class="stats-kpi-label">{{ 'statistics.events.count' | t }}</p>
          <p class="stats-kpi-value" data-testid="totals-events">{{ t.events }}</p>
        </article>
        <article class="stats-kpi">
          <p class="stats-kpi-label">{{ 'statistics.events.attendances' | t }}</p>
          <p class="stats-kpi-value">{{ t.attendances }}</p>
          <p class="stats-kpi-hint">{{ 'statistics.events.perEvent' | t: { value: fmt(t.avgAttendees) } }}</p>
        </article>
        <article class="stats-kpi">
          <p class="stats-kpi-label">{{ 'statistics.attendance.title' | t }}</p>
          <p class="stats-kpi-value">{{ t.attendancePercent === null ? '–' : t.attendancePercent + ' %' }}</p>
        </article>
        <article class="stats-kpi">
          <p class="stats-kpi-label">{{ 'statistics.events.purchases' | t }}</p>
          <p class="stats-kpi-value">{{ t.purchases }}</p>
          <p class="stats-kpi-hint">{{ 'statistics.events.perEvent' | t: { value: fmt(t.purchasesPerEvent) } }}</p>
        </article>
      </div>
    }
  `,
  host: { style: 'display: block' },
})
export class EventTotalsComponent {
  readonly totals = input<EventTotals | null>(null);
  protected fmt(value: number | null): string {
    return value === null ? '–' : formatNumber(value, 1);
  }
}

/** Gemeinsame Grundlage der Seiten mit Zeitraum (`?zeitraum=30|90|jahr`). */
@Directive()
abstract class PeriodPage<T> implements OnInit, OnDestroy {
  protected readonly data = inject(StatisticsDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly load = new AsyncState<T>();
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

  protected abstract reload(): void;
}

/**
 * Übergreifende Event-Statistik (`/statistik/events`): alle Events aus allen
 * eigenen Gruppen, die ich sehen darf. Ohne Namen anderer Personen; gezeigt
 * werden Summen, Durchschnitte und meine eigenen Werte.
 */
@Component({
  selector: 'app-cross-event-statistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, TranslatePipe, StatisticsPeriodComponent, StatisticsRecordingComponent, EventComparisonComponent, EventTotalsComponent],
  styleUrl: './statistics.css',
  template: `
    <main class="page-shell">
      <section class="page-card stats-card stats-stack" [attr.aria-label]="'statistics.crossEvents.title' | t">
        <header>
          <p class="stats-eyebrow">{{ 'statistics.crossEvents.eyebrow' | t }}</p>
          <h1 class="stats-title">{{ 'statistics.crossEvents.title' | t }}</h1>
          <p class="stats-note">{{ 'statistics.crossEvents.intro' | t }}</p>
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
          <p class="stats-intro">{{ periodLabelKey(view.period) | t: { days: view.days } }}</p>
          <app-event-totals [totals]="view.totals" />
          <p class="stats-note" data-testid="cross-mine">
            {{ 'statistics.crossEvents.mine' | t: { attended: view.myAttended, purchases: view.myPurchases } }}
          </p>
          <article class="stats-panel">
            <h2 class="stats-panel-title">{{ 'statistics.events.compare' | t }}</h2>
            <app-event-comparison [rows]="view.events" [crossGroup]="true" />
          </article>
        }
      </section>
    </main>
  `,
})
export class CrossEventStatisticsComponent extends PeriodPage<CrossEventStatistics> {
  protected reload(): void {
    this.load.run(this.data.loadCrossEvents(this.period()));
  }
}

/**
 * Gruppen-Event-Statistik (`/statistik/gruppe/events`): alle Events der
 * gewählten Gruppe zusammengefasst und im Vergleich.
 */
@Component({
  selector: 'app-group-event-statistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, TranslatePipe, StatisticsPeriodComponent, StatisticsRecordingComponent, EventComparisonComponent, EventTotalsComponent],
  styleUrl: './statistics.css',
  template: `
    <main class="page-shell">
      <section class="page-card stats-card stats-stack" [attr.aria-label]="'statistics.groupEvents.title' | t">
        <header>
          <p class="stats-eyebrow">{{ 'statistics.eyebrow' | t }}</p>
          <h1 class="stats-title">{{ 'statistics.groupEvents.title' | t }}</h1>
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
          @if (view.recording.groupEnabled !== false || view.events.length > 0) {
            <p class="stats-intro">{{ periodLabelKey(view.period) | t: { days: view.days } }}</p>
            <app-event-totals [totals]="view.totals" />
            <article class="stats-panel">
              <h2 class="stats-panel-title">{{ 'statistics.events.compare' | t }}</h2>
              <app-event-comparison [rows]="view.events" />
            </article>
          }
        }
      </section>
    </main>
  `,
})
export class GroupEventStatisticsComponent extends PeriodPage<GroupEventStatistics> {
  protected reload(): void {
    this.load.run(this.data.loadGroupEvents(this.period()));
  }
}
