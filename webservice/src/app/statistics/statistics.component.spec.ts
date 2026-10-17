import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { StatisticsComponent } from './statistics.component';
import { StatisticsDataService } from './statistics-data.service';
import type { StatisticsView } from './statistics.types';

const view: StatisticsView = {
  periodDays: 90,
  totalItems: 42,
  myItems: 9,
  myRank: 2,
  topConsumers: [
    { memberId: 'm-1', displayName: 'Max Mustermann', count: 18 },
    { memberId: 'm-2', displayName: 'Lisa Schmidt', count: 9 },
  ],
  attendancePercent: 83,
  spending: {
    total: '240.00',
    currency: 'EUR',
    changePercent: 14,
    weekly: ['10.00', '20.00', '0.00', '30.00', '40.00', '50.00', '60.00', '30.00'],
  },
  itemRanking: [{ name: 'Helles', count: 27, sharePercent: 64 }],
  topEvents: [{ eventId: 'e-1', title: 'Sommerfest', count: 30 }],
};

const emptyView: StatisticsView = {
  periodDays: 90,
  totalItems: 0,
  myItems: 0,
  myRank: null,
  topConsumers: [],
  attendancePercent: null,
  spending: {
    total: '0.00',
    currency: 'EUR',
    changePercent: null,
    weekly: ['0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00'],
  },
  itemRanking: [],
  topEvents: [],
};

describe('StatisticsComponent', () => {
  let data: { loadStatistics: ReturnType<typeof vi.fn> };

  const create = async (platform: unknown = 'browser') => {
    TestBed.configureTestingModule({
      imports: [StatisticsComponent],
      providers: [
        provideRouter([]),
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

  it('renders the real aggregates in the cards', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const text = html(fixture);

    expect(text).toContain('Gruppenstatistik');
    expect(text).toContain('letzten 90 Tage');
    expect(text).toContain('Max Mustermann');
    expect(text).toContain('18 Striche');
    expect(text).toContain('Platz 2');
    expect(text).toContain('83%');
    expect(text).toContain('240,00');
    expect(text).toContain('+14% gegenüber den 30 Tagen davor');
    expect(text).toContain('Helles');
    expect(text).toContain('64% (27 Stück)');
    expect(text).toContain('Sommerfest');
    expect(text).not.toContain('Rundengeber');

    expect(root.querySelectorAll('.bar-fill').length).toBe(2);
    expect(root.querySelectorAll('.trend-bar').length).toBe(8);
    expect(root.querySelector('.ring')).toBeTruthy();
    const link = root.querySelector<HTMLAnchorElement>('a.rank-link');
    expect(link?.getAttribute('href')).toBe('/events/e-1');
  });

  it('highlights the own rank in the leaderboard', async () => {
    const fixture = await create();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.bar-row');
    expect(rows[0].classList.contains('bar-row-me')).toBe(false);
    expect(rows[1].classList.contains('bar-row-me')).toBe(true);
    expect(rows[1].textContent).toContain('Du');
  });

  it('shows friendly texts for missing attendance and comparison values', async () => {
    data.loadStatistics.mockReturnValue(
      of({ ...view, attendancePercent: null, spending: { ...view.spending, changePercent: null } }),
    );
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.ring')).toBeNull();
    expect(root.querySelector('[data-testid="attendance-empty"]')).toBeTruthy();
    expect(html(fixture)).not.toContain('gegenüber den 30 Tagen davor');
  });

  it('shows an empty hint when there is no data at all', async () => {
    data.loadStatistics.mockReturnValue(of(emptyView));
    const fixture = await create();
    expect(html(fixture)).toContain('Noch keine Auswertungen');
    expect((fixture.nativeElement as HTMLElement).querySelector('.ring')).toBeNull();
  });

  it('shows card empty states when only some data exists', async () => {
    data.loadStatistics.mockReturnValue(of({ ...emptyView, attendancePercent: 50 }));
    const fixture = await create();
    const text = html(fixture);
    expect(text).toContain('noch keine Striche');
    expect(text).toContain('Noch keine Artikel verkauft.');
    expect(text).toContain('Noch keine Striche bei Events.');
    expect(text).toContain('keinen Umsatz');
    expect(text).toContain('50%');
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
    expect(root.querySelector('.ring')).toBeNull();
    expect(root.querySelector('.bar-fill')).toBeNull();
    expect(html(fixture)).not.toContain('83%');
    expect(data.loadStatistics).not.toHaveBeenCalled();
  });
});
