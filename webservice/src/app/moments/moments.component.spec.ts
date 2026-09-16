import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type {
  EventSummary,
  MomentDetailDto,
  MomentSessionDto,
  MomentSummaryDto,
} from '../api/api.types';
import { MemberApiService } from '../member/member-api.service';
import { MomentsComponent } from './moments.component';

const mockEvents: EventSummary[] = [
  {
    id: 'e-1',
    title: 'Vereinsstammtisch',
    status: 'active',
    startsAt: '2026-09-16T18:00:00Z',
    endsAt: '2026-09-16T23:00:00Z',
    ownerId: 'u-1',
    ownerDisplayName: 'Max Mustermann',
  },
];

const mockSession: MomentSessionDto = {
  id: 'm-1',
  eventId: 'e-1',
  creatorId: 'u-1',
  creatorName: 'Max Mustermann',
  conversationId: 'conv-123',
  title: 'Stammtisch Anstoßen',
  topicType: 'toast',
  message: 'Prost Freunde!',
  latitude: 48.137,
  longitude: 11.575,
  active: true,
  responsesCount: 2,
  expiresAt: '2026-09-16T20:00:00Z',
  createdAt: '2026-09-16T18:30:00Z',
  summary: null,
};

const mockDetail: MomentDetailDto = {
  session: mockSession,
  responses: [
    {
      id: 'r-1',
      momentId: 'm-1',
      userId: 'u-1',
      userName: 'Max Mustermann',
      reaction: 'TOAST',
      statusText: 'Prost!',
      latitude: 48.137,
      longitude: 11.575,
      createdAt: '2026-09-16T18:30:00Z',
    },
  ],
  mapGeoJson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [11.575, 48.137] },
        properties: { userName: 'Max Mustermann', reaction: 'TOAST' },
      },
    ],
  },
};

const mockHistory: MomentSummaryDto[] = [
  {
    momentId: 'm-archived',
    title: 'Früheres Gebet',
    topicType: 'prayer',
    totalResponses: 4,
    uniqueParticipants: 3,
    summary: '3 Teilnehmer haben 4 Beiträge geteilt.',
    completedAt: '2026-09-10T19:00:00Z',
  },
];

describe('MomentsComponent', () => {
  let api: {
    listEvents: ReturnType<typeof vi.fn>;
    listMoments: ReturnType<typeof vi.fn>;
    getMomentDetail: ReturnType<typeof vi.fn>;
    startMoment: ReturnType<typeof vi.fn>;
    submitMomentResponse: ReturnType<typeof vi.fn>;
    completeMoment: ReturnType<typeof vi.fn>;
    listMomentHistory: ReturnType<typeof vi.fn>;
  };

  const createComponent = async (paramEventId: string | null = null, queryMomentId: string | null = null) => {
    TestBed.configureTestingModule({
      imports: [MomentsComponent],
      providers: [
        provideRouter([]),
        { provide: MemberApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (key: string) => (key === 'eventId' ? paramEventId : null) },
              queryParamMap: { get: (key: string) => (key === 'momentId' ? queryMomentId : null) },
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(MomentsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  beforeEach(() => {
    api = {
      listEvents: vi.fn(() => of(mockEvents)),
      listMoments: vi.fn(() => of([mockSession])),
      getMomentDetail: vi.fn(() => of(mockDetail)),
      startMoment: vi.fn(() => of(mockSession)),
      submitMomentResponse: vi.fn(() =>
        of({
          id: 'r-2',
          momentId: 'm-1',
          userId: 'u-2',
          userName: 'Lisa',
          reaction: 'CHEERS',
          statusText: 'Cheers!',
          latitude: null,
          longitude: null,
          createdAt: '2026-09-16T18:45:00Z',
        }),
      ),
      completeMoment: vi.fn(() =>
        of({
          momentId: 'm-1',
          title: 'Stammtisch Anstoßen',
          topicType: 'toast',
          totalResponses: 2,
          uniqueParticipants: 1,
          summary: '1 Teilnehmer hat 2 Beiträge geteilt.',
          completedAt: '2026-09-16T19:30:00Z',
        }),
      ),
      listMomentHistory: vi.fn(() => of(mockHistory)),
    };
  });

  it('loads events and active moments', async () => {
    const fixture = await createComponent();
    expect(api.listEvents).toHaveBeenCalled();
    expect(api.listMoments).toHaveBeenCalledWith('e-1');
    expect(api.getMomentDetail).toHaveBeenCalledWith('e-1', 'm-1');

    const text = html(fixture);
    expect(text).toContain('Stammtisch Anstoßen');
    expect(text).toContain('Gemeinsames Anstoßen');
    expect(text).toContain('Prost Freunde!');
    expect(text).toContain('24h-Chat');
    expect(text).toContain('Früheres Gebet');
  });

  it('handles route with direct eventId parameter', async () => {
    const fixture = await createComponent('e-1');
    expect(api.listMoments).toHaveBeenCalledWith('e-1');
    expect(html(fixture)).toContain('Stammtisch Anstoßen');
  });

  it('shows push notification alert banner when deep-linked with momentId query param', async () => {
    const fixture = await createComponent('e-1', 'm-1');
    expect(html(fixture)).toContain('Neuer Moment gestartet: „Stammtisch Anstoßen“');
    expect(html(fixture)).toContain('Jetzt Beitreten');
  });

  it('allows starting a new moment via modal', async () => {
    const fixture = await createComponent('e-1');
    const comp = fixture.componentInstance as any;

    comp.openStartModal();
    fixture.detectChanges();

    comp.newTitle = 'Abendgebet';
    comp.newTopicType = 'prayer';
    comp.newMessage = 'Gemeinsame Fürbitte';
    comp.newDurationMinutes = 30;
    comp.newConsent = false;

    comp.submitStartMoment();
    expect(api.startMoment).toHaveBeenCalledWith('e-1', {
      title: 'Abendgebet',
      topicType: 'prayer',
      message: 'Gemeinsame Fürbitte',
      durationMinutes: 30,
      consent: false,
      latitude: undefined,
      longitude: undefined,
    });
  });

  it('allows submitting multiple status responses and quick reactions', async () => {
    const fixture = await createComponent('e-1');
    const comp = fixture.componentInstance as any;

    // Quick reaction submission
    comp.submitQuickReaction('m-1', 'CHEERS');
    expect(api.submitMomentResponse).toHaveBeenCalledWith('e-1', 'm-1', {
      reaction: 'CHEERS',
      consent: false,
    });

    // Custom response form submission
    comp.openRespondModal('m-1');
    comp.respondReaction = 'PRAYER';
    comp.respondStatusText = 'Segenswünsche aus Hamburg';
    comp.respondConsent = false;

    comp.submitResponseForm();
    expect(api.submitMomentResponse).toHaveBeenCalledWith('e-1', 'm-1', {
      reaction: 'PRAYER',
      statusText: 'Segenswünsche aus Hamburg',
      consent: false,
      latitude: undefined,
      longitude: undefined,
    });
  });

  it('allows completing and archiving an active moment', async () => {
    const fixture = await createComponent('e-1');
    const comp = fixture.componentInstance as any;

    comp.completeMoment('m-1');
    expect(api.completeMoment).toHaveBeenCalledWith('e-1', 'm-1');
  });

  it('shows error state when moments API fails', async () => {
    api.listMoments.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await createComponent('e-1');
    expect(html(fixture)).toContain('Nicht verfügbar');
    expect(html(fixture)).toContain('Rechte');
  });
});
