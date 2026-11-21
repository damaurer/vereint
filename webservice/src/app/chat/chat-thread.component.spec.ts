import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, filter, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationSummary } from '../api/api.types';
import { ApiError } from '../api/api-client.service';
import { AuthService } from '../auth/auth.service';
import { LiveUpdatesService, type LiveEvent, type LiveEventType } from '../live/live-updates.service';
import { ChatApiService } from './chat-api.service';
import { CHAT_POLL_INTERVAL_MS, ChatThreadComponent, TYPING_DISPLAY_MS } from './chat-thread.component';
import { ChatOutboxService } from './chat-outbox.service';
import { ChatUnreadStore } from './chat-unread.store';
import { chatMessage, summary } from './chat-test-data';

describe('ChatThreadComponent', () => {
  let api: {
    messages: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    toggleReaction: ReturnType<typeof vi.fn>;
    typing: ReturnType<typeof vi.fn>;
  };
  let store: { count: ReturnType<typeof signal<number>>; refresh: ReturnType<typeof vi.fn> };
  let liveEvents: Subject<LiveEvent>;
  const live = () => ({
    connected: signal(false),
    events$: liveEvents.asObservable(),
    on: (...types: LiveEventType[]) =>
      liveEvents.pipe(filter((event) => event.type === 'resync' || types.includes(event.type))),
  });
  /** Wartet, bis die Warteschlange gesendet hat (Promises statt Zeitgeber). */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  const create = async (conversation: ConversationSummary = summary()) => {
    TestBed.configureTestingModule({
      imports: [ChatThreadComponent],
      providers: [
        provideRouter([]),
        { provide: ChatApiService, useValue: api },
        { provide: ChatUnreadStore, useValue: store },
        { provide: LiveUpdatesService, useValue: live() },
        {
          provide: AuthService,
          useValue: { getSession: () => Promise.resolve({ uid: 'kc-me', stammtisch: { id: 'st-1', name: 'Test' } }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ChatThreadComponent);
    fixture.componentRef.setInput('conversation', conversation);
    fixture.componentRef.setInput('myId', 'u-me');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    api = {
      messages: vi.fn(() =>
        of([
          chatMessage({ reactions: [{ emoji: '🍺', count: 2, reactedByMe: false }] }),
          chatMessage({ id: 'm-2', senderId: 'u-me', senderName: 'Ich Selbst', message: 'Ich!' }),
        ]),
      ),
      send: vi.fn((_id: string, text: string) =>
        of(chatMessage({ id: 'm-3', senderId: 'u-me', senderName: 'Ich Selbst', message: text })),
      ),
      markRead: vi.fn((id: string) => of(summary({ id, unreadCount: 0 }))),
      toggleReaction: vi.fn(() =>
        of(chatMessage({ reactions: [{ emoji: '🍺', count: 3, reactedByMe: true }] })),
      ),
      typing: vi.fn(() => of(undefined)),
    };
    store = { count: signal(0), refresh: vi.fn() };
    liveEvents = new Subject<LiveEvent>();
    localStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it('renders messages with author, time and marks own messages via senderId', async () => {
    const fixture = await create();
    const el = root(fixture);
    expect(el.textContent).toContain('Anna Beispiel');
    expect(el.textContent).toContain('Wer kommt heute?');
    expect(el.querySelector('.chat-message-time')?.textContent?.trim().length).toBeGreaterThan(0);
    const own = el.querySelectorAll('.chat-message.is-own');
    expect(own.length).toBe(1);
    expect(own[0].textContent).toContain('Ich!');
    expect(own[0].textContent).toContain('Du');
  });

  it('marks the conversation read when opened and refreshes the chat badge', async () => {
    const fixture = await create();
    expect(api.markRead).toHaveBeenCalledWith('c-club', 'club', undefined);
    expect(store.refresh).toHaveBeenCalled();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the pinned notice read-only', async () => {
    const fixture = await create(
      summary({ pinned: { text: 'Stammtisch ab 19 Uhr.', authorName: 'Lisa', pinnedAt: '2026-10-01T10:00:00Z' } }),
    );
    const panel = root(fixture).querySelector('vereint-info-panel');
    expect(panel?.textContent).toContain('Infotafel von Lisa');
    expect(panel?.textContent).toContain('Stammtisch ab 19 Uhr.');
    expect(panel?.querySelector('button, textarea, input')).toBeNull();
  });

  it('toggles a reaction through the backend and shows the server count', async () => {
    const fixture = await create();
    const reaction = root(fixture).querySelector<HTMLButtonElement>('.chat-reaction');
    expect(reaction?.textContent).toContain('2');
    reaction!.click();
    fixture.detectChanges();
    expect(api.toggleReaction).toHaveBeenCalledWith('c-club', 'm-1', '🍺', 'club', undefined);
    expect(root(fixture).querySelector('.chat-reaction')?.textContent).toContain('3');
    expect(root(fixture).querySelector('.chat-reaction.is-active')).toBeTruthy();
  });

  it('offers quick reactions including the beer emoji', async () => {
    const fixture = await create();
    root(fixture).querySelector<HTMLButtonElement>('.chat-reaction-add')!.click();
    fixture.detectChanges();
    const beer = Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('.chat-picker-emoji')).find(
      (button) => button.textContent?.includes('🍺'),
    );
    beer!.click();
    expect(api.toggleReaction).toHaveBeenCalledWith('c-club', 'm-1', '🍺', 'club', undefined);
  });

  it('sends a message with its own client id and clears the draft', async () => {
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { draft: string; send: () => void };
    component.draft = 'Prost!';
    component.send();
    expect(component.draft).toBe('');
    await settle();
    fixture.detectChanges();
    expect(api.send).toHaveBeenCalledWith('c-club', 'Prost!', 'club', expect.any(String), 'st-1');
    expect(root(fixture).textContent).toContain('Prost!');
    expect(root(fixture).querySelector('.chat-message.is-pending')).toBeNull();
    expect(TestBed.inject(ChatOutboxService).entries()).toEqual([]);
  });

  it('keeps a message in the queue while offline and sends it when the network is back', async () => {
    api.send.mockReturnValueOnce(throwError(() => new ApiError(0, 'network_error', '')));
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { draft: string; send: () => void };
    component.draft = 'Prost!';
    component.send();
    await settle();
    fixture.detectChanges();
    const pending = root(fixture).querySelector('.chat-message.is-pending');
    expect(pending?.textContent).toContain('Prost!');
    expect(pending?.querySelector('[data-status="pending"]')).toBeTruthy();
    expect(pending?.textContent).toContain('sobald du wieder Netz hast');
    const clientId = api.send.mock.calls[0][3] as string;

    // Netz zurück: dieselbe Nachricht mit derselben Id, keine doppelte Blase.
    api.send.mockReturnValueOnce(
      of(chatMessage({ id: 'm-3', senderId: 'u-me', message: 'Prost!', clientId, receipt: { status: 'sent', recipients: 3, delivered: 0, read: 0 } })),
    );
    globalThis.dispatchEvent(new Event('online'));
    await settle();
    fixture.detectChanges();
    expect(api.send).toHaveBeenCalledTimes(2);
    expect(api.send.mock.calls[1][3]).toBe(clientId);
    expect(root(fixture).querySelector('.chat-message.is-pending')).toBeNull();
    expect(root(fixture).querySelectorAll('.chat-message.is-own').length).toBe(2);
  });

  it('marks a message the server rejects as failed and lets the user retry or discard it', async () => {
    api.send.mockReturnValue(throwError(() => new ApiError(403, 'access_denied', '')));
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { draft: string; send: () => void };
    component.draft = 'Prost!';
    component.send();
    await settle();
    fixture.detectChanges();
    const failed = root(fixture).querySelector('.chat-message.is-failed');
    expect(failed?.textContent).toContain('Nicht gesendet');
    const discard = Array.from(failed!.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Verwerfen'),
    );
    discard!.click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('.chat-message.is-failed')).toBeNull();
  });

  it('shows ticks on own messages: one, two and two coloured ones', async () => {
    api.messages.mockReturnValue(
      of([
        chatMessage({ id: 'm-a', senderId: 'u-me', message: 'Eins', receipt: { status: 'sent', recipients: 3, delivered: 1, read: 0 } }),
        chatMessage({ id: 'm-b', senderId: 'u-me', message: 'Zwei', receipt: { status: 'delivered', recipients: 3, delivered: 3, read: 1 } }),
        chatMessage({ id: 'm-c', senderId: 'u-me', message: 'Drei', receipt: { status: 'read', recipients: 3, delivered: 3, read: 3 } }),
        chatMessage({ id: 'm-d', message: 'Fremd' }),
      ]),
    );
    const fixture = await create();
    const receipts = Array.from(root(fixture).querySelectorAll<HTMLElement>('.chat-receipt'));
    expect(receipts.map((element) => element.dataset['status'])).toEqual(['sent', 'delivered', 'read']);
    expect(receipts[0].getAttribute('aria-label')).toBe('Zugestellt an 1 von 3, gelesen von 0');
    expect(receipts[2].classList.contains('is-read')).toBe(true);
    expect(receipts[2].getAttribute('aria-label')).toBe('Von allen gelesen');
  });

  it('reloads the messages when the receipts of this chat change', async () => {
    await create();
    expect(api.messages).toHaveBeenCalledTimes(1);
    liveEvents.next({ type: 'receipt', conversationId: 'c-other' });
    expect(api.messages).toHaveBeenCalledTimes(1);
    liveEvents.next({ type: 'receipt', conversationId: 'c-club' });
    expect(api.messages).toHaveBeenCalledTimes(2);
  });

  it('shows who is typing and hides it after a few seconds', async () => {
    vi.useFakeTimers();
    const fixture = await create();
    liveEvents.next({ type: 'typing', conversationId: 'c-club', userId: 'u-anna', name: 'Anna' });
    liveEvents.next({ type: 'typing', conversationId: 'c-other', userId: 'u-bob', name: 'Bob' });
    liveEvents.next({ type: 'typing', conversationId: 'c-club', userId: 'u-me', name: 'Ich' });
    fixture.detectChanges();
    expect(root(fixture).querySelector('.chat-typing')?.textContent).toContain('Anna schreibt…');
    liveEvents.next({ type: 'typing', conversationId: 'c-club', userId: 'u-carl', name: 'Carl' });
    fixture.detectChanges();
    expect(root(fixture).querySelector('.chat-typing')?.textContent).toContain('Anna und Carl schreiben…');
    vi.advanceTimersByTime(TYPING_DISPLAY_MS + 10);
    fixture.detectChanges();
    expect(root(fixture).querySelector('.chat-typing')?.textContent?.trim()).toBe('');
  });

  it('reports typing at most every few seconds', async () => {
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { draft: string; onDraftChange: () => void };
    component.draft = 'H';
    component.onDraftChange();
    component.draft = 'Ha';
    component.onDraftChange();
    expect(api.typing).toHaveBeenCalledTimes(1);
    expect(api.typing).toHaveBeenCalledWith('c-club', 'club', undefined);
  });

  it('disables the composer when the conversation is read-only', async () => {
    const fixture = await create(summary({ type: 'event', eventId: 'e-1', title: 'Grillfest', canWrite: false }));
    expect(root(fixture).querySelector('.chat-composer')).toBeNull();
    expect(root(fixture).textContent).toContain('kannst du nicht mehr schreiben');
    expect(root(fixture).querySelector('a[href="/events/e-1"]')).toBeTruthy();
  });

  it('polls for new messages every 10 seconds and marks them read', async () => {
    vi.useFakeTimers();
    const fixture = await create();
    expect(api.messages).toHaveBeenCalledTimes(1);
    expect(api.markRead).toHaveBeenCalledTimes(1);

    api.messages.mockReturnValue(
      of([chatMessage(), chatMessage({ id: 'm-9', message: 'Neu da!' })]),
    );
    vi.advanceTimersByTime(CHAT_POLL_INTERVAL_MS);
    fixture.detectChanges();
    expect(api.messages).toHaveBeenCalledTimes(2);
    expect(api.markRead).toHaveBeenCalledTimes(2);
    expect(root(fixture).textContent).toContain('Neu da!');

    // Ohne Neues kein weiterer Lesestand.
    vi.advanceTimersByTime(CHAT_POLL_INTERVAL_MS);
    expect(api.messages).toHaveBeenCalledTimes(3);
    expect(api.markRead).toHaveBeenCalledTimes(2);
  });

  it('stops polling on destroy', async () => {
    vi.useFakeTimers();
    const fixture = await create();
    fixture.destroy();
    vi.advanceTimersByTime(CHAT_POLL_INTERVAL_MS * 3);
    expect(api.messages).toHaveBeenCalledTimes(1);
  });

  it('shows an error state with retry when messages fail to load', async () => {
    api.messages.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = await create();
    expect(root(fixture).textContent).toContain('Nachrichten nicht verfügbar');
  });
});
