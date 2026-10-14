import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type { StatisticsView } from './statistics.types';

/**
 * Datenzugriff der Statistik-Oberfläche.
 *
 * Lädt die Vereinsstatistik aus dem Fachservice (`GET /statistics`). Sie steht
 * allen Angemeldeten offen; die Aggregate werden weder gecacht noch ins
 * SSR-HTML geschrieben (`AGENTS.md`).
 */
@Injectable({ providedIn: 'root' })
export class StatisticsDataService {
  private readonly api = inject(ApiClient);

  /** Vereinsstatistik der letzten Tage (Konsum, Zusagen, Umsatz, Rankings). */
  loadStatistics(): Observable<StatisticsView> {
    return this.api.get<StatisticsView>('/statistics');
  }
}
