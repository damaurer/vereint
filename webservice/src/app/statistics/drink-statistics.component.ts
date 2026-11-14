import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type {
  DrinkCategoryGroup,
  DrinkStatistics,
  DrinkTotals,
  MemberDrinkStats,
  StatisticsPeriodCode,
} from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';
import { AsyncState } from '../member/async-state';
import { StateComponent } from '../ui/state.component';
import { StatisticsDataService } from './statistics-data.service';
import {
  CATEGORY_COLORS,
  CATEGORY_ORDER,
  StatisticsPeriodComponent,
  formatNumber,
  periodFromParams,
} from './statistics-period';

type View = 'member' | 'drink';
type Sort = 'count' | 'kcal';

/**
 * Getränkestatistik der ganzen Gruppe: wer hat wie viel von was getrunken,
 * mit Litern und Kalorien. Nach Mitglied (aufklappbar mit den einzelnen
 * Getränken) oder nach Getränk, sortiert nach Anzahl oder Kalorien.
 *
 * Getränke ohne Füllmenge oder Kalorien zählen dort nicht mit; die Seite
 * nennt dann, bei wie vielen Getränken die Angabe fehlt.
 */
@Component({
  selector: 'app-drink-statistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, TranslatePipe, StatisticsPeriodComponent],
  styleUrl: './statistics.css',
  styles: [
    `
      .drink-toolbar {
        display: flex;
        gap: 0.5rem;
        align-items: stretch;
      }

      .drink-toolbar .stats-segmented {
        flex: 1 1 auto;
      }

      .sort-button {
        flex: none;
        padding: 0.35rem 0.9rem;
        border: 1px solid var(--color-border-dark);
        border-radius: var(--radius-md);
        background: var(--color-surface-raised);
        color: var(--color-text);
        font: inherit;
        font-weight: 700;
        font-size: 0.9rem;
        cursor: pointer;
      }

      .drink-list {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: var(--color-surface-raised);
        overflow: hidden;
      }

      .drink-item {
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--color-border);
      }

      .drink-item:first-child {
        border-top: 0;
      }

      .drink-head {
        display: grid;
        grid-template-columns: 1.75rem minmax(0, 1fr) auto auto;
        gap: 0.5rem;
        align-items: baseline;
        width: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .drink-head:focus-visible {
        outline: none;
        box-shadow: var(--vereint-focus-ring);
        border-radius: var(--radius-md);
      }

      .drink-name {
        font-weight: 700;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .drink-count {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .drink-kcal {
        min-width: 5.5rem;
        text-align: right;
        color: var(--color-text-muted);
        font-variant-numeric: tabular-nums;
      }

      .drink-item .bar-track {
        margin: 0.5rem 0 0 2.25rem;
      }

      .drink-details {
        margin: 0.6rem 0 0 2.25rem;
        font-size: 0.9rem;
      }
    `,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card stats-card stats-stack" [attr.aria-label]="'statistics.drinks.title' | t">
        <header>
          <p class="stats-eyebrow">{{ 'statistics.drinks.eyebrow' | t }}</p>
          <h1 class="stats-title">{{ 'statistics.drinks.title' | t }}</h1>
        </header>

        <app-statistics-period [period]="period()" />

        @if (!isBrowser) {
          <div class="state-card" role="status" data-testid="ssr-placeholder">
            <strong>{{ 'statistics.ssr.title' | t }}</strong>
            <span>{{ 'statistics.ssr.message' | t }}</span>
          </div>
        } @else if (load.isLoading() && !load.data()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'statistics.loadingMessage' | t" />
        } @else if (load.isError()) {
          <vereint-state kind="error" [title]="'statistics.unavailable' | t" [message]="load.errorMessage()" (retry)="reload()" />
        } @else if (load.data(); as stats) {
          <div class="stats-kpis">
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.drinks.total' | t }}</p>
              <p class="stats-kpi-value">{{ format(stats.totalDrinks) }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.drinks.liters' | t }}</p>
              <p class="stats-kpi-value">{{ format(stats.liters, 1) }}</p>
              @if (stats.withoutVolume > 0) {
                <p class="stats-kpi-hint" data-testid="without-volume">{{ 'statistics.drinks.without' | t: { count: stats.withoutVolume } }}</p>
              }
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.drinks.kcal' | t }}</p>
              <p class="stats-kpi-value">{{ format(stats.kcal) }}</p>
              @if (stats.withoutKcal > 0) {
                <p class="stats-kpi-hint" data-testid="without-kcal">{{ 'statistics.drinks.without' | t: { count: stats.withoutKcal } }}</p>
              }
            </article>
          </div>

          <h2 class="stats-subhead">{{ 'statistics.drinks.averages' | t }}</h2>
          <div class="stats-avgs">
            <div class="stats-avg"><strong>{{ stats.averages.perEvent === null ? '–' : format(stats.averages.perEvent, 1) }}</strong><span>{{ 'statistics.drinks.perEvent' | t }}</span></div>
            <div class="stats-avg"><strong>{{ format(stats.averages.perDay, 1) }}</strong><span>{{ 'statistics.drinks.perDay' | t }}</span></div>
            <div class="stats-avg"><strong>{{ format(stats.averages.perWeek, 1) }}</strong><span>{{ 'statistics.drinks.perWeek' | t }}</span></div>
            <div class="stats-avg"><strong>{{ format(stats.averages.perMonth, 1) }}</strong><span>{{ 'statistics.drinks.perMonth' | t }}</span></div>
          </div>

          <div class="drink-toolbar">
            <div class="stats-segmented" role="group" [attr.aria-label]="'statistics.drinks.viewLabel' | t">
              <button type="button" class="stats-segment" [class.is-active]="view() === 'member'" [attr.aria-pressed]="view() === 'member'" (click)="setView('member')">
                {{ 'statistics.drinks.byMember' | t }}
              </button>
              <button type="button" class="stats-segment" [class.is-active]="view() === 'drink'" [attr.aria-pressed]="view() === 'drink'" (click)="setView('drink')">
                {{ 'statistics.drinks.byDrink' | t }}
              </button>
            </div>
            <button type="button" class="sort-button" (click)="toggleSort()" data-testid="sort">
              {{ (sort() === 'count' ? 'statistics.drinks.sortCount' : 'statistics.drinks.sortKcal') | t }}
            </button>
          </div>

          @if (stats.totalDrinks === 0) {
            <p class="stats-empty">{{ 'statistics.drinks.empty' | t }}</p>
          } @else if (view() === 'member') {
            <ol class="drink-list">
              @for (row of members(); track row.memberId; let i = $index) {
                <li class="drink-item">
                  <button type="button" class="drink-head" [attr.aria-expanded]="expanded() === row.memberId" (click)="toggle(row.memberId)">
                    <span class="bar-rank">{{ i + 1 }}.</span>
                    <span class="drink-name">{{ row.displayName }}</span>
                    <span class="drink-count">{{ row.count }}&nbsp;×</span>
                    <span class="drink-kcal">{{ format(row.kcal) }}&nbsp;kcal</span>
                  </button>
                  <span class="bar-track" role="img" [attr.aria-label]="categoryLabel(row)">
                    @for (part of row.categories; track part.category) {
                      <span class="bar-segment" [style.width.%]="(part.count / row.count) * 100" [style.background]="color(part.category)"></span>
                    }
                  </span>
                  @if (expanded() === row.memberId) {
                    <dl class="stats-kv drink-details">
                      <dt>{{ 'statistics.drinks.perEventWeek' | t }}</dt>
                      <dd>{{ row.perEvent === null ? '–' : format(row.perEvent, 1) }} · {{ format(row.perWeek, 1) }}</dd>
                      @for (line of row.drinks; track line.name) {
                        <dt>{{ line.count }} × {{ line.name }}{{ line.volumeMl ? ' ' + volume(line.volumeMl) : '' }}</dt>
                        <dd>{{ line.kcal === null ? ('statistics.drinks.noValue' | t) : format(line.kcal) + ' kcal' }}</dd>
                      }
                    </dl>
                  }
                </li>
              }
            </ol>
          } @else {
            <ol class="drink-list">
              @for (row of drinks(); track row.name; let i = $index) {
                <li class="drink-item">
                  <div class="drink-head">
                    <span class="bar-rank">{{ i + 1 }}.</span>
                    <span class="drink-name">{{ row.name }}{{ row.volumeMl ? ' ' + volume(row.volumeMl) : '' }}</span>
                    <span class="drink-count">{{ row.count }}&nbsp;×</span>
                    <span class="drink-kcal">{{ row.kcal === null ? '–' : format(row.kcal) + ' kcal' }}</span>
                  </div>
                  <p class="stats-note drink-details">
                    {{ 'statistics.drinks.drinkDetails' | t: { members: row.members, liters: row.liters === null ? '–' : format(row.liters, 1) } }}
                  </p>
                </li>
              }
            </ol>
          }

          <ul class="stats-legend" [attr.aria-label]="'statistics.categories.legend' | t">
            @for (category of legend(stats); track category) {
              <li><span class="stats-legend-dot" [style.background]="color(category)"></span>{{ 'statistics.categories.' + category | t }}</li>
            }
          </ul>
        }
      </section>
    </main>
  `,
})
export class DrinkStatisticsComponent implements OnInit, OnDestroy {
  private readonly data = inject(StatisticsDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly load = new AsyncState<DrinkStatistics>();
  protected readonly period = signal<StatisticsPeriodCode>('90');
  protected readonly view = signal<View>('member');
  protected readonly sort = signal<Sort>('count');
  protected readonly expanded = signal<string | null>(null);
  private readonly loaded = signal<DrinkStatistics | null>(null);

  protected readonly members = computed<MemberDrinkStats[]>(() => {
    const rows = [...(this.loaded()?.members ?? [])];
    return this.sort() === 'kcal' ? rows.sort((a, b) => b.kcal - a.kcal || b.count - a.count) : rows;
  });

  protected readonly drinks = computed<DrinkTotals[]>(() => {
    const rows = [...(this.loaded()?.drinks ?? [])];
    return this.sort() === 'kcal' ? rows.sort((a, b) => (b.kcal ?? -1) - (a.kcal ?? -1) || b.count - a.count) : rows;
  });

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
    this.load.run(this.data.loadDrinks(this.period(), this.view()), (value) => {
      this.loaded.set(value);
      const first = value.members[0]?.memberId ?? null;
      if (this.expanded() === null) this.expanded.set(first);
    });
  }

  protected setView(view: View): void {
    if (this.view() === view) return;
    this.view.set(view);
    this.reload();
  }

  protected toggleSort(): void {
    this.sort.update((value) => (value === 'count' ? 'kcal' : 'count'));
  }

  protected toggle(memberId: string): void {
    this.expanded.update((value) => (value === memberId ? '' : memberId));
  }

  protected format(value: number | string | null, digits = 0): string {
    return formatNumber(value, digits);
  }

  protected volume(ml: number): string {
    return ml >= 100 ? `${formatNumber(ml / 1000, ml % 100 === 0 ? 1 : 2)} l` : `${formatNumber(ml / 10)} cl`;
  }

  protected color(category: DrinkCategoryGroup): string {
    return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
  }

  /** Text-Alternative zum Kategorie-Balken. */
  protected categoryLabel(row: MemberDrinkStats): string {
    return row.categories
      .map((part) => `${translate('statistics.categories.' + part.category)}: ${part.count}`)
      .join(', ');
  }

  protected legend(stats: DrinkStatistics): DrinkCategoryGroup[] {
    const used = new Set(stats.members.flatMap((row) => row.categories.map((part) => part.category)));
    stats.drinks.forEach((row) => used.add(row.category));
    return CATEGORY_ORDER.filter((category) => used.has(category));
  }
}
