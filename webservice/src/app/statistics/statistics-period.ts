import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ParamMap } from '@angular/router';
import type { DrinkCategoryGroup, StatisticsPeriodCode } from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { activeLocale } from '../i18n/i18n.service';

/**
 * Zeitraum aller Statistikseiten. In der Adresse steht er als `?zeitraum=30`,
 * `?zeitraum=90` oder `?zeitraum=jahr` (laufendes Kalenderjahr), damit er beim
 * Wechsel zwischen den Seiten erhalten bleibt; der Fachservice erwartet
 * `period=30|90|year`.
 */
export const PERIOD_PARAM = 'zeitraum';

export const PERIODS: readonly { code: StatisticsPeriodCode; param: string; labelKey: string }[] = [
  { code: '30', param: '30', labelKey: 'statistics.period.days30' },
  { code: '90', param: '90', labelKey: 'statistics.period.days90' },
  { code: 'year', param: 'jahr', labelKey: 'statistics.period.year' },
];

/** Zeitraum aus der Adresse; unbekannt oder fehlend heißt 90 Tage. */
export function periodFromParams(params: ParamMap): StatisticsPeriodCode {
  const value = params.get(PERIOD_PARAM);
  return PERIODS.find((period) => period.param === value)?.code ?? '90';
}

/** Query-Parameter, der den Zeitraum beim Navigieren mitnimmt. */
export function periodQuery(period: StatisticsPeriodCode): Record<string, string> {
  return { [PERIOD_PARAM]: PERIODS.find((entry) => entry.code === period)?.param ?? '90' };
}

/** Kurztext des Zeitraums für Überschriften („letzte 90 Tage“, „dieses Jahr“). */
export function periodLabelKey(period: StatisticsPeriodCode): string {
  return period === 'year' ? 'statistics.period.thisYear' : 'statistics.period.lastDays';
}

/** Feste Reihenfolge und Farbe der Kategoriegruppen (nur Tokens aus `styles.css`). */
export const CATEGORY_COLORS: Record<DrinkCategoryGroup, string> = {
  beer: 'var(--color-brand)',
  nonAlcoholic: 'var(--vereint-teal)',
  spirits: 'var(--vereint-violet)',
  wineSparkling: 'var(--color-accent)',
  other: 'var(--color-text-muted)',
};

export const CATEGORY_ORDER: readonly DrinkCategoryGroup[] = ['beer', 'nonAlcoholic', 'spirits', 'wineSparkling', 'other'];

/** Zahl im Format der aktiven Sprache, mit höchstens `digits` Nachkommastellen. */
export function formatNumber(value: number | string | null | undefined, digits = 0): string {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat(activeLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(number) ? number : 0);
}

/** Betrag als Währungstext. */
export function formatMoney(value: number | string | null | undefined, currency: string): string {
  const number = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(activeLocale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(number);
  } catch {
    return `${formatNumber(number)} ${currency}`;
  }
}

/** Anteil in Prozent (0–100) relativ zum Höchstwert, für Balkenbreiten. */
export function share(value: number, max: number): number {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

/**
 * Umschalter für den Zeitraum. Links statt Knöpfe: Der Zeitraum steht in der
 * Adresse und gilt so für alle drei Seiten.
 */
@Component({
  selector: 'app-statistics-period',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  template: `
    <nav class="stats-segmented" [attr.aria-label]="'statistics.period.label' | t">
      @for (option of periods; track option.code) {
        <a
          class="stats-segment"
          [class.is-active]="option.code === period()"
          [attr.aria-current]="option.code === period() ? 'true' : null"
          [routerLink]="[]"
          [queryParams]="query(option.code)"
          queryParamsHandling="merge"
          replaceUrl
          >{{ option.labelKey | t }}</a
        >
      }
    </nav>
  `,
  styleUrl: './statistics.css',
  host: { style: 'display: block' },
})
export class StatisticsPeriodComponent {
  readonly period = input<StatisticsPeriodCode>('90');
  protected readonly periods = PERIODS;
  protected query(code: StatisticsPeriodCode): Record<string, string> {
    return periodQuery(code);
  }
}
