import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type {
  EventSummary,
  MomentConfigDto,
  MomentDetailDto,
  MomentSessionDto,
  MomentSummaryDto,
} from '../api/api.types';
import { AuthService } from '../auth/auth.service';
import { MemberApiService } from '../member/member-api.service';
import { MomentMediaUploader } from './moment-media';
import { By } from '@angular/platform-browser';
import { MomentRespondDialogComponent } from './moment-respond-dialog.component';
import { MomentStartDialogComponent } from './moment-start-dialog.component';
import { MomentsComponent } from './moments.component';

const uploader = {
  prepare: vi.fn(async (file: File) => ({
    kind: file.type.startsWith('video/') ? 'video' : 'image',
    blob: file,
    contentType: file.type,
    previewUrl: `blob:${file.name}`,
    name: file.name,
  })),
  upload: vi.fn((_m: string, media: { name: string }, _lang: string, onProgress: (f: number) => void) => {
    onProgress(1);
    return { result: Promise.resolve({ id: `media-${media.name}` }), abort: () => undefined };
  }),
};

const mockConfig: MomentConfigDto = {
  types: [
    {
      id: 't-1',
      code: 'toast',
      name: 'Gemeinsames Anstoßen',
      emoji: '🍻',
      description: 'Für Treffen & Feste',
      active: true,
      allReactions: false,
      reactionIds: ['r-toast', 'r-heart'],
      allowedReactionCodes: ['TOAST', 'HEART'],
    },
    {
      id: 't-2',
      code: 'prayer',
      name: 'Gebet & Fürbitte',
      emoji: '🙏',
      description: null,
      active: true,
      allReactions: true,
      reactionIds: [],
      allowedReactionCodes: ['TOAST', 'PRAYER', 'HEART'],
    },
    {
      id: 't-3',
      code: 'retired',
      name: 'Alter Typ',
      emoji: '🗃️',
      description: null,
      active: false,
      allReactions: true,
      reactionIds: [],
      allowedReactionCodes: ['TOAST', 'PRAYER', 'HEART'],
    },
  ],
  reactions: [
    { id: 'r-toast', code: 'TOAST', name: 'Anstoßen', emoji: '🍻', active: true },
    { id: 'r-prayer', code: 'PRAYER', name: 'Gebet', emoji: '🙏', active: true },
    { id: 'r-heart', code: 'HEART', name: 'Herz', emoji: '❤️', active: true },
    { id: 'r-old', code: 'OLD', name: 'Alt', emoji: '🦖', active: false },
  ],
  mediaLimits: {
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 100 * 1024 * 1024,
    maxVideoSeconds: 60,
    maxMediaPerResponse: 4,
    imageTypes: ['image/jpeg', 'image/png', 'image/gif'],
    videoTypes: ['video/mp4', 'video/quicktime'],
    videosAllowed: true,
  },
};

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
  eventTitle: 'Vereinsstammtisch',
  visibility: 'group',
  creatorId: 'u-1',
  creatorName: 'Max Mustermann',
  conversationId: 'conv-123',
  title: 'Stammtisch Anstoßen',
  topicType: 'toast',
  message: 'Prost Freunde!',
  latitude: 48.137,
  longitude: 11.575,
  active: true,
  topicName: 'Gemeinsames Anstoßen',
  topicEmoji: '🍻',
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
      reactionName: 'Anstoßen',
      reactionEmoji: '🍻',
      statusText: 'Prost!',
      latitude: 48.137,
      longitude: 11.575,
      createdAt: '2026-09-16T18:30:00Z',
      media: [],
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
    eventId: null,
    eventTitle: null,
    title: 'Früheres Gebet',
    topicType: 'prayer',
    topicName: 'Gebet & Fürbitte',
    topicEmoji: '🙏',
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
    getMomentConfig: ReturnType<typeof vi.fn>;
    deleteMomentMedia: ReturnType<typeof vi.fn>;
  };
  let roles: string[];

  const createComponent = async (paramEventId: string | null = null, queryMomentId: string | null = null) => {
    TestBed.configureTestingModule({
      imports: [MomentsComponent],
      providers: [
        provideRouter([]),
        { provide: MemberApiService, useValue: api },
        { provide: AuthService, useValue: { getSession: () => Promise.resolve({ roles }) } },
        { provide: MomentMediaUploader, useValue: uploader },
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
  type Fixture = Awaited<ReturnType<typeof createComponent>>;
  const startDialog = (fixture: Fixture) =>
    fixture.debugElement.query(By.directive(MomentStartDialogComponent)).componentInstance as any;
  const respondDialog = (fixture: Fixture) =>
    fixture.debugElement.query(By.directive(MomentRespondDialogComponent)).componentInstance as any;

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
          reactionName: 'Prost',
          reactionEmoji: '🍻',
          statusText: 'Cheers!',
          latitude: null,
          longitude: null,
          createdAt: '2026-09-16T18:45:00Z',
          media: [],
        }),
      ),
      completeMoment: vi.fn(() =>
        of({
          momentId: 'm-1',
          eventId: 'e-1',
          eventTitle: 'Vereinsstammtisch',
          title: 'Stammtisch Anstoßen',
          topicType: 'toast',
          topicName: 'Gemeinsames Anstoßen',
          topicEmoji: '🍻',
          totalResponses: 2,
          uniqueParticipants: 1,
          summary: '1 Teilnehmer hat 2 Beiträge geteilt.',
          completedAt: '2026-09-16T19:30:00Z',
        }),
      ),
      listMomentHistory: vi.fn(() => of(mockHistory)),
      getMomentConfig: vi.fn(() => of(mockConfig)),
      deleteMomentMedia: vi.fn(() => of(null)),
    };
    roles = ['member'];
  });

  it('loads all moments of the group without an event', async () => {
    const fixture = await createComponent();
    expect(api.listEvents).toHaveBeenCalled();
    expect(api.listMoments).toHaveBeenCalledWith(null);
    expect(api.listMomentHistory).toHaveBeenCalledWith(null);
    expect(api.getMomentDetail).toHaveBeenCalledWith('m-1');

    const text = html(fixture);
    expect(text).toContain('Stammtisch Anstoßen');
    expect(text).toContain('Gemeinsames Anstoßen');
    expect(text).toContain('Prost Freunde!');
    expect(text).toContain('24h-Chat');
    expect(text).toContain('Früheres Gebet');
    expect(text).toContain('Vereinsstammtisch');
  });

  it('handles route with direct eventId parameter', async () => {
    const fixture = await createComponent('e-1');
    expect(api.listMoments).toHaveBeenCalledWith('e-1');
    expect(api.listMomentHistory).toHaveBeenCalledWith('e-1');
    expect(html(fixture)).toContain('Stammtisch Anstoßen');
    expect(html(fixture)).toContain('Moments zum Event „Vereinsstammtisch“');
  });

  it('marks moments that only event participants can see', async () => {
    api.listMoments.mockReturnValue(of([{ ...mockSession, visibility: 'event' }]));
    const fixture = await createComponent();
    expect(html(fixture)).toContain('Nur Event-Teilnehmer');
  });

  it('shows push notification alert banner when deep-linked with momentId query param', async () => {
    const fixture = await createComponent('e-1', 'm-1');
    expect(html(fixture)).toContain('Neuer Moment gestartet: „Stammtisch Anstoßen“');
    expect(html(fixture)).toContain('Jetzt Beitreten');
  });

  it('starts a moment without event and title for the whole group', async () => {
    const fixture = await createComponent();
    const comp = fixture.componentInstance as any;

    comp.openStartModal();
    fixture.detectChanges();
    const dialog = startDialog(fixture);
    expect(dialog.eventId).toBe('');

    dialog.topicType = 'prayer';
    dialog.submit();
    expect(api.startMoment).toHaveBeenCalledWith({
      title: undefined,
      topicType: 'prayer',
      message: undefined,
      durationMinutes: 60,
      consent: false,
      latitude: undefined,
      longitude: undefined,
      eventId: undefined,
      visibility: 'group',
    });
  });

  it('starts an event moment limited to the participants', async () => {
    const fixture = await createComponent('e-1');
    const comp = fixture.componentInstance as any;

    comp.openStartModal();
    fixture.detectChanges();
    const dialog = startDialog(fixture);
    expect(dialog.eventId).toBe('e-1');

    dialog.title = 'Abendgebet';
    dialog.topicType = 'prayer';
    dialog.message = 'Gemeinsame Fürbitte';
    dialog.durationMinutes = 30;
    dialog.visibility = 'event';

    dialog.submit();
    expect(api.startMoment).toHaveBeenCalledWith({
      title: 'Abendgebet',
      topicType: 'prayer',
      message: 'Gemeinsame Fürbitte',
      durationMinutes: 30,
      consent: false,
      latitude: undefined,
      longitude: undefined,
      eventId: 'e-1',
      visibility: 'event',
    });
  });

  it('allows submitting multiple status responses and quick reactions', async () => {
    const fixture = await createComponent('e-1');
    const comp = fixture.componentInstance as any;

    // Quick reaction submission
    comp.submitQuickReaction('m-1', 'CHEERS');
    expect(api.submitMomentResponse).toHaveBeenCalledWith('m-1', {
      reaction: 'CHEERS',
      consent: false,
    });

    // Custom response form submission
    comp.openRespondModal('m-1');
    fixture.detectChanges();
    const dialog = respondDialog(fixture);
    dialog.reaction = 'PRAYER';
    dialog.statusText = 'Segenswünsche aus Hamburg';

    await dialog.submit();
    expect(api.submitMomentResponse).toHaveBeenCalledWith('m-1', {
      reaction: 'PRAYER',
      statusText: 'Segenswünsche aus Hamburg',
      consent: false,
      latitude: undefined,
      longitude: undefined,
      mediaIds: undefined,
    });
  });

  it('offers only the active types and the reactions the board allowed for the type', async () => {
    const fixture = await createComponent('e-1');
    const comp = fixture.componentInstance as any;

    expect(comp.activeTypes().map((t: { code: string }) => t.code)).toEqual(['toast', 'prayer']);
    // Typ „toast“ erlaubt nur Anstoßen und Herz.
    const quick = Array.from(fixture.nativeElement.querySelectorAll('.quick-btn') as NodeListOf<HTMLElement>).map(
      (button) => button.textContent?.trim(),
    );
    expect(quick).toContain('🍻 Anstoßen');
    expect(quick).toContain('❤️ Herz');
    expect(quick).not.toContain('🙏 Gebet');

    comp.openStartModal();
    fixture.detectChanges();
    const text = html(fixture);
    expect(text).toContain('Gebet & Fürbitte');
    expect(text).not.toContain('Alter Typ');
    expect(startDialog(fixture).topicType).toBe('toast');
  });

  it('shows the management link only to board and admin', async () => {
    const member = await createComponent('e-1');
    expect(member.nativeElement.querySelector('a[href="/board/moments"]')).toBeNull();
    TestBed.resetTestingModule();

    roles = ['member', 'board'];
    const board = await createComponent('e-1');
    expect(board.nativeElement.querySelector('a[href="/board/moments"]')).not.toBeNull();
  });

  it('uploads chosen photos and videos and sends them with the contribution', async () => {
    const fixture = await createComponent('e-1');
    const comp = fixture.componentInstance as any;

    comp.openRespondModal('m-1');
    fixture.detectChanges();
    const dialog = respondDialog(fixture);
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [
        new File(['a'], 'foto.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'clip.mp4', { type: 'video/mp4' }),
      ],
    });
    await dialog.onMediaSelected({ target: input } as unknown as Event);
    expect(dialog.pendingMedia().length).toBe(2);
    expect(dialog.canSubmit()).toBe(true);

    await dialog.submit();
    expect(api.submitMomentResponse).toHaveBeenCalledWith('m-1', {
      reaction: undefined,
      statusText: undefined,
      consent: false,
      latitude: undefined,
      longitude: undefined,
      mediaIds: ['media-foto.jpg', 'media-clip.mp4'],
    });
  });

  it('offers camera capture for photos and videos when the plan allows videos', async () => {
    const fixture = await createComponent();
    const comp = fixture.componentInstance as any;
    comp.openRespondModal('m-1');
    fixture.detectChanges();

    const photo = document.querySelector<HTMLInputElement>('[data-testid="capture-photo"]');
    const video = document.querySelector<HTMLInputElement>('[data-testid="capture-video"]');
    expect(photo?.getAttribute('capture')).toBe('environment');
    expect(photo?.accept).toBe('image/*');
    expect(video?.accept).toBe('video/*');
    expect(document.querySelector('[data-testid="videos-not-in-plan"]')).toBeNull();
  });

  it('hides video capture when the group plan has no videos', async () => {
    api.getMomentConfig.mockReturnValue(
      of({ ...mockConfig, mediaLimits: { ...mockConfig.mediaLimits, videoTypes: [], videosAllowed: false } }),
    );
    const fixture = await createComponent();
    const comp = fixture.componentInstance as any;
    comp.openRespondModal('m-1');
    fixture.detectChanges();

    expect(document.querySelector('[data-testid="capture-photo"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="capture-video"]')).toBeNull();
    expect(document.querySelector<HTMLInputElement>('[data-testid="pick-gallery"]')?.accept).toBe('image/*');
    expect(document.querySelector('[data-testid="videos-not-in-plan"]')?.textContent).toContain(
      'Videos sind im aktuellen Tarif',
    );
  });

  it('removes a photo or video after confirmation and reloads the moment', async () => {
    const fixture = await createComponent('e-1');
    const comp = fixture.componentInstance as any;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    comp.removeMedia('m-1', { id: 'media-1' });
    expect(api.deleteMomentMedia).toHaveBeenCalledWith('m-1', 'media-1');
  });

  it('allows completing and archiving an active moment', async () => {
    const fixture = await createComponent('e-1');
    const comp = fixture.componentInstance as any;

    comp.completeMoment('m-1');
    expect(api.completeMoment).toHaveBeenCalledWith('m-1');
  });

  it('shows error state when moments API fails', async () => {
    api.listMoments.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await createComponent('e-1');
    expect(html(fixture)).toContain('Nicht verfügbar');
    expect(html(fixture)).toContain('Rechte');
  });
});
