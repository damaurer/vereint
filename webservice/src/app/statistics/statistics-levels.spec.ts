import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type {
  CrossEventStatistics,
  EventComparison,
  EventStatistics,
  FeatureStatistics,
  GroupEventStatistics,
  MyStatistics,
} from '../api/api.types';
import { CrossEventStatisticsComponent, GroupEventStatisticsComponent } from './event-level-statistics.component';
import { EventStatisticsComponent, FeatureStatisticsComponent } from './feature-statistics.component';
import { MyStatisticsComponent } from './my-statistics.component';
import { StatisticsDataService } from './statistics-data.service';
import { countOf, rsvpLabel } from './statistics-levels';
import { StatisticsSettingsComponent } from './statistics-settings.component';

const row = (overrides: Partial<EventComparison> = {}): EventComparison => ({
  eventId: 'e-1',
  title: 'Sommerfest',
  startsAt: '2026-09-01T18:00:00Z',
  status: 'completed',
  statisticsEnabled: true,
  accepted: 4,
  maybe: 1,
  declined: 1,
  noAnswer: 2,
  invited: 8,
  attendees: 5,
  purchases: 21,
  rounds: 2,
  moments: 1,
  reactions: 6,
  chatMessages: 12,
  ...overrides,
});

const totals = { events: 2, attendances: 9, avgAttendees: 4.5, attendancePercent: 64, purchases: 30, purchasesPerEvent: 15, moments: 1 };

const mine: MyStatistics = {
  period: '90',
  from: '2026-08-12T00:00:00Z',
  days: 90,
  recording: { userEnabled: true, groupEnabled: null },
  total: 14,
  counts: [
    { feature: 'purchase', count: 9 },
    { feature: 'rsvp', count: 3 },
    { feature: 'chat_message', count: 2 },
  ],
  accepted: 2,
  attended: 3,
  groups: [
    { stammtischId: 's-1', stammtischName: 'Gruppe Nord', groupEnabled: true, total: 10, counts: [] },
    { stammtischId: 's-2', stammtischName: 'Gruppe Süd', groupEnabled: false, total: 4, counts: [] },
  ],
};

const cross: CrossEventStatistics = {
  period: '90',
  from: '2026-08-12T00:00:00Z',
  days: 90,
  recording: { userEnabled: true, groupEnabled: null },
  totals,
  myAttended: 2,
  myPurchases: 7,
  events: [row({ stammtischName: 'Gruppe Nord', myPurchases: 4, myRsvp: 'accepted' }), row({ eventId: 'e-2', title: 'Wanderung', statisticsEnabled: false, stammtischName: 'Gruppe Süd' })],
};

const group: GroupEventStatistics = {
  period: '30',
  from: '2026-10-12T00:00:00Z',
  days: 30,
  recording: { userEnabled: true, groupEnabled: true },
  totals,
  events: [row()],
};

const features: FeatureStatistics = {
  period: '90',
  from: '2026-08-12T00:00:00Z',
  days: 90,
  recording: { userEnabled: true, groupEnabled: true },
  features: [
    { feature: 'event', triggered: 3, responseFeature: 'rsvp', responses: 11, breakdown: [{ key: 'accepted', count: 7 }, { key: 'declined', count: 4 }] },
    { feature: 'purchase', triggered: 40, responseFeature: null, responses: 0, breakdown: [{ key: 'pwaBarcode', count: 10 }] },
  ],
};

const eventStats: EventStatistics = {
  eventId: 'e-1',
  title: 'Sommerfest',
  startsAt: '2026-09-01T18:00:00Z',
  recording: { userEnabled: true, groupEnabled: true, eventEnabled: true },
  accepted: 4,
  maybe: 1,
  declined: 1,
  noAnswer: 2,
  invited: 8,
  attendees: 5,
  purchases: 21,
  rounds: 2,
  moments: 1,
  reactions: 6,
  media: 3,
  chatMessages: 12,
  chatReactions: 4,
  topConsumers: [{ memberId: 'm-1', displayName: 'Jonas Keller', count: 8 }],
};

