import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatApiService } from './chat-api.service';
import { ChatComponent } from './chat.component';
import { ChatUnreadStore } from './chat-unread.store';
import { chatMessage, summary } from './chat-test-data';

function conversations() {
  return [
    summary({
      pinned: { text: 'Stammtisch ab 19 Uhr.', authorName: 'Lisa', pinnedAt: '2026-10-01T10:00:00Z' },
      lastMessage: { senderName: 'Anna Beispiel', message: 'Wer kommt heute?', createdAt: '2026-10-14T18:42:00Z' },
    }),
    summary({
      id: 'c-dm',
      type: 'direct',
      title: 'Ben Probe',
      partnerId: 'u-ben',
      partnerName: 'Ben Probe',
      unreadCount: 4,
    }),
    summary({ id: 'c-event', type: 'event', title: 'Grillfest', eventId: 'e-1', unreadCount: 2 }),
  ];
}

describe('ChatComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  const configure = (platform = 'browser') =>
    TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [
        provideRouter([]),
        { provide: ChatApiService, useValue: api },
        { provide: ChatUnreadStore, useValue: { count: signal(0), refresh: vi.fn() } },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });

  const create = async () => {
    configure();
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    api = {
      me: vi.fn(() => of({ id: 'u-me' })),
      conversations: vi.fn(() => of(conversations())),
      messages: vi.fn((id: string) =>
        of(id === 'c-event' ? [chatMessage({ id: 'm-e', conversationId: id, message: 'Ich bringe Kohle.' })] : [chatMessage()]),
      ),
      markRead: vi.fn((id: string) => of(summary({ id, unreadCount: 0 }))),
      send: vi.fn(),
      toggleReaction: vi.fn(),
    };
  });

  it('opens the club chat with its pinned notice and messages', async () => {
    const fixture = await create();
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Vereinschat');
    expect(text).toContain('Wer kommt heute?');
    expect(text).toContain('Infotafel von Lisa');
    expect(api['messages']).toHaveBeenCalledWith('c-club');
    expect(api['markRead']).toHaveBeenCalledWith('c-club');
  });

  it('lists event chats with unread counts but no direct chats', async () => {
    const fixture = await create();
    const list = el(fixture).querySelector('.chat-aside')?.textContent ?? '';
    expect(list).toContain('Event-Chats');
    expect(list).toContain('Grillfest');
    expect(list).not.toContain('Ben Probe');
    expect(el(fixture).querySelector('.chat-unread')?.textContent).toContain('2');
  });

  it('switches to an event chat, links to the event and clears its unread badge after reading', async () => {
    const fixture = await create();
    const eventRow = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.chat-conversation')).find(
      (button) => button.textContent?.includes('Grillfest'),
    );
    eventRow!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api['messages']).toHaveBeenCalledWith('c-event');
    expect(api['markRead']).toHaveBeenCalledWith('c-event');
    expect(el(fixture).textContent).toContain('Ich bringe Kohle.');
    expect(el(fixture).querySelector('a[href="/events/e-1"]')).toBeTruthy();
    expect(el(fixture).querySelector('.chat-unread')).toBeNull();
  });

  it('shows no online status', async () => {
    const fixture = await create();
    expect(el(fixture).textContent).not.toContain('online');
  });

  it('shows a retry state on load error', async () => {
    api['conversations'].mockReturnValue(throwError(() => new Error('boom')));
    const fixture = await create();
    expect(el(fixture).textContent).toContain('nicht verfügbar');
  });

  it('renders no private chat content on the server (SSR)', async () => {
    configure('server');
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api['conversations']).not.toHaveBeenCalled();
    expect(el(fixture).textContent).not.toContain('Wer kommt heute?');
    expect(el(fixture).textContent).not.toContain('Infotafel');
  });
});
