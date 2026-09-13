import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ChatComponent } from './chat.component';
import { ChatDataService } from './chat-data.service';
import type { ChatMessage, ChatOverview } from './chat.model';

function message(id: string, author: string, text: string): ChatMessage {
  return {
    id,
    authorId: author,
    authorName: author,
    createdAt: '2026-09-09T18:42:00Z',
    text,
    reactions: [{ emoji: '🍺', count: 2, reactedByMe: false }],
  };
}

function overview(): ChatOverview {
  return {
    currentUserId: 'me',
    group: {
      id: 'group-eber',
      name: 'Die Durstigen Eber',
      membersOnline: 8,
      pinned: { authorName: 'Lisa', text: 'Stammtisch #47 startet heute pünktlich.' },
      messages: [message('g-1', 'Max Mustermann', 'Bringt jemand Karten mit?')],
    },
    conversations: [
      {
        id: 'dm-max',
        partnerId: 'max',
        partnerName: 'Max Mustermann',
        lastText: 'Ja, ich bringe Karten mit!',
        lastLabel: '20:01',
        unreadCount: 2,
        online: true,
        messages: [message('dm-max-1', 'Max Mustermann', 'Ja, ich bringe Karten mit!')],
      },
    ],
  };
}

describe('ChatComponent', () => {
  let data: {
    loadOverview: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [provideRouter([]), { provide: ChatDataService, useValue: data }],
    });
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    data = {
      loadOverview: vi.fn(() => of(overview())),
      sendMessage: vi.fn((_id: string, text: string) =>
        of<ChatMessage>({
          id: 'local-1',
          authorId: 'me',
          authorName: 'Du',
          createdAt: '2026-09-09T19:00:00Z',
          text,
          reactions: [],
        }),
      ),
    };
  });

  it('renders message bubbles with author and time and the pinned Schriftwart panel', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect(html(fixture)).toContain('Max Mustermann');
    expect(html(fixture)).toContain('Bringt jemand Karten mit?');
    // Author bubble carries a rendered timestamp.
    expect(root.querySelector('.chat-message-time')?.textContent?.trim().length).toBeGreaterThan(0);
    // Pinned info panel uses the shared ui/ primitive.
    expect(root.querySelector('vereint-info-panel')).toBeTruthy();
    expect(html(fixture)).toContain('Info vom Schriftwart (Lisa)');
  });

  it('increments the reaction counter when a reaction is toggled', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const reaction = root.querySelector<HTMLButtonElement>('.chat-reaction');
    expect(reaction?.textContent).toContain('2');
    reaction!.click();
    fixture.detectChanges();
    expect(root.querySelector('.chat-reaction')?.textContent).toContain('3');
  });

  it('sends a composer message via the data layer and clears the field', async () => {
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { draft: string; send: () => void };
    component.draft = 'Prost!';
    component.send();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(data.sendMessage).toHaveBeenCalledWith('group-eber', 'Prost!');
    expect(component.draft).toBe('');
    expect(html(fixture)).toContain('Prost!');
  });

  it('keeps the draft and shows a neutral message when sending fails', async () => {
    data.sendMessage.mockReturnValue(throwError(() => new Error('offline')));
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { draft: string; send: () => void };
    component.draft = 'Prost!';
    component.send();
    fixture.detectChanges();
    expect(component.draft).toBe('Prost!');
    expect(html(fixture)).toContain('konnte nicht gesendet werden');
  });

  it('lists direct conversations with an unread indicator', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect(html(fixture)).toContain('Max Mustermann');
    expect(root.querySelector('.chat-unread')?.textContent).toContain('2');
  });

  it('shows a retry state on load error', async () => {
    data.loadOverview.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });

  it('renders no private chat content on the server (SSR)', async () => {
    TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [
        provideRouter([]),
        { provide: ChatDataService, useValue: data },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // The data layer is never queried and no private message leaks into the SSR HTML.
    expect(data.loadOverview).not.toHaveBeenCalled();
    expect(html(fixture)).not.toContain('Bringt jemand Karten mit?');
    expect(html(fixture)).not.toContain('Info vom Schriftwart');
  });
});
