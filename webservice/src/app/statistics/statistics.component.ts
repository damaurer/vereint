import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { AsyncState } from '../member/async-state';
import { InfoPanelComponent, StatCardComponent } from '../ui';
import { StatisticsDataService } from './statistics-data.service';
import type { MemberConsumption, StatisticsView } from './statistics.types';
import { StateComponent } from '../ui/state.component';

/**
 * Statistik- und Eber-Analytik-Oberfläche (TICKET-036).
 *
 * Setzt die Mockups `screen-/web-/tablet-statistiken` als responsives
 * Karten-Grid innerhalb der `AppShell` (TICKET-032) um: Bierkonsum je Mitglied,
 * Anwesenheitsquote-Ring, Ausgaben-Verlauf, Top-Rundengeber- und
 * Getränke-Ranking. Es werden die geteilten UI-Primitive (`StatCard`,
 * `InfoPanel`) aus `src/app/ui/` wiederverwendet.
 *
 * Statistiken sind Aggregate: Diagramme rendern ausschließlich clientseitig
 * (`isPlatformBrowser`); serverseitig erscheint nur ein neutraler Platzhalter,
 * niemals private Aggregate im SSR-HTML (`AGENTS.md`). Die Sichtbarkeit ist an
 * die Permission `statistics.view` gebunden; die Autorisierung bleibt beim Guard
 * und beim Fachservice (`deny by default`).
 */
@Component({
  selector: 'app-statistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateComponent, StatCardComponent, InfoPanelComponent],
  template: `
    <main class="page-shell">
      <section class="page-card stats-card" aria-label="Statistiken und Eber-Analytik">
        <header class="stats-head">
          <p class="stats-eyebrow">Statistiken</p>
          <h1 class="stats-title">Eber-Analytik</h1>
        </header>

        @if (!isBrowser) {
          <div class="state-card" role="status" aria-live="polite" data-testid="ssr-placeholder">
            <strong>Diagramme werden im Browser geladen</strong>
            <span>Aggregierte Auswertungen erscheinen erst nach dem Laden im Browser.</span>
          </div>
        } @else if (load.isLoading()) {
          <vereint-state
            kind="loading"
            title="Wird geladen …"
            message="Die Auswertungen werden abgerufen."
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            title="Statistiken nicht verfügbar"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as view) {
          @if (isEmpty(view)) {
            <vereint-state
              kind="empty"
              title="Noch keine Auswertungen"
              message="Sobald Käufe und Anwesenheiten erfasst sind, erscheinen hier Kennzahlen."
            />
          } @else {
            <div class="stats-grid">
              <article class="stats-panel stats-span" aria-label="Bierkonsum diesen Monat">
                <h2 class="stats-panel-title">Bierkonsum diesen Monat (Liter)</h2>
                <ul class="bar-list">
                  @for (row of view.consumption; track row.member) {
                    <li class="bar-row">
                      <span class="bar-name">{{ row.member }}</span>
                      <span class="bar-track">
                        <span
                          class="bar-fill"
                          [style.width.%]="barWidth(row, view.consumption)"
                        ></span>
                      </span>
                      <span class="bar-value">{{ row.liters }}L</span>
                    </li>
                  }
                </ul>
              </article>

              <article class="stats-panel" aria-label="Anwesenheitsquote">
                <h2 class="stats-panel-title">Anwesenheitsquote</h2>
                <div class="ring" [style.--ring-value]="view.attendancePercent" role="img"
                     [attr.aria-label]="'Anwesenheitsquote ' + view.attendancePercent + ' Prozent'">
                  <span class="ring-label">{{ view.attendancePercent }}%</span>
                </div>
              </article>

              <article class="stats-panel" aria-label="Ausgaben-Verlauf">
                <h2 class="stats-panel-title">Ausgaben-Verlauf</h2>
                <vereint-stat-card
                  label="Ausgaben diesen Monat"
                  [value]="formatMoney(view.spending.total, view.spending.currency)"
                  [hint]="trendHint(view.spending.changePercent)"
                />
                <div class="trend" aria-hidden="true">
                  @for (value of view.spending.trend; track $index) {
                    <span class="trend-bar" [style.height.%]="trendHeight(value, view.spending.trend)"></span>
                  }
                </div>
              </article>

              <vereint-info-panel class="stats-span" icon="crown" title="Top-Rundengeber">
                <ol class="rank-list">
                  @for (giver of view.topRounds; track giver.member) {
                    <li class="rank-row">
                      <span class="rank-name">{{ giver.member }}</span>
                      <span class="rank-value">{{ giver.rounds }} Runden</span>
                    </li>
                  }
                </ol>
              </vereint-info-panel>

              <vereint-info-panel class="stats-span" icon="beer" title="Getränke-Ranking">
                <ol class="rank-list">
                  @for (drink of view.drinkRanking; track drink.drink) {
                    <li class="rank-row">
                      <span class="rank-name">{{ drink.drink }}</span>
                      <span class="rank-value">{{ drink.sharePercent }}% Beliebtheit</span>
                    </li>
                  }
                </ol>
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

      .bar-row {
        display: grid;
        grid-template-columns: 4rem 1fr auto;
        align-items: center;
        gap: 0.6rem;
      }

      .bar-name {
        color: var(--color-text-muted);
        font-size: 0.9rem;
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

  /** Leerzustand, wenn keinerlei Aggregate vorliegen. */
  protected isEmpty(view: StatisticsView): boolean {
    return (
      view.consumption.length === 0 &&
      view.topRounds.length === 0 &&
      view.drinkRanking.length === 0
    );
  }

  /** Balkenbreite relativ zum Maximalkonsum (0–100 %). */
  protected barWidth(row: MemberConsumption, rows: MemberConsumption[]): number {
    const max = Math.max(...rows.map((entry) => entry.liters), 1);
    return Math.round((row.liters / max) * 100);
  }

  /** Balkenhöhe des Ausgaben-Trends relativ zum Maximum (0–100 %). */
  protected trendHeight(value: number, trend: number[]): number {
    const max = Math.max(...trend, 1);
    return Math.round((value / max) * 100);
  }

  /** Hinweistext zur Veränderung gegenüber dem Vormonat. */
  protected trendHint(changePercent: number): string {
    const sign = changePercent >= 0 ? '+' : '';
    return `${sign}${changePercent}% vs. Vormonat`;
  }

  /** Formatiert einen dezimalen Betrag als lokalisierten Währungstext. */
  protected formatMoney(amount: string, currency: string): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return `${amount} ${currency}`;
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(value);
  }
}
