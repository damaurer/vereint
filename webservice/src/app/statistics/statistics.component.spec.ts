import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { ClubStatistics, DrinkStatistics, StatisticsOverview } from '../api/api.types';
import { DrinkStatisticsComponent } from './drink-statistics.component';
import { StatisticsDataService } from './statistics-data.service';
import { StatisticsOverviewComponent } from './statistics-overview.component';
import { periodFromParams, periodQuery } from './statistics-period';
import { StatisticsComponent } from './statistics.component';

const view: ClubStatistics = {
  period: '90',
  from: '2026-08-12T00:00:00Z',
  days: 90,
  totalItems: 42,
  myItems: 9,
  myRank: 2,
  rankedMembers: 7,
  topConsumers: [
    { memberId: 'm-1', displayName: 'Max Mustermann', count: 18 },
    { memberId: 'm-2', displayName: 'Lisa Schmidt', count: 9 },
  ],
  attendancePercent: 83,
};

const drinks: DrinkStatistics = {
  period: '90',
  from: '2026-08-12T00:00:00Z',
  days: 90,
  totalDrinks: 125,
  liters: 53.6,
  kcal: 17335,
  withoutVolume: 0,
  withoutKcal: 3,
  averages: { perEvent: 20.8, perDay: 1.4, perWeek: 9.7, perMonth: 42.2 },
  by: 'member',
  members: [
    {
      rank: 1,
      memberId: 'm-1',
      displayName: 'Jonas Keller',
      count: 28,
      kcal: 4760,
      liters: 12.5,
      perEvent: 4.7,
      perWeek: 2.2,
      categories: [
        { category: 'beer', count: 20 },
        { category: 'nonAlcoholic', count: 8 },
      ],
      drinks: [
        { name: 'Helles', volumeMl: 500, count: 14, kcal: 3010 },
        { name: 'Obstler', volumeMl: 20, count: 1, kcal: null },
      ],
    },
    {
      rank: 2,
      memberId: 'm-2',
      displayName: 'Sabine Wolf',
      count: 24,
      kcal: 5200,
      liters: 10,
      perEvent: 4,
      perWeek: 1.9,
      categories: [{ category: 'beer', count: 24 }],
      drinks: [],
    },
  ],
  drinks: [],
};

const byDrink: DrinkStatistics = {
  ...drinks,
  by: 'drink',
  members: [],
  drinks: [
    { rank: 1, name: 'Helles', category: 'beer', volumeMl: 500, count: 40, liters: 20, kcal: 8400, members: 5, perEvent: 6.7 },
    { rank: 2, name: 'Obstler', category: 'spirits', volumeMl: 20, count: 11, liters: 0.2, kcal: null, members: 3, perEvent: 1.8 },
  ],
};

const overview: StatisticsOverview = {
  period: '90',
  from: '2026-08-12T00:00:00Z',
  days: 90,
  kpis: {
    members: 7,
    activeMembers: 6,
    newMembers: 1,
    events: 6,
    avgParticipants: 5.2,
    attendancePercent: 67,
    drinks: 125,
    drinksPerEvent: 20.8,
    liters: 53.6,
    litersPerWeek: 4.2,
    kcal: 17665,
    kcalPerMember: 2524,
    revenue: null,
    revenuePerEvent: null,
    currency: 'EUR',
    drinksPerMonth: 42.2,
    withoutVolume: 2,
    withoutKcal: 4,
  },
  rsvpByEvent: [
    { eventId: 'e-1', title: 'Sommerfest', startsAt: '2026-09-01T18:00:00Z', accepted: 5, maybe: 1, declined: 1, noAnswer: 0, invited: 7 },
  ],
  rsvpByMember: [
    { memberId: 'm-1', displayName: 'Thomas Berger', accepted: 6, maybe: 0, declined: 0, attended: 6, invited: 6, quotePercent: 100 },
  ],
  weekly: [4, 0, 12, 9],
  weekdays: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ key: String(day), count: day })),
  hours: ['lt18', '18', '19', '20', '21', '22', 'ge23'].map((key, index) => ({ key, count: index })),
  whoDrinksWhat: drinks.members,
  topDrinks: [{ name: 'Helles 0,5 l', count: 40, perEvent: 6.7 }],
  categories: [
    { category: 'beer', count: 60, sharePercent: 48, liters: 30, kcal: 13200 },
    { category: 'nonAlcoholic', count: 45, sharePercent: 36, liters: 22.5, kcal: 3150 },
  ],
  roundGivers: [{ memberId: 'm-1', displayName: 'Thomas Berger', count: 5 }],
  moments: { started: 9, reactions: 64, media: 23 },
  chat: { messages: 412, mostActive: 'Jonas Keller', eventChats: 6 },
  records: {
    mostDrinksEvening: { label: 'Sommerfest', value: 41 },
    longestStreak: { label: 'Thomas Berger', value: 6 },
    fastestRsvp: { label: 'Sabine Wolf', value: 4 },
  },
};

