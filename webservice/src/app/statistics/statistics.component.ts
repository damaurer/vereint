import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncState } from '../member/async-state';
import { InfoPanelComponent, StatCardComponent } from '../ui';
import { StatisticsDataService } from './statistics-data.service';
import type { StatisticsView, TopConsumer } from './statistics.types';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { activeLocale, translate } from '../i18n/i18n.service';

/**
 * Statistik- und Eber-Analytik-Oberfläche.
 *
 * Zeigt die Vereinsstatistik aus `GET /statistics` als responsives Karten-Grid:
 * Rangliste nach Strichen (eigener Platz hervorgehoben), Zusagequote-Ring,
 * Umsatz der letzten 30 Tage mit 8-Wochen-Verlauf, beliebteste Artikel und
 * Events mit den meisten Strichen. Die Statistik steht allen Angemeldeten
 * offen; die Autorisierung bleibt beim Fachservice.
 *
 * Statistiken sind Aggregate: Diagramme rendern ausschließlich clientseitig
 * (`isPlatformBrowser`); serverseitig erscheint nur ein neutraler Platzhalter,
 * niemals Aggregate im SSR-HTML (`AGENTS.md`).
 */
@Component({
  selector: 'app-statistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, StatCardComponent, InfoPanelComponent, RouterLink, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card stats-card" [attr.aria-label]="'statistics.ariaLabel' | t">
        <header class="stats-head">
          <p class="stats-eyebrow">{{ 'statistics.eyebrow' | t }}</p>
          <h1 class="stats-title">{{ 'statistics.title' | t }}</h1>
          @if (load.data(); as view) {
            <p class="stats-intro">{{ 'statistics.intro' | t: { days: view.periodDays } }}</p>
          }
        </header>

        @if (!isBrowser) {
          <div class="state-card" role="status" aria-live="polite" data-testid="ssr-placeholder">
            <strong>{{ 'statistics.ssr.title' | t }}</strong>
            <span>{{ 'statistics.ssr.message' | t }}</span>
          </div>
        } @else if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'statistics.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'statistics.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as view) {
          @if (isEmpty(view)) {
            <vereint-state
              kind="empty"
              [title]="'statistics.empty.title' | t"
              [message]="'statistics.empty.message' | t"
            />
          } @else {
            <div class="stats-grid">
              <article class="stats-panel stats-span" [attr.aria-label]="'statistics.consumption.ariaLabel' | t">
                <h2 class="stats-panel-title">{{ 'statistics.consumption.title' | t }}</h2>
                <div class="stats-kpis">
                  <vereint-stat-card [label]="'statistics.consumption.total' | t" [value]="view.totalItems" />
                  <vereint-stat-card [label]="'statistics.consumption.mine' | t" [value]="view.myItems" />
                  <vereint-stat-card
                    [label]="'statistics.consumption.myRank' | t"
                    [value]="view.myRank !== null ? ('statistics.consumption.rankValue' | t: { rank: view.myRank }) : ('statistics.consumption.noRank' | t)"
                  />
                </div>
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
                <h2 class="stats-panel-title">{{ 'statistics.attendance.title' | t }}</h2>
                @if (view.attendancePercent === null) {
                  <p class="stats-empty" data-testid="attendance-empty">{{ 'statistics.attendance.empty' | t }}</p>
                } @else {
                  <div class="ring" [style.--ring-value]="view.attendancePercent" role="img"
                       [attr.aria-label]="'statistics.attendance.ringLabel' | t: { percent: view.attendancePercent }">
                    <span class="ring-label">{{ view.attendancePercent }}%</span>
                  </div>
                  <p class="stats-note">{{ 'statistics.attendance.hint' | t }}</p>
                }
              </article>

              <article class="stats-panel" [attr.aria-label]="'statistics.spending.title' | t">
                <h2 class="stats-panel-title">{{ 'statistics.spending.title' | t }}</h2>
                <vereint-stat-card
                  [label]="'statistics.spending.total' | t"
                  [value]="formatMoney(view.spending.total, view.spending.currency)"
                  [hint]="trendHint(view.spending.changePercent)"
                />
                <h3 class="stats-sub">{{ 'statistics.spending.weekly' | t }}</h3>
                @if (hasWeekly(view)) {
                  <div class="trend" role="img" [attr.aria-label]="weeklyLabel(view)">
                    @for (value of view.spending.weekly; track $index) {
                      <span
                        class="trend-bar"
                        [style.height.%]="trendHeight(value, view.spending.weekly)"
                        [attr.title]="formatMoney(value, view.spending.currency)"
                      ></span>
                    }
                  </div>
                } @else {
                  <p class="stats-empty">{{ 'statistics.spending.empty' | t }}</p>
                }
              </article>

              <vereint-info-panel class="stats-span" icon="beer" [title]="'statistics.items.title' | t">
                @if (view.itemRanking.length === 0) {
                  <p class="stats-empty">{{ 'statistics.items.empty' | t }}</p>
                } @else {
                  <ol class="rank-list">
                    @for (item of view.itemRanking; track item.name) {
                      <li class="rank-row">
                        <span class="rank-name">{{ item.name }}</span>
                        <span class="rank-value">{{ 'statistics.items.share' | t: { percent: item.sharePercent, count: item.count } }}</span>
                      </li>
                    }
                  </ol>
                }
              </vereint-info-panel>

              <vereint-info-panel class="stats-span" icon="crown" [title]="'statistics.topEvents.title' | t">
                @if (view.topEvents.length === 0) {
                  <p class="stats-empty">{{ 'statistics.topEvents.empty' | t }}</p>
                } @else {
                  <ol class="rank-list">
                    @for (event of view.topEvents; track event.eventId) {
                      <li class="rank-row">
                        <a class="rank-name rank-link" [routerLink]="['/events', event.eventId]">{{ event.title }}</a>
                        <span class="rank-value">{{ 'statistics.consumption.count' | t: { count: event.count } }}</span>
                      </li>
                    }
                  </ol>
                }
              </vereint-info-panel>
            </div>
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
      .stats-card {
        width: min(100%, 60rem);
      }

      .stats-head {
        margin-bottom: 1rem;
      }

      .stats-eyebrow {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.75rem;
        color: var(--color-brand);
      }

      .stats-title {
        margin: 0.1rem 0 0;
        font-size: 1.6rem;
      }

      .stats-grid {
        display: grid;
        gap: var(--space-2, 1rem);
        grid-template-columns: 1fr;
      }

      @media (min-width: 48rem) {
        .stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }

        .stats-span {
          grid-column: 1 / -1;
        }
      }

      @media (min-width: 64rem) {
        .stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .stats-panel {
        border-radius: var(--radius-md, 0.75rem);
        background: rgba(148, 163, 184, 0.08);
        padding: 1rem;
      }

      .stats-panel-title {
        margin: 0 0 0.75rem;
        font-size: 1rem;
      }

      .bar-list,
      .rank-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }

      .stats-intro {
        margin: 0.25rem 0 0;
        color: var(--color-text-muted);
      }

      .stats-kpis {
        display: grid;
        gap: var(--space-2, 0.75rem);
        grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
        margin-bottom: 1rem;
      }

      .stats-sub {
        margin: 0.75rem 0 0;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text-muted);
      }

      .stats-empty,
      .stats-note {
        margin: 0.5rem 0 0;
        color: var(--color-text-muted);
      }

      .bar-row {
        display: grid;
        grid-template-columns: 1.75rem minmax(5rem, 9rem) 1fr auto;
        align-items: center;
        gap: 0.6rem;
        padding: 0.15rem 0.25rem;
        border-radius: 0.5rem;
      }

      .bar-row-me {
        background: var(--color-brand-soft, rgba(245, 158, 11, 0.15));
        font-weight: 700;
      }

      .bar-rank {
        font-variant-numeric: tabular-nums;
        color: var(--color-text-muted);
      }

      .bar-me {
        margin-left: 0.35rem;
        padding: 0 0.4rem;
        border-radius: 999px;
        background: var(--color-brand);
        color: var(--color-on-brand, #fff);
        font-size: 0.75rem;
      }

      .rank-link {
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .bar-name {
        font-size: 0.9rem;
        overflow-wrap: anywhere;
      }

      .bar-track {
        height: 0.9rem;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.18);
        overflow: hidden;
      }

      .bar-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--color-brand);
      }

      .bar-value {
        font-variant-numeric: tabular-nums;
        color: var(--color-text-muted);
      }

      .ring {
        --ring-value: 0;
        position: relative;
        width: 8rem;
        height: 8rem;
        margin: 0 auto;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: conic-gradient(
          var(--color-brand) calc(var(--ring-value) * 1%),
          rgba(148, 163, 184, 0.18) 0
        );
      }

      .ring::before {
        content: '';
        position: absolute;
        width: 6rem;
        height: 6rem;
        border-radius: 50%;
        background: var(--color-surface, #1c1c1c);
      }

      .ring-label {
        position: relative;
        font-size: 1.5rem;
        font-weight: 700;
      }

      .trend {
        display: flex;
        align-items: flex-end;
        gap: 0.3rem;
        height: 4rem;
        margin-top: 0.75rem;
      }

      .trend-bar {
        flex: 1 1 0;
        min-height: 0.4rem;
        border-radius: 0.2rem 0.2rem 0 0;
        background: var(--color-brand);
        opacity: 0.85;
      }

      .rank-row {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
      }

      .rank-value {
        color: var(--color-brand);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class StatisticsComponent implements OnInit, OnDestroy {
  private readonly data = inject(StatisticsDataService);
  private readonly platformId = inject(PLATFORM_ID);

  /** Diagramme rendern nur clientseitig; SSR zeigt einen neutralen Platzhalter. */
  protected readonly isBrowser = isPlatformBrowser(this.platformId);
  protected readonly load = new AsyncState<StatisticsView>();

  ngOnInit(): void {
    // Aggregate niemals serverseitig laden/rendern (kein Leak im SSR-HTML).
    if (this.isBrowser) this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.data.loadStatistics());
  }

  /** Leerzustand, wenn im Zeitraum weder Striche, Umsatz noch Zusagen vorliegen. */
  protected isEmpty(view: StatisticsView): boolean {
    return (
      view.totalItems === 0 &&
      view.topConsumers.length === 0 &&
      view.itemRanking.length === 0 &&
      view.topEvents.length === 0 &&
      view.attendancePercent === null &&
      !this.hasWeekly(view) &&
      Number(view.spending.total) === 0
    );
  }

  /** Eigene Zeile der Rangliste (Platz = Position + 1). */
  protected isMe(index: number, view: StatisticsView): boolean {
    return view.myRank !== null && view.myRank === index + 1;
  }

  /** Balkenbreite relativ zum Spitzenwert (0–100 %). */
  protected barWidth(row: TopConsumer, rows: TopConsumer[]): number {
    const max = Math.max(...rows.map((entry) => entry.count), 1);
    return Math.round((row.count / max) * 100);
  }

  /** Gibt es im Wochenverlauf überhaupt Umsatz? */
  protected hasWeekly(view: StatisticsView): boolean {
    return view.spending.weekly.some((value) => Number(value) > 0);
  }

  /** Balkenhöhe des Wochenverlaufs relativ zum Maximum (0–100 %). */
  protected trendHeight(value: string, weekly: string[]): number {
    const max = Math.max(...weekly.map((entry) => Number(entry) || 0), 0);
    if (max <= 0) return 0;
    return Math.round(((Number(value) || 0) / max) * 100);
  }

  /** Zugängliche Beschreibung des Wochenverlaufs (älteste Woche zuerst). */
  protected weeklyLabel(view: StatisticsView): string {
    const values = view.spending.weekly
      .map((value) => this.formatMoney(value, view.spending.currency))
      .join(', ');
    return translate('statistics.spending.weeklyLabel', { values });
  }

  /** Veränderung gegenüber den 30 Tagen davor; ohne Vergleichswert kein Hinweis. */
  protected trendHint(changePercent: number | null): string | null {
    if (changePercent === null) return null;
    const rounded = Math.round(changePercent);
    const sign = rounded > 0 ? '+' : '';
    return translate('statistics.spending.trendHint', { change: `${sign}${rounded}` });
  }

  /** Formatiert einen dezimalen Betrag als lokalisierten Währungstext. */
  protected formatMoney(amount: string, currency: string): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return `${amount} ${currency}`;
    return new Intl.NumberFormat(activeLocale(), { style: 'currency', currency }).format(value);
  }
}
