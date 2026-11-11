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
import { ActivatedRoute } from '@angular/router';
import type {
  DrinkCategoryGroup,
  MemberDrinkStats,
  StatisticsOverview,
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
  formatMoney,
  formatNumber,
  periodFromParams,
  periodLabelKey,
  share,
} from './statistics-period';

type Rsvp = StatisticsOverview['rsvpByEvent'][number];

/** Antwortarten je Event mit Farb-Token. */
const RSVP_PARTS: readonly { key: 'accepted' | 'maybe' | 'declined' | 'noAnswer'; color: string }[] = [
  { key: 'accepted', color: 'var(--color-success)' },
  { key: 'maybe', color: 'var(--color-warning)' },
  { key: 'declined', color: 'var(--color-danger)' },
  { key: 'noAnswer', color: 'var(--color-border-dark)' },
];

/**
 * Statistik-Übersicht: alle Kennzahlen der Gruppe auf einer Seite, gedacht für
 * den Rechner, auf dem Handy untereinander. Abschnitte Kennzahlen, Events &
 * Zusagen, Trinkverhalten, Getränke und Gemeinschaft. Den Umsatz liefert der
 * Fachservice nur an Vorstand/Kasse; sonst fehlt die Kachel.
 *
 * Diagramme sind schlichtes HTML/CSS; jeder Balken hat eine Text-Alternative.
 */
