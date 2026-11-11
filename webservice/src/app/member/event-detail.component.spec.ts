import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { ChatMessageDto, EventDetail, EventParticipant, MemberProfile, MomentSessionDto, MomentSummaryDto } from '../api/api.types';
import { EventDetailComponent } from './event-detail.component';
import { MemberApiService } from './member-api.service';

const event: EventDetail = {
  id: 'e-1',
  title: 'Sommerfest',
  description: 'Grillen im Garten',
  location: 'Vereinsheim',
  startsAt: '2026-07-01T18:00:00Z',
  endsAt: '2026-07-01T23:00:00Z',
  status: 'active',
  ownerId: 'o-1',
  ownerDisplayName: 'Bob',
  participantCount: 1,
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-02T10:00:00Z',
  myRsvp: 'accepted',
  rsvpCounts: { invited: 1, accepted: 1, maybe: 0, declined: 2 },
  canManage: false,
};

const participants: EventParticipant[] = [
  { userId: 'u-1', displayName: 'Alice', role: 'participant', joinedAt: '2026-06-01T10:00:00Z', rsvp: 'accepted' },
  { userId: 'u-2', displayName: 'Carla', role: 'participant', joinedAt: '2026-06-01T10:00:00Z', rsvp: 'declined' },
];

const chatMessages: ChatMessageDto[] = [
  {
    id: 'msg-1',
    conversationId: 'c-9',
    senderType: 'member',
    senderId: 'u-2',
    senderName: 'Carla',
    message: 'Wer bringt Kohle mit?',
    imageUrl: null,
    createdAt: '2026-06-30T18:00:00Z',
  },
];

const mockMoments: MomentSessionDto[] = [
  {
    id: 'm-1',
    eventId: 'e-1',
    eventTitle: 'Sommerfest',
    visibility: 'group',
    creatorId: 'u-1',
    creatorName: 'Alice',
    conversationId: 'c-1',
    title: 'Gemeinsames Anstoßen',
    topicType: 'toast',
    message: 'Prost!',
    latitude: 48.13,
    longitude: 11.58,
    active: true,
    topicName: 'Gemeinsames Anstoßen',
    topicEmoji: '🍻',
    responsesCount: 3,
    expiresAt: '2026-07-01T20:00:00Z',
    createdAt: '2026-07-01T19:00:00Z',
    summary: null,
  },
];

const mockHistory: MomentSummaryDto[] = [
  {
    momentId: 'm-old',
    eventId: 'e-1',
    eventTitle: 'Sommerfest',
    title: 'Früheres Gebet',
    topicType: 'prayer',
    topicName: 'Gebet & Fürbitte',
    topicEmoji: '🙏',
    totalResponses: 5,
    uniqueParticipants: 4,
    summary: '4 Teilnehmer haben 5 Statusbeiträge geteilt.',
    completedAt: '2026-06-15T18:00:00Z',
  },
];

const profile: MemberProfile = {
  id: 'u-1',
  keycloakSubject: 'sub-1',
  displayName: 'Alice',
  email: 'alice@example.com',
  disabled: false,
  drinkRecorder: false,
  boardRole: null,
  roles: ['member'],
  permissions: [],
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-02T10:00:00Z',
};

