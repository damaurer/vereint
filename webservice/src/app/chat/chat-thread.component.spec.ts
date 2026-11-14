import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationSummary } from '../api/api.types';
import { ChatApiService } from './chat-api.service';
import { CHAT_POLL_INTERVAL_MS, ChatThreadComponent } from './chat-thread.component';
import { ChatUnreadStore } from './chat-unread.store';
import { chatMessage, summary } from './chat-test-data';

describe('ChatThreadComponent', () => {
  let api: {
    messages: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    toggleReaction: ReturnType<typeof vi.fn>;
  };
  let store: { count: ReturnType<typeof signal<number>>; refresh: ReturnType<typeof vi.fn> };

  const create = async (conversation: ConversationSummary = summary()) => {
    TestBed.configureTestingModule({
      imports: [ChatThreadComponent],
      providers: [
        provideRouter([]),
        { provide: ChatApiService, useValue: api },
        { provide: ChatUnreadStore, useValue: store },
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
    };
    store = { count: signal(0), refresh: vi.fn() };
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
    expect(api.markRead).toHaveBeenCalledWith('c-club', 'club');
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
    expect(api.toggleReaction).toHaveBeenCalledWith('c-club', 'm-1', '🍺', 'club');
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
    expect(api.toggleReaction).toHaveBeenCalledWith('c-club', 'm-1', '🍺', 'club');
  });

  it('sends a message and clears the draft', async () => {
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { draft: string; send: () => void };
    component.draft = 'Prost!';
    component.send();
    fixture.detectChanges();
    expect(api.send).toHaveBeenCalledWith('c-club', 'Prost!', 'club');
    expect(component.draft).toBe('');
    expect(root(fixture).textContent).toContain('Prost!');
  });

  it('keeps the draft and shows a neutral message when sending fails', async () => {
    api.send.mockReturnValue(throwError(() => new Error('offline')));
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { draft: string; send: () => void };
    component.draft = 'Prost!';
    component.send();
    fixture.detectChanges();
    expect(component.draft).toBe('Prost!');
    expect(root(fixture).textContent).toContain('konnte nicht gesendet werden');
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
