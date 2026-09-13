import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { StatisticsComponent } from './statistics.component';
import { StatisticsDataService } from './statistics-data.service';
import type { StatisticsView } from './statistics.types';

const view: StatisticsView = {
  consumption: [
    { member: 'Max M.', liters: 18 },
    { member: 'Lisa S.', liters: 12 },
  ],
  attendancePercent: 83,
  spending: { total: '240.00', currency: 'EUR', changePercent: 14, trend: [3, 5, 7] },
  topRounds: [{ member: 'Sebastian Müller', rounds: 12 }],
  drinkRanking: [{ drink: 'Helles (Augustiner)', sharePercent: 64 }],
};

describe('StatisticsComponent', () => {
  let data: { loadStatistics: ReturnType<typeof vi.fn> };

  const create = async (platform: unknown = 'browser') => {
    TestBed.configureTestingModule({
      imports: [StatisticsComponent],
      providers: [
        { provide: StatisticsDataService, useValue: data },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    const fixture = TestBed.createComponent(StatisticsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    data = { loadStatistics: vi.fn(() => of(view)) };
  });

  it('renders the aggregate cards with values and reuses ui primitives', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;

    expect(html(fixture)).toContain('Eber-Analytik');
    expect(html(fixture)).toContain('Bierkonsum diesen Monat');
    expect(html(fixture)).toContain('83%');
    expect(html(fixture)).toContain('12 Runden');
    expect(html(fixture)).toContain('64% Beliebtheit');
    expect(html(fixture)).toContain('240,00');

    // Shared ui/ primitives instead of bespoke markup.
    expect(root.querySelector('vereint-stat-card')).toBeTruthy();
    expect(root.querySelectorAll('vereint-info-panel').length).toBe(2);
    expect(root.querySelectorAll('.bar-fill').length).toBe(2);
    expect(root.querySelector('.ring')).toBeTruthy();
  });

  it('shows an empty hint when there are no aggregates', async () => {
    data.loadStatistics.mockReturnValue(
      of({
        consumption: [],
        attendancePercent: 0,
        spending: { total: '0.00', currency: 'EUR', changePercent: 0, trend: [] },
        topRounds: [],
        drinkRanking: [],
      } satisfies StatisticsView),
    );
    const fixture = await create();
    expect(html(fixture)).toContain('Noch keine Auswertungen');
    expect((fixture.nativeElement as HTMLElement).querySelector('.ring')).toBeNull();
  });

  it('shows a neutral retry state on error without leaking data', async () => {
    data.loadStatistics.mockReturnValue(
      throwError(() => new ApiError(503, 'service_unavailable', '')),
    );
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
    expect((fixture.nativeElement as HTMLElement).querySelector('.ring')).toBeNull();
  });

  it('renders only a neutral placeholder on the server (no private aggregates)', async () => {
    const fixture = await create('server');
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="ssr-placeholder"]')).toBeTruthy();
    expect(html(fixture)).toContain('im Browser');
    // Aggregates must never render server-side.
    expect(root.querySelector('.ring')).toBeNull();
    expect(root.querySelector('.bar-fill')).toBeNull();
    expect(html(fixture)).not.toContain('83%');
    expect(data.loadStatistics).not.toHaveBeenCalled();
  });
});