describe('statistics levels', () => {
  type Mock = ReturnType<typeof vi.fn>;
  let data: {
    loadMine: Mock;
    loadCrossEvents: Mock;
    loadGroupEvents: Mock;
    loadFeatures: Mock;
    loadEvent: Mock;
    loadMySettings: Mock;
    saveMySettings: Mock;
    deleteMine: Mock;
    loadGroupSettings: Mock;
    saveGroupSettings: Mock;
    deleteGroup: Mock;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const create = async (component: any, options: { platform?: string; params?: Record<string, string> } = {}) => {
    TestBed.configureTestingModule({
      imports: [component],
      providers: [
        provideRouter([]),
        { provide: StatisticsDataService, useValue: data },
        { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: new BehaviorSubject(convertToParamMap(options.params ?? {})),
            paramMap: new BehaviorSubject(convertToParamMap({ eventId: 'e-1' })),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (fixture: { nativeElement: unknown }) => root(fixture).textContent ?? '';
  const testid = (fixture: { nativeElement: unknown }, id: string) => root(fixture).querySelectorAll(`[data-testid="${id}"]`);

  beforeEach(() => {
    data = {
      loadMine: vi.fn(() => of(mine)),
      loadCrossEvents: vi.fn(() => of(cross)),
      loadGroupEvents: vi.fn(() => of(group)),
      loadFeatures: vi.fn(() => of(features)),
      loadEvent: vi.fn(() => of(eventStats)),
      loadMySettings: vi.fn(() => of({ enabled: true })),
      saveMySettings: vi.fn((enabled: boolean) => of({ enabled })),
      deleteMine: vi.fn(() => of({ deleted: 5 })),
      loadGroupSettings: vi.fn(() => of({ enabled: false })),
      saveGroupSettings: vi.fn((enabled: boolean) => of({ enabled })),
      deleteGroup: vi.fn(() => of({ deleted: 12 })),
    };
  });

  describe('helpers', () => {
    it('counts features and labels answers', () => {
      expect(countOf(mine.counts, 'purchase')).toBe(9);
      expect(countOf(mine.counts, 'moment')).toBe(0);
      expect(rsvpLabel(row())).toContain('4');
    });
  });

  describe('MyStatisticsComponent', () => {
    it('shows own figures by feature and group', async () => {
      const fixture = await create(MyStatisticsComponent, { params: { zeitraum: 'jahr' } });
      expect(data.loadMine).toHaveBeenCalledWith('year');
      expect(testid(fixture, 'mine-purchases')[0].textContent).toContain('9');
      expect(testid(fixture, 'mine-group').length).toBe(2);
      expect(text(fixture)).toContain('Gruppe Süd');
      expect(text(fixture)).toContain('Statistik aus');
      const link = root(fixture).querySelector<HTMLAnchorElement>('a.stats-link');
      expect(link?.getAttribute('href')).toBe('/statistik/events?zeitraum=jahr');
    });

    it('shows a hint when the own recording is off and nothing is recorded', async () => {
      data.loadMine = vi.fn(() => of({ ...mine, recording: { userEnabled: false }, total: 0, counts: [], groups: [] }));
      const fixture = await create(MyStatisticsComponent);
      expect(testid(fixture, 'recording-user-off').length).toBe(1);
      expect(testid(fixture, 'mine-empty').length).toBe(1);
    });

    it('shows an error with retry', async () => {
      data.loadMine = vi.fn(() => throwError(() => new ApiError(404, 'not_found', '')));
      const fixture = await create(MyStatisticsComponent);
      expect(text(fixture)).toContain('nicht gefunden');
    });

    it('does not load on the server', async () => {
      const fixture = await create(MyStatisticsComponent, { platform: 'server' });
      expect(data.loadMine).not.toHaveBeenCalled();
      expect(testid(fixture, 'ssr-placeholder').length).toBe(1);
    });
  });

  describe('CrossEventStatisticsComponent', () => {
    it('compares events across groups without links and with own values', async () => {
      const fixture = await create(CrossEventStatisticsComponent);
      expect(data.loadCrossEvents).toHaveBeenCalledWith('90');
      expect(testid(fixture, 'event-row').length).toBe(2);
      expect(testid(fixture, 'totals-events')[0].textContent).toContain('2');
      expect(testid(fixture, 'cross-mine')[0].textContent).toContain('7');
      expect(text(fixture)).toContain('Gruppe Nord');
      expect(text(fixture)).toContain('Meine Striche');
      expect(text(fixture)).toContain('Zugesagt');
      expect(root(fixture).querySelectorAll('.compare-row a').length).toBe(0);
    });
  });

  describe('GroupEventStatisticsComponent', () => {
    it('links each event to its statistics', async () => {
      const fixture = await create(GroupEventStatisticsComponent, { params: { zeitraum: '30' } });
      expect(data.loadGroupEvents).toHaveBeenCalledWith('30');
      const link = root(fixture).querySelector<HTMLAnchorElement>('.compare-row a');
      expect(link?.getAttribute('href')).toBe('/events/e-1/statistik');
      expect(text(fixture)).not.toContain('Meine Striche');
    });

    it('hides the figures when the group switch is off and nothing is left', async () => {
      data.loadGroupEvents = vi.fn(() => of({ ...group, recording: { userEnabled: true, groupEnabled: false }, events: [] }));
      const fixture = await create(GroupEventStatisticsComponent);
      expect(testid(fixture, 'recording-group-off').length).toBe(1);
      expect(testid(fixture, 'totals-events').length).toBe(0);
    });
  });

  describe('FeatureStatisticsComponent', () => {
    it('shows triggered and answered counts per feature', async () => {
      const fixture = await create(FeatureStatisticsComponent);
      expect(testid(fixture, 'feature-card').length).toBe(2);
      expect(text(fixture)).toContain('11');
      expect(text(fixture)).toContain('Antworten');
      expect(text(fixture)).toContain('Barcode-Kauf');
    });
  });

  describe('EventStatisticsComponent', () => {
    it('shows the figures of one event', async () => {
      const fixture = await create(EventStatisticsComponent);
      expect(data.loadEvent).toHaveBeenCalledWith('e-1');
      expect(testid(fixture, 'event-attendees')[0].textContent).toContain('5');
      expect(testid(fixture, 'event-purchases')[0].textContent).toContain('21');
      expect(text(fixture)).toContain('Jonas Keller');
      expect(root(fixture).querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('4');
    });

    it('marks an event without recording', async () => {
      data.loadEvent = vi.fn(() => of({ ...eventStats, recording: { userEnabled: true, groupEnabled: true, eventEnabled: false } }));
      const fixture = await create(EventStatisticsComponent);
      expect(testid(fixture, 'recording-event-off').length).toBe(1);
    });
  });

  describe('StatisticsSettingsComponent', () => {
    const settings = async (scope: 'mine' | 'group') => {
      TestBed.configureTestingModule({
        imports: [StatisticsSettingsComponent],
        providers: [provideRouter([]), { provide: StatisticsDataService, useValue: data }, { provide: PLATFORM_ID, useValue: 'browser' }],
      });
      const fixture = TestBed.createComponent(StatisticsSettingsComponent);
      fixture.componentRef.setInput('scope', scope);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    };
    const click = (fixture: { nativeElement: unknown; detectChanges(): void }, id: string) => {
      (testid(fixture, id)[0] as HTMLElement).click();
      fixture.detectChanges();
    };

    it('switches the own recording off', async () => {
      const fixture = await settings('mine');
      const box = testid(fixture, 'statistics-switch')[0] as HTMLInputElement;
      expect(box.checked).toBe(true);
      box.click();
      fixture.detectChanges();
      expect(data.saveMySettings).toHaveBeenCalledWith(false);
      expect(box.checked).toBe(false);
      expect(text(fixture)).toContain('Meine Statistik erfassen');
    });

    it('deletes the own records only after confirmation', async () => {
      const fixture = await settings('mine');
      click(fixture, 'statistics-delete');
      expect(data.deleteMine).not.toHaveBeenCalled();
      click(fixture, 'statistics-delete-confirm');
      expect(data.deleteMine).toHaveBeenCalled();
      expect(testid(fixture, 'statistics-message')[0].textContent).toContain('5');
    });

    it('uses the group endpoints for the group scope', async () => {
      const fixture = await settings('group');
      expect(data.loadGroupSettings).toHaveBeenCalled();
      expect((testid(fixture, 'statistics-switch')[0] as HTMLInputElement).checked).toBe(false);
      expect(text(fixture)).toContain('Statistik in dieser Gruppe');
      click(fixture, 'statistics-delete');
      click(fixture, 'statistics-delete-confirm');
      expect(data.deleteGroup).toHaveBeenCalled();
      expect(data.deleteMine).not.toHaveBeenCalled();
    });

    it('shows errors from saving', async () => {
      data.saveMySettings = vi.fn(() => throwError(() => new ApiError(403, 'permission_denied', '')));
      const fixture = await settings('mine');
      (testid(fixture, 'statistics-switch')[0] as HTMLInputElement).click();
      fixture.detectChanges();
      expect(testid(fixture, 'statistics-message')[0].textContent).toContain('fehlen die erforderlichen Rechte');
    });
  });
});
