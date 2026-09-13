/**
 * Präsentations-Datenverträge der Statistik-Oberfläche (TICKET-036).
 *
 * Statistiken sind Aggregate: Sie werden nicht gecacht und nicht ins SSR-HTML
 * geschrieben (`AGENTS.md`). Diese Formen beschreiben ausschließlich die für die
 * Karten benötigten Anzeigedaten; sie bilden keine Server-Endpunkte ab.
 */

/** Bierkonsum eines Mitglieds im Betrachtungszeitraum. */
export interface MemberConsumption {
  /** Anzeigename (bzw. Kurzform) des Mitglieds. */
  member: string;
  /** Konsum in Litern. */
  liters: number;
}

/** Ausgaben-Verlauf: Summe, Veränderung und Balkentrend. */
export interface SpendingTrend {
  /** Gesamtausgaben im Zeitraum als dezimale Zeichenkette. */
  total: string;
  /** Währung (ISO-Code). */
  currency: string;
  /** Veränderung gegenüber Vormonat in Prozent (z. B. `14` für +14 %). */
  changePercent: number;
  /** Relative Balkenwerte des Verlaufs (jüngster Wert zuletzt). */
  trend: number[];
}

/** Ranglisteneintrag der Top-Rundengeber. */
export interface RoundGiver {
  /** Anzeigename des Mitglieds. */
  member: string;
  /** Anzahl spendierter Runden. */
  rounds: number;
}

/** Ranglisteneintrag des Getränke-Rankings. */
export interface DrinkRankingEntry {
  /** Getränkename inkl. Marke. */
  drink: string;
  /** Beliebtheit in Prozent (Anteil aller Bestellungen). */
  sharePercent: number;
}

/**
 * Aggregierte Anzeigedaten der Statistik-Oberfläche.
 */
export interface StatisticsView {
  /** Bierkonsum je Mitglied (Liter) für die Balkenreihe. */
  consumption: MemberConsumption[];
  /** Anwesenheitsquote in Prozent (0–100) für den Ring. */
  attendancePercent: number;
  /** Ausgaben-Verlauf für Summe und Trend. */
  spending: SpendingTrend;
  /** Top-Rundengeber, absteigend sortiert. */
  topRounds: RoundGiver[];
  /** Getränke-Ranking, absteigend sortiert. */
  drinkRanking: DrinkRankingEntry[];
}