describe('EventDetailComponent', () => {
  let api: {
    getEvent: ReturnType<typeof vi.fn>;
    listParticipants: ReturnType<typeof vi.fn>;
    listMoments: ReturnType<typeof vi.fn>;
    listMomentHistory: ReturnType<typeof vi.fn>;
    loadProfile: ReturnType<typeof vi.fn>;
    respondToEvent: ReturnType<typeof vi.fn>;
    getEventConversation: ReturnType<typeof vi.fn>;
    listConversationMessages: ReturnType<typeof vi.fn>;
    sendConversationMessage: ReturnType<typeof vi.fn>;
    markConversationRead: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [EventDetailComponent],
      providers: [
        provideRouter([]),
        { provide: MemberApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: (key: string) => (key === 'eventId' ? 'e-1' : null) } } },
        },
      ],
    });
    const fixture = TestBed.createComponent(EventDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      getEvent: vi.fn(() => of(event)),
      listParticipants: vi.fn(() => of(participants)),
      listMoments: vi.fn(() => of(mockMoments)),
      listMomentHistory: vi.fn(() => of(mockHistory)),
      loadProfile: vi.fn(() => of(profile)),
      respondToEvent: vi.fn((_id: string, status: string) =>
        of({ ...event, myRsvp: status, rsvpCounts: { invited: 1, accepted: 0, maybe: 0, declined: 3 } }),
      ),
      getEventConversation: vi.fn(() => of({ id: 'c-9' })),
      listConversationMessages: vi.fn(() => of(chatMessages)),
      sendConversationMessage: vi.fn((_id: string, message: string) =>
        of({ ...chatMessages[0], id: 'msg-2', senderId: 'u-1', senderName: 'Alice', message }),
      ),
      markConversationRead: vi.fn(() => of({})),
    };
  });

  it('renders event details and participants', async () => {
    const fixture = await create();
    expect(api.getEvent).toHaveBeenCalledWith('e-1');
    expect(html(fixture)).toContain('Sommerfest');
    expect(html(fixture)).toContain('Vereinsheim');
    expect(html(fixture)).toContain('Alice');
  });

  it('renders active moments and past moment recaps', async () => {
    const fixture = await create();
    expect(api.listMoments).toHaveBeenCalledWith('e-1');
    expect(api.listMomentHistory).toHaveBeenCalledWith('e-1');
    expect(html(fixture)).toContain('Moments (1 aktiv)');
    expect(html(fixture)).toContain('Früheres Gebet');
    expect(html(fixture)).toContain('4 Teilnehmer haben 5 Statusbeiträge geteilt.');
  });

  it('offers a route button and RSVP answer options', async () => {
    const fixture = await create();
    expect((fixture.nativeElement as HTMLElement).querySelector('.detail-route')?.textContent).toContain('Route');
    expect(html(fixture)).toContain('Zusagen');
    expect(html(fixture)).toContain('Vielleicht');
    expect(html(fixture)).toContain('Absagen');
  });

  it('shows the own answer highlighted, the counts and each participant answer', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const active = root.querySelector('.rsvp-button.is-active') as HTMLButtonElement;
    expect(active.textContent).toContain('Zusagen');
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(html(fixture)).toContain('Du hast zugesagt');
    expect(root.querySelector('.detail-section-meta')?.textContent).toMatch(/\d+ zugesagt · \d+ offen/);
    expect(html(fixture)).toContain('Carla');
    expect(html(fixture)).toContain('Abgesagt');
  });

  it('sends the answer to the rsvp endpoint and lets a declined member change their mind', async () => {
    api.getEvent.mockReturnValue(of({ ...event, myRsvp: 'declined' }));
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.rsvp-button'));
    expect(buttons.every((b) => !b.disabled)).toBe(true);
    buttons.find((b) => b.textContent?.includes('Zusagen'))!.click();
    fixture.detectChanges();
    expect(api.respondToEvent).toHaveBeenCalledWith('e-1', 'accepted');
    expect(api.listParticipants).toHaveBeenCalledTimes(2);
    expect((root.querySelector('.rsvp-button.is-active') as HTMLElement).textContent).toContain('Zusagen');
  });

  it('hides the answer buttons when the member is not invited', async () => {
    api.getEvent.mockReturnValue(of({ ...event, myRsvp: null }));
    const fixture = await create();
    expect((fixture.nativeElement as HTMLElement).querySelector('.rsvp-button')).toBeNull();
  });

  it('links to the manage page only when the member may manage', async () => {
    let fixture = await create();
    expect((fixture.nativeElement as HTMLElement).querySelector('.detail-chip-strong')).toBeNull();
    TestBed.resetTestingModule();
    api.getEvent.mockReturnValue(of({ ...event, canManage: true }));
    fixture = await create();
    const link = (fixture.nativeElement as HTMLElement).querySelector('.detail-chip-strong') as HTMLAnchorElement;
    expect(link.textContent).toContain('Verwalten');
    expect(link.getAttribute('href')).toBe('/events/e-1/manage');
  });

  it('links to the event statistics', async () => {
    const fixture = await create();
    const link = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="event-statistics-link"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/events/e-1/statistik');
  });

  it('shows the event chat, marks it read and sends messages', async () => {
    const fixture = await create();
    expect(api.getEventConversation).toHaveBeenCalledWith('e-1');
    expect(api.listConversationMessages).toHaveBeenCalledWith('c-9');
    expect(api.markConversationRead).toHaveBeenCalledWith('c-9');
    expect(html(fixture)).toContain('Wer bringt Kohle mit?');

    const cmp = fixture.componentInstance as unknown as { chatDraft: string; sendMessage(): void };
    cmp.chatDraft = '  Ich!  ';
    cmp.sendMessage();
    fixture.detectChanges();
    expect(api.sendConversationMessage).toHaveBeenCalledWith('c-9', 'Ich!');
    expect(html(fixture)).toContain('Ich!');
    expect(cmp.chatDraft).toBe('');
  });

  it('polls the chat while the page is open and stops on destroy', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await create();
      expect(api.listConversationMessages).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(10_000);
      expect(api.listConversationMessages).toHaveBeenCalledTimes(2);
      // Gleiche letzte Nachricht: kein erneutes Lesen.
      expect(api.markConversationRead).toHaveBeenCalledTimes(1);
      fixture.destroy();
      vi.advanceTimersByTime(30_000);
      expect(api.listConversationMessages).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables the chat composer for cancelled events', async () => {
    api.getEvent.mockReturnValue(of({ ...event, status: 'cancelled' }));
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect((root.querySelector('.chat-composer input') as HTMLInputElement).disabled).toBe(true);
    expect((root.querySelector('.chat-send') as HTMLButtonElement).disabled).toBe(true);
    const cmp = fixture.componentInstance as unknown as { chatDraft: string; sendMessage(): void };
    cmp.chatDraft = 'Hallo';
    cmp.sendMessage();
    expect(api.sendConversationMessage).not.toHaveBeenCalled();
  });

  it('shows a hint when the chat is not available', async () => {
    api.getEventConversation.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('Chat ist für dich nicht verfügbar');
  });

  it('shows a neutral error when access is denied', async () => {
    api.getEvent.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
    expect(html(fixture)).toContain('Rechte');
  });
});
