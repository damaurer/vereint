import { firstValueFrom } from 'rxjs';
import { StatisticsDataService } from './statistics-data.service';

describe('StatisticsDataService', () => {
  it('provides consistent sample aggregates for every card', async () => {
    const service = new StatisticsDataService();
    const view = await firstValueFrom(service.loadStatistics());

    expect(view.consumption.length).toBeGreaterThan(0);
    expect(view.attendancePercent).toBeGreaterThanOrEqual(0);
    expect(view.attendancePercent).toBeLessThanOrEqual(100);
    expect(view.spending.trend.length).toBeGreaterThan(0);
    expect(view.topRounds.length).toBeGreaterThan(0);
    expect(view.drinkRanking.length).toBeGreaterThan(0);

    // Rankings are ordered descending so the presentation stays stable.
    const rounds = view.topRounds.map((entry) => entry.rounds);
    expect([...rounds].sort((a, b) => b - a)).toEqual(rounds);
    const shares = view.drinkRanking.map((entry) => entry.sharePercent);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
  });
});
