import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FriendContact } from '../api/api.types';
import { ChatApiService } from './chat-api.service';
import { ChatComponent } from './chat.component';
import { ChatUnreadStore } from './chat-unread.store';
import { chatMessage, summary } from './chat-test-data';

function conversations() {
  return [
    summary({
      id: 'c-dm',
      type: 'direct',
      title: 'Ben Probe',
      partnerId: 'u-ben',
      partnerName: 'Ben Probe',
      unreadCount: 4,
      lastMessage: { senderName: 'Ben Probe', message: 'Kommst du?', createdAt: '2026-10-14T19:00:00Z' },
    }),
    summary({
      stammtischId: 'g-a',
      stammtischName: 'Kegelclub',
      pinned: { text: 'Treffen ab 19 Uhr.', authorName: 'Lisa', pinnedAt: '2026-10-01T10:00:00Z' },
      lastMessage: { senderName: 'Anna Beispiel', message: 'Wer kommt heute?', createdAt: '2026-10-14T18:42:00Z' },
    }),
    summary({
      id: 'c-event',
      type: 'event',
      title: 'Grillfest',
      eventId: 'e-1',
      unreadCount: 2,
      stammtischId: 'g-b',
      stammtischName: 'Laufgruppe',
    }),
    summary({ id: 'c-club-b', stammtischId: 'g-b', stammtischName: 'Laufgruppe' }),
  ];
}

function contact(userId: string, displayName: string, extra: Partial<FriendContact> = {}): FriendContact {
  return {
    userId,
    displayName,
    friendStatus: 'none',
    since: null,
    sharedGroups: [{ id: 'g-a', name: 'Kegelclub' }],
    canMessage: true,
    ...extra,
  };
}

