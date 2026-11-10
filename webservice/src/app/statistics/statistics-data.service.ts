import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type {
  ClubStatistics,
  DrinkStatistics,
  StatisticsOverview,
  StatisticsPeriodCode,
} from '../api/api.types';

/**
 * Datenzugriff der Statistik-Seiten (Einstieg, Getränkestatistik, Übersicht).
 *
 * Alle Auswertungen kommen fertig aggregiert aus dem Fachservice; sie werden
 * weder gecacht noch ins SSR-HTML geschrieben (`AGENTS.md`).
 */
@Injectable({ providedIn: 'root' })
export class StatisticsDataService {
  private readonly api = inject(ApiClient);

  /** Einstieg: Striche, Platz, Rangliste und Zusagequote. */
  loadStatistics(period: StatisticsPeriodCode = '90'): Observable<ClubStatistics> {
    return this.api.get<ClubStatistics>(`/statistics?period=${period}`);
  }

  /** Getränkestatistik nach Mitglied oder nach Getränk. */
  loadDrinks(period: StatisticsPeriodCode, by: 'member' | 'drink'): Observable<DrinkStatistics> {
    return this.api.get<DrinkStatistics>(`/statistics/drinks?period=${period}&by=${by}`);
  }

  /** Alle Kennzahlen der Gruppe. */
  loadOverview(period: StatisticsPeriodCode): Observable<StatisticsOverview> {
    return this.api.get<StatisticsOverview>(`/statistics/overview?period=${period}`);
  }
}