describe('statistics pages', () => {
  let data: {
    loadStatistics: ReturnType<typeof vi.fn>;
    loadDrinks: ReturnType<typeof vi.fn>;
    loadOverview: ReturnType<typeof vi.fn>;
  };
  let initialPeriod: string | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const create = async (component: any, platform: unknown = 'browser') => {
    TestBed.configureTestingModule({
      imports: [component],
      providers: [
        provideRouter([]),
        { provide: StatisticsDataService, useValue: data },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    if (initialPeriod) await setPeriod(initialPeriod);
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  /** Zeitraum in die Adresse schreiben, wie es der Umschalter tut. */
  const setPeriod = (value: string) =>
    TestBed.inject(Router).navigate([], { queryParams: { zeitraum: value } });

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (fixture: { nativeElement: unknown }) => root(fixture).textContent ?? '';

  beforeEach(() => {
    initialPeriod = null;
    data = {
      loadStatistics: vi.fn(() => of(view)),
      loadDrinks: vi.fn((_period: string, by: string) => of(by === 'drink' ? byDrink : drinks)),
      loadOverview: vi.fn(() => of(overview)),
    };
  });

  describe('period helpers', () => {
    it('reads the period from the address and defaults to 90 days', () => {
      expect(periodFromParams(convertToParamMap({ zeitraum: '30' }))).toBe('30');
      expect(periodFromParams(convertToParamMap({ zeitraum: 'jahr' }))).toBe('year');
      expect(periodFromParams(convertToParamMap({ zeitraum: 'quatsch' }))).toBe('90');
      expect(periodFromParams(convertToParamMap({}))).toBe('90');
      expect(periodQuery('year')).toEqual({ zeitraum: 'jahr' });
    });
  });

  describe('StatisticsComponent', () => {
    it('shows links, period switch, figures, leaderboard and rsvp rate', async () => {
      const fixture = await create(StatisticsComponent);
      const page = text(fixture);

      expect(page).toContain('Gruppenstatistik');
      expect(page).toContain('Getränkestatistik: wer, was, wie viel, kcal');
      expect(page).toContain('Alle Statistiken im Überblick');
      expect(page).toContain('30 Tage');
      expect(page).toContain('Dieses Jahr');
      expect(page).toContain('Letzte 90 Tage');
      expect(page).toContain('Max Mustermann');
      expect(page).toContain('18 Striche');
      expect(page).toContain('von 7');
      expect(page).toContain('83');
      expect(page).not.toContain('Umsatz');
      expect(data.loadStatistics).toHaveBeenCalledWith('90');

      expect(root(fixture).querySelectorAll('.bar-fill').length).toBe(2);
      expect(root(fixture).querySelector('.ring')?.getAttribute('aria-label')).toContain('83');
      const links = [...root(fixture).querySelectorAll<HTMLAnchorElement>('a.stats-link')].map((a) => a.getAttribute('href'));
      expect(links).toEqual(['/statistik/getraenke?zeitraum=90', '/statistik/uebersicht?zeitraum=90']);
    });

    it('highlights the own row', async () => {
      const fixture = await create(StatisticsComponent);
      const rows = root(fixture).querySelectorAll('.bar-row');
      expect(rows[0].classList.contains('bar-row-me')).toBe(false);
      expect(rows[1].classList.contains('bar-row-me')).toBe(true);
      expect(rows[1].textContent).toContain('Du');
    });

    it('reloads with the period from the address and keeps it in the links', async () => {
      const fixture = await create(StatisticsComponent);
      await setPeriod('jahr');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(data.loadStatistics).toHaveBeenLastCalledWith('year');
      const active = root(fixture).querySelector('.stats-segment.is-active');
      expect(active?.textContent).toContain('Dieses Jahr');
      expect(root(fixture).querySelector<HTMLAnchorElement>('a.stats-link')?.getAttribute('href')).toBe(
        '/statistik/getraenke?zeitraum=jahr',
      );
    });

    it('shows friendly texts without data', async () => {
      data.loadStatistics.mockReturnValue(
        of({ ...view, totalItems: 0, myItems: 0, myRank: null, rankedMembers: 0, topConsumers: [], attendancePercent: null }),
      );
      const fixture = await create(StatisticsComponent);
      expect(text(fixture)).toContain('noch keine Striche');
      expect(root(fixture).querySelector('[data-testid="attendance-empty"]')).toBeTruthy();
      expect(root(fixture).querySelector('.ring')).toBeNull();
    });

    it('shows a neutral retry state on error', async () => {
      data.loadStatistics.mockReturnValue(throwError(() => new ApiError(503, 'service_unavailable', '')));
      const fixture = await create(StatisticsComponent);
      expect(text(fixture)).toContain('nicht verfügbar');
    });

    it('asks for the terms when the service demands consent', async () => {
      data.loadStatistics.mockReturnValue(throwError(() => new ApiError(403, 'terms_required', '')));
      const fixture = await create(StatisticsComponent);
      expect(text(fixture)).toContain('AGB');
    });

    it('renders only a neutral placeholder on the server', async () => {
      const fixture = await create(StatisticsComponent, 'server');
      expect(root(fixture).querySelector('[data-testid="ssr-placeholder"]')).toBeTruthy();
      expect(text(fixture)).not.toContain('Max Mustermann');
      expect(data.loadStatistics).not.toHaveBeenCalled();
    });
  });

  describe('DrinkStatisticsComponent', () => {
    it('shows totals, averages and members with their drinks', async () => {
      const fixture = await create(DrinkStatisticsComponent);
      const page = text(fixture);

      expect(page).toContain('Getränkestatistik');
      expect(page).toContain('125');
      expect(page).toContain('53,6');
      expect(page).toContain('17.335');
      expect(page).toContain('ohne Angabe bei 3 Getränken');
      expect(root(fixture).querySelector('[data-testid="without-volume"]')).toBeNull();
      expect(page).toContain('20,8');
      expect(page).toContain('je Monat');
      expect(page).toContain('Jonas Keller');
      expect(page).toContain('4.760');
      // Der erste Eintrag ist aufgeklappt.
      expect(page).toContain('14 × Helles 0,5 l');
      expect(page).toContain('1 × Obstler 2 cl');
      expect(page).toContain('ohne Angabe');
      expect(page).toContain('Bier');
      expect(page).toContain('Alkoholfrei');
      expect(data.loadDrinks).toHaveBeenCalledWith('90', 'member');

      const bar = root(fixture).querySelector('.drink-item .bar-track');
      expect(bar?.getAttribute('aria-label')).toBe('Bier: 20, Alkoholfrei: 8');
    });

    it('sorts by calories on request', async () => {
      const fixture = await create(DrinkStatisticsComponent);
      const names = () => [...root(fixture).querySelectorAll('.drink-name')].map((el) => el.textContent?.trim());
      expect(names()).toEqual(['Jonas Keller', 'Sabine Wolf']);

      root(fixture).querySelector<HTMLButtonElement>('[data-testid="sort"]')!.click();
      fixture.detectChanges();
      expect(names()).toEqual(['Sabine Wolf', 'Jonas Keller']);
      expect(root(fixture).querySelector('[data-testid="sort"]')?.textContent).toContain('Nach Kalorien');
    });

    it('switches to the view by drink', async () => {
      const fixture = await create(DrinkStatisticsComponent);
      const buttons = root(fixture).querySelectorAll<HTMLButtonElement>('.drink-toolbar .stats-segment');
      buttons[1].click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(data.loadDrinks).toHaveBeenLastCalledWith('90', 'drink');
      expect(text(fixture)).toContain('Helles 0,5 l');
      expect(text(fixture)).toContain('5 Personen');
      expect(text(fixture)).toContain('Schnaps');
    });

    it('expands and collapses a member', async () => {
      const fixture = await create(DrinkStatisticsComponent);
      const heads = root(fixture).querySelectorAll<HTMLButtonElement>('button.drink-head');
      expect(heads[0].getAttribute('aria-expanded')).toBe('true');
      heads[0].click();
      fixture.detectChanges();
      expect(root(fixture).querySelector('button.drink-head')?.getAttribute('aria-expanded')).toBe('false');
      expect(text(fixture)).not.toContain('14 × Helles');
    });
  });

  describe('StatisticsOverviewComponent', () => {
    it('renders every section of the overview', async () => {
      const fixture = await create(StatisticsOverviewComponent);
      const page = text(fixture);

      for (const heading of ['Statistik-Übersicht', 'Events & Zusagen', 'Trinkverhalten', 'Getränke', 'Gemeinschaft']) {
        expect(page).toContain(heading);
      }
      expect(page).toContain('6 aktiv · 1 neu');
      expect(page).toContain('Ø 5,2 Teilnehmende');
      expect(page).toContain('67 %');
      expect(page).toContain('5 von 7 zugesagt');
      expect(page).toContain('Thomas Berger');
      expect(page).toContain('Da gewesen');
      expect(page).toContain('Wann wird getrunken?');
      expect(page).toContain('Wer trinkt was?');
      expect(page).toContain('28 Getränke · 4.760 kcal');
      expect(page).toContain('40 · Ø 6,7/Event');
      expect(page).toContain('Anteil nach Kategorie');
      expect(page).toContain('5 Runden');
      expect(page).toContain('412');
      expect(page).toContain('Sommerfest · 41 Getränke');
      expect(page).toContain('Thomas Berger · 6 Events');
      expect(page).toContain('Sabine Wolf · nach 4 Min');
      expect(root(fixture).querySelector('[data-testid="without-values"]')?.textContent).toContain('2 Getränke');
      expect(root(fixture).querySelectorAll('.column').length).toBe(4);
    });

    it('gives every chart a text alternative', async () => {
      const fixture = await create(StatisticsOverviewComponent);
      const labels = [...root(fixture).querySelectorAll('[role="img"]')].map((el) => el.getAttribute('aria-label'));
      expect(labels.length).toBeGreaterThanOrEqual(4);
      expect(labels.every((label) => !!label && label.length > 0)).toBe(true);
      expect(labels).toContain('Zugesagt: 5, Vielleicht: 1, Abgesagt: 1, Keine Antwort: 0');
    });

    it('shows the weekly average and the value of a hovered week', async () => {
      const fixture = await create(StatisticsOverviewComponent);
      const value = () => root(fixture).querySelector('[data-testid="weekly-value"]')?.textContent?.trim();
      expect(value()).toBe('Ø 6,3 je Woche');

      root(fixture).querySelectorAll('.column')[2].dispatchEvent(new Event('mouseenter'));
      fixture.detectChanges();
      expect(value()).toBe('12 in dieser Woche');
    });

    it('hides the revenue unless the service delivers it', async () => {
      let fixture = await create(StatisticsOverviewComponent);
      expect(root(fixture).querySelector('[data-testid="revenue"]')).toBeNull();
      expect(text(fixture)).not.toContain('Umsatz');

      TestBed.resetTestingModule();
      data.loadOverview.mockReturnValue(
        of({ ...overview, kpis: { ...overview.kpis, revenue: 388, revenuePerEvent: 65 } }),
      );
      fixture = await create(StatisticsOverviewComponent);
      expect(root(fixture).querySelector('[data-testid="revenue"]')?.textContent).toContain('388');
    });

    it('loads the period from the address', async () => {
      initialPeriod = '30';
      await create(StatisticsOverviewComponent);
      expect(data.loadOverview).toHaveBeenLastCalledWith('30');
    });
  });
});