@Component({
  selector: 'app-statistics-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, TranslatePipe, StatisticsPeriodComponent],
  styleUrl: './statistics.css',
  styles: [
    `
      .rsvp-row + .rsvp-row {
        margin-top: 0.6rem;
      }

      .rsvp-head {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        font-size: 0.85rem;
        margin-bottom: 0.2rem;
      }

      .rsvp-head span:first-child {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .rsvp-head span:last-child {
        color: var(--color-text-muted);
        white-space: nowrap;
      }

      .rsvp-row .bar-track {
        border-radius: 0.2rem;
      }

      .columns {
        display: flex;
        align-items: flex-end;
        gap: 0.3rem;
        height: 9rem;
      }

      .column {
        flex: 1 1 0;
        min-width: 0.4rem;
        height: 100%;
        display: flex;
        align-items: flex-end;
        border: 0;
        padding: 0;
        background: transparent;
        cursor: default;
      }

      .column-fill {
        display: block;
        width: 100%;
        min-height: 2px;
        border-radius: 0.2rem 0.2rem 0 0;
        background: var(--color-brand);
        opacity: 0.85;
      }

      .column:hover .column-fill,
      .column:focus-visible .column-fill {
        opacity: 1;
        background: var(--color-brand-strong);
      }

      .column:focus-visible {
        outline: none;
        box-shadow: var(--vereint-focus-ring);
      }

      .columns-axis {
        display: flex;
        justify-content: space-between;
        margin-top: 0.4rem;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .when-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: 1fr;
      }

      @media (min-width: 36rem) {
        .when-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      .when-grid .bar-row-plain {
        grid-template-columns: 2.75rem 1fr 2rem;
        font-size: 0.8rem;
      }

      .who-row {
        display: grid;
        grid-template-columns: minmax(5rem, 9rem) 1fr minmax(6rem, auto);
        gap: 0.75rem;
        align-items: center;
        font-size: 0.85rem;
      }

      .who-row + .who-row {
        margin-top: 0.6rem;
      }

      .who-row .bar-track {
        height: 0.8rem;
        border-radius: 0.2rem;
      }

      .who-total {
        color: var(--color-text-muted);
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .records dt {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .records dd {
        margin: 0 0 0.5rem;
        font-weight: 700;
      }

      .category-bar {
        height: 1.4rem;
        border-radius: 0.3rem;
        margin-bottom: 0.75rem;
      }

      .category-name {
        display: inline-flex;
        align-items: center;
      }

      @media (max-width: 30rem) {
        .who-row {
          grid-template-columns: 1fr;
          gap: 0.25rem;
        }

        .who-total {
          text-align: left;
        }
      }
    `,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card stats-card-wide" [attr.aria-label]="'statistics.overview.title' | t">
        <header class="stats-head">
          <div>
            <p class="stats-eyebrow">
              {{ 'statistics.overview.eyebrow' | t }} · {{ periodLabelKey(period()) | t: { days: load.data()?.days ?? (period() === '30' ? 30 : 90) } }}
            </p>
            <h1 class="stats-title">{{ 'statistics.overview.title' | t }}</h1>
            <p class="stats-intro">{{ 'statistics.overview.intro' | t }}</p>
          </div>
          <app-statistics-period [period]="period()" />
        </header>

        @if (!isBrowser) {
          <div class="state-card" role="status" data-testid="ssr-placeholder">
            <strong>{{ 'statistics.ssr.title' | t }}</strong>
            <span>{{ 'statistics.ssr.message' | t }}</span>
          </div>
        } @else if (load.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'statistics.loadingMessage' | t" />
        } @else if (load.isError()) {
          <vereint-state kind="error" [title]="'statistics.unavailable' | t" [message]="load.errorMessage()" (retry)="reload()" />
        } @else if (load.data(); as o) {
          <div class="stats-kpis stats-kpis-wide" data-testid="kpis">
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.overview.kpi.members' | t }}</p>
              <p class="stats-kpi-value">{{ o.kpis.members }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.overview.kpi.membersHint' | t: { active: o.kpis.activeMembers, new: o.kpis.newMembers } }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.overview.kpi.events' | t }}</p>
              <p class="stats-kpi-value">{{ o.kpis.events }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.overview.kpi.eventsHint' | t: { avg: avg(o.kpis.avgParticipants) } }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.attendance.title' | t }}</p>
              <p class="stats-kpi-value">{{ o.kpis.attendancePercent === null ? '–' : o.kpis.attendancePercent + ' %' }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.overview.kpi.attendanceHint' | t }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.drinks.total' | t }}</p>
              <p class="stats-kpi-value">{{ fmt(o.kpis.drinks) }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.overview.kpi.perEvent' | t: { value: avg(o.kpis.drinksPerEvent) } }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.drinks.liters' | t }}</p>
              <p class="stats-kpi-value">{{ fmt(o.kpis.liters, 1) }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.overview.kpi.perWeek' | t: { value: fmt(o.kpis.litersPerWeek, 1) } }}</p>
            </article>
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.drinks.kcal' | t }}</p>
              <p class="stats-kpi-value">{{ fmt(o.kpis.kcal) }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.overview.kpi.perMember' | t: { value: o.kpis.kcalPerMember === null ? '–' : fmt(o.kpis.kcalPerMember) } }}</p>
            </article>
            @if (o.kpis.revenue !== null) {
              <article class="stats-kpi" data-testid="revenue">
                <p class="stats-kpi-label">{{ 'statistics.overview.kpi.revenue' | t }}</p>
                <p class="stats-kpi-value">{{ money(o.kpis.revenue, o.kpis.currency) }}</p>
                <p class="stats-kpi-hint">{{ 'statistics.overview.kpi.perEvent' | t: { value: o.kpis.revenuePerEvent === null ? '–' : money(o.kpis.revenuePerEvent, o.kpis.currency) } }}</p>
              </article>
            }
            <article class="stats-kpi">
              <p class="stats-kpi-label">{{ 'statistics.overview.kpi.perMonth' | t }}</p>
              <p class="stats-kpi-value">{{ fmt(o.kpis.drinksPerMonth, 1) }}</p>
              <p class="stats-kpi-hint">{{ 'statistics.overview.kpi.perMonthHint' | t }}</p>
            </article>
          </div>
          @if (o.kpis.withoutVolume > 0 || o.kpis.withoutKcal > 0) {
            <p class="stats-note" data-testid="without-values">
              {{ 'statistics.overview.withoutValues' | t: { volume: o.kpis.withoutVolume, kcal: o.kpis.withoutKcal } }}
            </p>
          }

          <h2 class="stats-section-title">{{ 'statistics.overview.sections.events' | t }}</h2>
          <div class="stats-grid-2">
            <article class="stats-panel">
              <h3 class="stats-panel-title">{{ 'statistics.overview.rsvpByEvent' | t }}</h3>
              <ul class="stats-legend">
                @for (part of rsvpParts; track part.key) {
                  <li><span class="stats-legend-dot" [style.background]="part.color"></span>{{ 'statistics.overview.rsvp.' + part.key | t }}</li>
                }
              </ul>
              @if (o.rsvpByEvent.length === 0) {
                <p class="stats-empty">{{ 'statistics.overview.noEvents' | t }}</p>
              }
              @for (event of o.rsvpByEvent; track event.eventId) {
                <div class="rsvp-row">
                  <div class="rsvp-head">
                    <span>{{ event.title }}</span>
                    <span>{{ 'statistics.overview.acceptedOf' | t: { accepted: event.accepted, invited: event.invited } }}</span>
                  </div>
                  <span class="bar-track" role="img" [attr.aria-label]="rsvpLabel(event)">
                    @for (part of rsvpParts; track part.key) {
                      <span class="bar-segment" [style.width.%]="(event[part.key] / (event.invited || 1)) * 100" [style.background]="part.color"></span>
                    }
                  </span>
                </div>
              }
            </article>

            <article class="stats-panel">
              <h3 class="stats-panel-title">{{ 'statistics.overview.rsvpByMember' | t }}</h3>
              @if (o.rsvpByMember.length === 0) {
                <p class="stats-empty">{{ 'statistics.overview.noEvents' | t }}</p>
              } @else {
                <div class="stats-table-wrap">
                  <table class="stats-table">
                    <thead>
                      <tr>
                        <th scope="col">{{ 'statistics.overview.table.member' | t }}</th>
                        <th scope="col">{{ 'statistics.overview.table.yes' | t }}</th>
                        <th scope="col">{{ 'statistics.overview.rsvp.maybe' | t }}</th>
                        <th scope="col">{{ 'statistics.overview.table.no' | t }}</th>
                        <th scope="col">{{ 'statistics.overview.table.attended' | t }}</th>
                        <th scope="col">{{ 'statistics.overview.table.quote' | t }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of o.rsvpByMember; track row.memberId) {
                        <tr>
                          <td>{{ row.displayName }}</td>
                          <td>{{ row.accepted }}</td>
                          <td>{{ row.maybe }}</td>
                          <td>{{ row.declined }}</td>
                          <td>{{ row.attended }}</td>
                          <td><strong>{{ row.quotePercent === null ? '–' : row.quotePercent + ' %' }}</strong></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="stats-note">{{ 'statistics.overview.attendedHint' | t }}</p>
              }
            </article>
          </div>

          <h2 class="stats-section-title">{{ 'statistics.overview.sections.drinking' | t }}</h2>
          <div class="stats-grid-2">
            <article class="stats-panel">
              <div class="stats-panel-head">
                <h3 class="stats-panel-title">{{ 'statistics.overview.weekly' | t }}</h3>
                <span class="stats-note" data-testid="weekly-value">
                  {{ hoveredWeek() === null ? ('statistics.overview.weeklyAvg' | t: { value: weeklyAvg(o.weekly) }) : ('statistics.overview.weeklyValue' | t: { value: o.weekly[hoveredWeek()!] }) }}
                </span>
              </div>
              <div class="columns" role="img" [attr.aria-label]="weeklyLabel(o.weekly)">
                @for (value of o.weekly; track $index; let i = $index) {
                  <span
                    class="column"
                    tabindex="0"
                    [attr.title]="value"
                    (mouseenter)="hoveredWeek.set(i)"
                    (mouseleave)="hoveredWeek.set(null)"
                    (focus)="hoveredWeek.set(i)"
                    (blur)="hoveredWeek.set(null)"
                  ><span class="column-fill" [style.height.%]="pct(value, o.weekly)"></span></span>
                }
              </div>
              <div class="columns-axis">
                <span>{{ 'statistics.overview.weeksAgo' | t: { count: o.weekly.length - 1 } }}</span>
                <span>{{ 'statistics.overview.thisWeek' | t }}</span>
              </div>
            </article>

            <article class="stats-panel">
              <h3 class="stats-panel-title">{{ 'statistics.overview.when' | t }}</h3>
              <div class="when-grid">
                <div>
                  <h4 class="stats-subhead">{{ 'statistics.overview.byWeekday' | t }}</h4>
                  <ul class="bar-list">
                    @for (day of o.weekdays; track day.key) {
                      <li class="bar-row bar-row-plain">
                        <span>{{ 'statistics.overview.weekdays.' + day.key | t }}</span>
                        <span class="bar-track" aria-hidden="true"><span class="bar-fill bar-fill-brand" [style.width.%]="pctOf(day.count, o.weekdays)"></span></span>
                        <span class="bar-value">{{ day.count }}</span>
                      </li>
                    }
                  </ul>
                </div>
                <div>
                  <h4 class="stats-subhead">{{ 'statistics.overview.byHour' | t }}</h4>
                  <ul class="bar-list">
                    @for (hour of o.hours; track hour.key) {
                      <li class="bar-row bar-row-plain">
                        <span>{{ 'statistics.overview.hours.' + hour.key | t }}</span>
                        <span class="bar-track" aria-hidden="true"><span class="bar-fill bar-fill-brand" [style.width.%]="pctOf(hour.count, o.hours)"></span></span>
                        <span class="bar-value">{{ hour.count }}</span>
                      </li>
                    }
                  </ul>
                </div>
              </div>
            </article>
          </div>

          <article class="stats-panel" style="margin-top: 1rem">
            <div class="stats-panel-head">
              <h3 class="stats-panel-title">{{ 'statistics.overview.whoDrinksWhat' | t }}</h3>
            </div>
            <ul class="stats-legend">
              @for (category of categoryOrder; track category) {
                <li><span class="stats-legend-dot" [style.background]="color(category)"></span>{{ 'statistics.categories.' + category | t }}</li>
              }
            </ul>
            @if (o.whoDrinksWhat.length === 0) {
              <p class="stats-empty">{{ 'statistics.drinks.empty' | t }}</p>
            }
            @for (row of o.whoDrinksWhat; track row.memberId) {
              <div class="who-row">
                <strong class="bar-name">{{ row.displayName }}</strong>
                <span class="bar-track" role="img" [attr.aria-label]="categoryLabel(row)">
                  @for (part of row.categories; track part.category) {
                    <span class="bar-segment" [style.width.%]="(part.count / row.count) * 100" [style.background]="color(part.category)"></span>
                  }
                </span>
                <span class="who-total">{{ 'statistics.overview.drinksKcal' | t: { count: row.count, kcal: fmt(row.kcal) } }}</span>
              </div>
            }
          </article>

          <h2 class="stats-section-title">{{ 'statistics.overview.sections.drinks' | t }}</h2>
          <div class="stats-grid-2">
            <article class="stats-panel">
              <h3 class="stats-panel-title">{{ 'statistics.overview.topDrinks' | t }}</h3>
              @if (o.topDrinks.length === 0) {
                <p class="stats-empty">{{ 'statistics.drinks.empty' | t }}</p>
              }
              <ul class="bar-list">
                @for (drink of o.topDrinks; track drink.name) {
                  <li class="bar-row bar-row-plain">
                    <span class="bar-name">{{ drink.name }}</span>
                    <span class="bar-track" aria-hidden="true"><span class="bar-fill bar-fill-brand" [style.width.%]="topShare(drink.count, o)"></span></span>
                    <span class="bar-value">{{ 'statistics.overview.countPerEvent' | t: { count: drink.count, value: avg(drink.perEvent) } }}</span>
                  </li>
                }
              </ul>
            </article>

            <article class="stats-panel">
              <h3 class="stats-panel-title">{{ 'statistics.overview.categoryShare' | t }}</h3>
              @if (o.categories.length === 0) {
                <p class="stats-empty">{{ 'statistics.drinks.empty' | t }}</p>
              } @else {
                <span class="bar-track category-bar" role="img" [attr.aria-label]="categoryShareLabel(o)">
                  @for (part of o.categories; track part.category) {
                    <span class="bar-segment" [style.width.%]="part.sharePercent" [style.background]="color(part.category)"></span>
                  }
                </span>
                <div class="stats-table-wrap">
                  <table class="stats-table">
                    <thead>
                      <tr>
                        <th scope="col">{{ 'statistics.overview.table.category' | t }}</th>
                        <th scope="col">{{ 'statistics.drinks.total' | t }}</th>
                        <th scope="col">{{ 'statistics.overview.table.share' | t }}</th>
                        <th scope="col">{{ 'statistics.drinks.liters' | t }}</th>
                        <th scope="col">kcal</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (part of o.categories; track part.category) {
                        <tr>
                          <td><span class="category-name"><span class="stats-legend-dot" [style.background]="color(part.category)"></span>{{ 'statistics.categories.' + part.category | t }}</span></td>
                          <td>{{ part.count }}</td>
                          <td>{{ part.sharePercent }}&nbsp;%</td>
                          <td>{{ fmt(part.liters, 1) }}</td>
                          <td>{{ fmt(part.kcal) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </article>
          </div>

          <h2 class="stats-section-title">{{ 'statistics.overview.sections.community' | t }}</h2>
          <div class="stats-grid-4">
            <article class="stats-panel">
              <h3 class="stats-panel-title">{{ 'statistics.topRounds.title' | t }}</h3>
              @if (o.roundGivers.length === 0) {
                <p class="stats-empty">{{ 'statistics.overview.noRounds' | t }}</p>
              } @else {
                <dl class="stats-kv">
                  @for (giver of o.roundGivers; track giver.memberId) {
                    <dt>{{ giver.displayName }}</dt>
                    <dd>{{ 'statistics.topRounds.rounds' | t: { count: giver.count } }}</dd>
                  }
                </dl>
              }
            </article>
            <article class="stats-panel">
              <h3 class="stats-panel-title">{{ 'statistics.overview.moments.title' | t }}</h3>
              <dl class="stats-kv">
                <dt>{{ 'statistics.overview.moments.started' | t }}</dt><dd>{{ o.moments.started }}</dd>
                <dt>{{ 'statistics.overview.moments.reactions' | t }}</dt><dd>{{ o.moments.reactions }}</dd>
                <dt>{{ 'statistics.overview.moments.media' | t }}</dt><dd>{{ o.moments.media }}</dd>
              </dl>
            </article>
            <article class="stats-panel">
              <h3 class="stats-panel-title">{{ 'statistics.overview.chat.title' | t }}</h3>
              <dl class="stats-kv">
                <dt>{{ 'statistics.overview.chat.messages' | t }}</dt><dd>{{ o.chat.messages }}</dd>
                <dt>{{ 'statistics.overview.chat.mostActive' | t }}</dt><dd>{{ o.chat.mostActive ?? '–' }}</dd>
                <dt>{{ 'statistics.overview.chat.eventChats' | t }}</dt><dd>{{ o.chat.eventChats }}</dd>
              </dl>
            </article>
            <article class="stats-panel">
              <h3 class="stats-panel-title">{{ 'statistics.overview.records.title' | t }}</h3>
              <dl class="records" style="margin: 0">
                <dt>{{ 'statistics.overview.records.mostDrinks' | t }}</dt>
                <dd>{{ o.records.mostDrinksEvening ? ('statistics.overview.records.mostDrinksValue' | t: { label: o.records.mostDrinksEvening.label, count: o.records.mostDrinksEvening.value }) : '–' }}</dd>
                <dt>{{ 'statistics.overview.records.streak' | t }}</dt>
                <dd>{{ o.records.longestStreak ? ('statistics.overview.records.streakValue' | t: { label: o.records.longestStreak.label, count: o.records.longestStreak.value }) : '–' }}</dd>
                <dt>{{ 'statistics.overview.records.fastest' | t }}</dt>
                <dd>{{ o.records.fastestRsvp ? ('statistics.overview.records.fastestValue' | t: { label: o.records.fastestRsvp.label, count: o.records.fastestRsvp.value }) : '–' }}</dd>
              </dl>
            </article>
          </div>
        }
      </section>
    </main>
  `,
})
export class StatisticsOverviewComponent implements OnInit, OnDestroy {
  private readonly data = inject(StatisticsDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly load = new AsyncState<StatisticsOverview>();
  protected readonly period = signal<StatisticsPeriodCode>('90');
  protected readonly hoveredWeek = signal<number | null>(null);
  protected readonly rsvpParts = RSVP_PARTS;
  protected readonly categoryOrder = CATEGORY_ORDER.filter((category) => category !== 'other');
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
    this.load.run(this.data.loadOverview(this.period()));
  }

  protected fmt(value: number | string | null, digits = 0): string {
    return formatNumber(value, digits);
  }

  protected avg(value: number | string | null): string {
    return value === null ? '–' : formatNumber(value, 1);
  }

  protected money(value: number | string, currency: string): string {
    return formatMoney(value, currency);
  }

  protected color(category: DrinkCategoryGroup): string {
    return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
  }

  protected pct(value: number, values: number[]): number {
    return share(value, Math.max(...values, 0));
  }

  protected pctOf(value: number, buckets: { count: number }[]): number {
    return share(value, Math.max(...buckets.map((bucket) => bucket.count), 0));
  }

  protected topShare(count: number, overview: StatisticsOverview): number {
    return share(count, overview.topDrinks[0]?.count ?? 0);
  }

  protected weeklyAvg(weekly: number[]): string {
    const total = weekly.reduce((sum, value) => sum + value, 0);
    return formatNumber(weekly.length ? total / weekly.length : 0, 1);
  }

  protected weeklyLabel(weekly: number[]): string {
    return translate('statistics.overview.weeklyLabel', { values: weekly.join(', ') });
  }

  protected rsvpLabel(event: Rsvp): string {
    return RSVP_PARTS.map((part) => `${translate('statistics.overview.rsvp.' + part.key)}: ${event[part.key]}`).join(', ');
  }

  protected categoryLabel(row: MemberDrinkStats): string {
    return row.categories
      .map((part) => `${translate('statistics.categories.' + part.category)}: ${part.count}`)
      .join(', ');
  }

  protected categoryShareLabel(overview: StatisticsOverview): string {
    return overview.categories
      .map((part) => `${translate('statistics.categories.' + part.category)}: ${part.sharePercent} %`)
      .join(', ');
  }
}
