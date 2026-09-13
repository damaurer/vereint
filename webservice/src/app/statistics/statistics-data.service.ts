import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import type { StatisticsView } from './statistics.types';

/**
 * Datenzugriff der Statistik-Oberfläche (TICKET-036).
 *
 * ABWEICHUNG (dokumentiert im Ticket): Der Fachservice stellt aktuell keine
 * fachlichen Statistik-/Aggregat-Endpunkte für Konsum, Anwesenheit,
 * Ausgaben-Verlauf oder Rankings bereit (siehe `src/app/api/api.types.ts` und
 * die vorhandenen `*-api.service.ts`). Damit die Oberfläche gemäß Mockups
 * umgesetzt und getestet werden kann, liefert dieser Service clientseitige
 * Beispiel-Aggregate. Es werden bewusst KEINE neuen Server-Endpunkte erfunden;
 * sobald der Fachservice Aggregate bereitstellt, wird hier ausschließlich der
 * Aufruf ergänzt (analog zu `MemberApiService`).
 *
 * Aggregate werden weder gecacht noch ins SSR-HTML geschrieben (`AGENTS.md`);
 * die eigentliche Autorisierung bleibt beim Guard und beim Fachservice
 * (`deny by default`).
 */
@Injectable({ providedIn: 'root' })
export class StatisticsDataService {
  /** Beispiel-Aggregate für die Statistik-Karten. */
  loadStatistics(): Observable<StatisticsView> {
    return of({
      consumption: [
        { member: 'Max M.', liters: 18 },
        { member: 'Lisa S.', liters: 12 },
        { member: 'Seb. M.', liters: 9 },
        { member: 'Tob. W.', liters: 7 },
        { member: 'Marie K.', liters: 4 },
      ],
      attendancePercent: 83,
      spending: {
        total: '240.00',
        currency: 'EUR',
        changePercent: 14,
        trend: [3, 4, 4, 5, 6, 5, 7],
      },
      topRounds: [
        { member: 'Sebastian Müller', rounds: 12 },
        { member: 'Max Mustermann', rounds: 9 },
      ],
      drinkRanking: [
        { drink: 'Helles (Augustiner)', sharePercent: 64 },
        { drink: 'Weißbier (Franziskaner)', sharePercent: 22 },
      ],
    });
  }
}
