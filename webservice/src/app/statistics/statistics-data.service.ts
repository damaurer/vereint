import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type {
  ClubStatistics,
  CrossEventStatistics,
  DrinkStatistics,
  EventStatistics,
  FeatureStatistics,
  GroupEventStatistics,
  MyStatistics,
  StatisticsDeleted,
  StatisticsOverview,
  StatisticsPeriodCode,
  StatisticsSettings,
} from '../api/api.types';
import { PERIODS } from './statistics-period';

/** `?zeitraum=30|90|jahr` wie in der Adresse der Seiten. */
function zeitraum(period: StatisticsPeriodCode): string {
  return `zeitraum=${PERIODS.find((entry) => entry.code === period)?.param ?? '90'}`;
}

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

  /** Eigene Statistik über alle eigenen Gruppen. */
  loadMine(period: StatisticsPeriodCode): Observable<MyStatistics> {
    return this.api.get<MyStatistics>(`/statistics/me?${zeitraum(period)}`);
  }

  /** Alle sichtbaren Events aus allen eigenen Gruppen. */
  loadCrossEvents(period: StatisticsPeriodCode): Observable<CrossEventStatistics> {
    return this.api.get<CrossEventStatistics>(`/statistics/events?${zeitraum(period)}`);
  }

  /** Events der gewählten Gruppe im Vergleich. */
  loadGroupEvents(period: StatisticsPeriodCode): Observable<GroupEventStatistics> {
    return this.api.get<GroupEventStatistics>(`/statistics/group-events?${zeitraum(period)}`);
  }

  /** Je Funktion: ausgelöst und Antworten. */
  loadFeatures(period: StatisticsPeriodCode): Observable<FeatureStatistics> {
    return this.api.get<FeatureStatistics>(`/statistics/features?${zeitraum(period)}`);
  }

  /** Alles innerhalb eines Events. */
  loadEvent(eventId: string): Observable<EventStatistics> {
    return this.api.get<EventStatistics>(`/events/${encodeURIComponent(eventId)}/statistics`);
  }

  loadMySettings(): Observable<StatisticsSettings> {
    return this.api.get<StatisticsSettings>('/me/statistics-settings');
  }

  saveMySettings(enabled: boolean): Observable<StatisticsSettings> {
    return this.api.put<StatisticsSettings>('/me/statistics-settings', { enabled });
  }

  deleteMine(): Observable<StatisticsDeleted> {
    return this.api.delete<StatisticsDeleted>('/me/statistics');
  }

  loadGroupSettings(): Observable<StatisticsSettings> {
    return this.api.get<StatisticsSettings>('/stammtisch/statistics-settings');
  }

  saveGroupSettings(enabled: boolean): Observable<StatisticsSettings> {
    return this.api.put<StatisticsSettings>('/stammtisch/statistics-settings', { enabled });
  }

  deleteGroup(): Observable<StatisticsDeleted> {
    return this.api.delete<StatisticsDeleted>('/stammtisch/statistics');
  }
}
