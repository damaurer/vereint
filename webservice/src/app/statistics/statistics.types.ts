import type { ClubStatistics } from '../api/api.types';

/**
 * Anzeigedaten der Statistik-Oberfläche. Sie entsprechen direkt der Antwort von
 * `GET /api/v1/statistics` (siehe `ClubStatistics`).
 */
export type StatisticsView = ClubStatistics;

/** Eintrag der Konsum-Rangliste. */
export type TopConsumer = ClubStatistics['topConsumers'][number];

/** Eintrag der Artikel-Beliebtheit. */
export type ItemRankingEntry = ClubStatistics['itemRanking'][number];

/** Event mit den meisten Strichen. */
export type TopEvent = ClubStatistics['topEvents'][number];