describe('ChatComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let wide: boolean;
  let query: Record<string, string>;

  const configure = (platform = 'browser') =>
    TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: ChatApiService, useValue: api },
        { provide: ChatUnreadStore, useValue: { count: signal(0), refresh: vi.fn() } },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });

  const settle = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const create = async () => {
    configure();
    const fixture = TestBed.createComponent(ChatComponent);
    await settle(fixture);
    return fixture;
  };

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const rows = (fixture: { nativeElement: unknown }) =>
    Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.chat-conversation'));
  const rowNames = (fixture: { nativeElement: unknown }) =>
    rows(fixture).map((row) => row.querySelector('.chat-conversation-name')?.textContent?.trim());
  const button = (fixture: { nativeElement: unknown }, selector: string, text: string) =>
    Array.from(el(fixture).querySelectorAll<HTMLButtonElement>(selector)).find((entry) =>
      entry.textContent?.includes(text),
    )!;

  beforeEach(() => {
    wide = true;
    query = {};
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: wide,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    api = {
      me: vi.fn(() => of({ id: 'u-me' })),
      allChats: vi.fn(() => of(conversations())),
      messages: vi.fn((id: string) =>
        of(id === 'c-event' ? [chatMessage({ id: 'm-e', conversationId: id, message: 'Ich bringe Kohle.' })] : [chatMessage()]),
      ),
      markRead: vi.fn((id: string) => of(summary({ id, unreadCount: 0 }))),
      send: vi.fn(),
      typing: vi.fn(() => of(undefined)),
      toggleReaction: vi.fn(),
      contacts: vi.fn(() => of([contact('u-max', 'Max Mitglied'), contact('u-zoe', 'Zoe Zeichen', { canMessage: false })])),
      startDirect: vi.fn((userId: string) =>
        of(summary({ id: 'dm-new', type: 'direct', title: 'Max Mitglied', partnerId: userId, partnerName: 'Max Mitglied' })),
      ),
    };
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lists group chats, event chats and direct messages together, newest first', async () => {
    const fixture = await create();
    // Gruppenchats heißen wie ihre Gruppe, Direktnachrichten wie das Gegenüber.
    expect(rowNames(fixture)).toEqual(['Ben Probe', 'Kegelclub', 'Grillfest', 'Laufgruppe']);
    const text = el(fixture).querySelector('.chat-aside')?.textContent ?? '';
    expect(text).toContain('Anna Beispiel: Wer kommt heute?');
    expect(text).toContain('Event · Laufgruppe');
    expect(Array.from(el(fixture).querySelectorAll('.chat-unread')).map((badge) => badge.textContent?.trim())).toEqual(['4', '2']);
    // Keine Unterseiten mehr: kein Link zu Direktnachrichten.
    expect(el(fixture).querySelector('a[href="/direktnachrichten"]')).toBeNull();
  });

  it('opens nothing by itself; wide screens show a hint until a chat is chosen', async () => {
    const fixture = await create();
    expect(api['messages']).not.toHaveBeenCalled();
    expect(el(fixture).querySelector('app-chat-thread')).toBeNull();
    expect(el(fixture).textContent).toContain('Kein Chat ausgewählt');
    rows(fixture)[0].click();
    await settle(fixture);
    expect(api['messages']).toHaveBeenCalledWith('c-dm', 'direct', undefined);
    expect(el(fixture).querySelector('app-chat-thread')).toBeTruthy();
  });

  it('opens a group chat of another group with that group, including its pinned notice', async () => {
    const fixture = await create();
    rows(fixture)[1].click();
    await settle(fixture);
    expect(api['messages']).toHaveBeenCalledWith('c-club', 'club', 'g-a');
    expect(api['markRead']).toHaveBeenCalledWith('c-club', 'club', 'g-a');
    expect(el(fixture).textContent).toContain('Infotafel von Lisa');
  });

  it('opens an event chat, links to the event and clears its unread badge after reading', async () => {
    const fixture = await create();
    button(fixture, '.chat-conversation', 'Grillfest').click();
    await settle(fixture);
    expect(api['messages']).toHaveBeenCalledWith('c-event', 'event', 'g-b');
    expect(el(fixture).textContent).toContain('Ich bringe Kohle.');
    expect(el(fixture).querySelector('a[href="/events/e-1"]')?.textContent).toContain('Laufgruppe');
    expect(button(fixture, '.chat-conversation', 'Grillfest').querySelector('.chat-unread')).toBeNull();
  });

  it('filters with chips and search without leaving the page', async () => {
    const fixture = await create();
    button(fixture, '.chat-filter', 'Ungelesen').click();
    await settle(fixture);
    expect(rowNames(fixture)).toEqual(['Ben Probe', 'Grillfest']);
    button(fixture, '.chat-filter', 'Gruppen').click();
    await settle(fixture);
    expect(rowNames(fixture)).toEqual(['Kegelclub', 'Laufgruppe']);
    button(fixture, '.chat-filter', 'Alle').click();
    const search = el(fixture).querySelector<HTMLInputElement>('.chat-search input')!;
    search.value = 'lauf';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(rowNames(fixture)).toEqual(['Grillfest', 'Laufgruppe']);
  });

  it('shows the list first on phones and opens a chat in full screen, back returns to the list', async () => {
    wide = false;
    const fixture = await create();
    // Mobil wird nichts im Hintergrund geöffnet und als gelesen markiert.
    expect(el(fixture).querySelector('app-chat-thread')).toBeNull();
    expect(api['markRead']).not.toHaveBeenCalled();
    rows(fixture)[0].click();
    await settle(fixture);
    expect(el(fixture).querySelector('.chat-layout.is-thread app-chat-thread')).toBeTruthy();
    el(fixture).querySelector<HTMLButtonElement>('.chat-back')!.click();
    await settle(fixture);
    expect(el(fixture).querySelector('.chat-layout.is-thread')).toBeNull();
    expect(el(fixture).querySelector('app-chat-thread')).toBeNull();
  });

  it('opens the chat named in the link (?id), also for direct messages', async () => {
    wide = false;
    query = { id: 'c-dm' };
    const fixture = await create();
    expect(el(fixture).querySelector('.chat-layout.is-thread')).toBeTruthy();
    expect(api['messages']).toHaveBeenCalledWith('c-dm', 'direct', undefined);
  });

  it('new message: picks the kind first, then a group chat as target', async () => {
    const fixture = await create();
    el(fixture).querySelector<HTMLButtonElement>('.chat-new')!.click();
    await settle(fixture);
    const options = Array.from(el(fixture).querySelectorAll('.compose-option')).map((option) =>
      option.querySelector('.compose-option-title')?.textContent?.trim(),
    );
    expect(options).toEqual(['Gruppe', 'Event', 'Direktnachricht']);
    button(fixture, '.compose-option', 'Gruppe').click();
    await settle(fixture);
    const targets = Array.from(el(fixture).querySelectorAll('.compose-target')).map((target) => target.textContent?.trim());
    expect(targets).toEqual(['Kegelclub', 'Laufgruppe']);
    button(fixture, '.compose-target', 'Laufgruppe').click();
    await settle(fixture);
    expect(api['messages']).toHaveBeenCalledWith('c-club-b', 'club', 'g-b');
    expect(el(fixture).querySelector('.compose')).toBeNull();
  });

  it('new message: event chats offer only invited events', async () => {
    const fixture = await create();
    el(fixture).querySelector<HTMLButtonElement>('.chat-new')!.click();
    await settle(fixture);
    button(fixture, '.compose-option', 'Event').click();
    await settle(fixture);
    const targets = Array.from(el(fixture).querySelectorAll('.compose-target')).map((target) => target.textContent);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toContain('Grillfest');
    expect(targets[0]).toContain('Laufgruppe');
  });

  it('new message: a direct message starts or reopens the one chat with that person', async () => {
    const fixture = await create();
    el(fixture).querySelector<HTMLButtonElement>('.chat-new')!.click();
    await settle(fixture);
    button(fixture, '.compose-option', 'Direktnachricht').click();
    await settle(fixture);
    const people = Array.from(el(fixture).querySelectorAll('.compose-members .compose-option-title')).map((name) =>
      name.textContent?.trim(),
    );
    // Wer nicht erreichbar ist, steht nicht zur Auswahl.
    expect(people).toEqual(['Max Mitglied']);
    button(fixture, '.compose-target', 'Max Mitglied').click();
    await settle(fixture);
    expect(api['startDirect']).toHaveBeenCalledWith('u-max');
    expect(rowNames(fixture)[0]).toBe('Max Mitglied');
    expect(api['messages']).toHaveBeenCalledWith('dm-new', 'direct', undefined);
  });

  it('shows a retry state on load error', async () => {
    api['allChats'].mockReturnValue(throwError(() => new Error('boom')));
    const fixture = await create();
    expect(el(fixture).textContent).toContain('nicht verfügbar');
  });

  it('renders no private chat content on the server (SSR)', async () => {
    configure('server');
    const fixture = TestBed.createComponent(ChatComponent);
    await settle(fixture);
    expect(api['allChats']).not.toHaveBeenCalled();
    expect(el(fixture).textContent).not.toContain('Wer kommt heute?');
    expect(el(fixture).textContent).not.toContain('Infotafel');
  });
});
