import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatApiService } from './chat-api.service';
import { ChatUnreadStore } from './chat-unread.store';
import { DirectMessagesComponent } from './direct-messages.component';
import { chatMessage, summary } from './chat-test-data';

function direct(id: string, name: string, extra: Partial<ReturnType<typeof summary>> = {}) {
  return summary({ id, type: 'direct', title: name, partnerId: `u-${id}`, partnerName: name, ...extra });
}

describe('DirectMessagesComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [DirectMessagesComponent],
      providers: [
        provideRouter([]),
        { provide: ChatApiService, useValue: api },
        { provide: ChatUnreadStore, useValue: { count: signal(0), refresh: vi.fn() } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const settle = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    api = {
      me: vi.fn(() => of({ id: 'u-me' })),
      conversations: vi.fn(() =>
        of([
          summary(),
          direct('dm-ben', 'Ben Probe', {
            unreadCount: 2,
            lastMessage: { senderName: 'Ben Probe', message: 'Bringst du Karten mit?', createdAt: '2026-10-14T18:00:00Z' },
          }),
          direct('dm-clara', 'Clara Test', {
            unreadCount: 3,
            lastMessage: { senderName: 'Du', message: 'Danke dir!', createdAt: '2026-10-13T18:00:00Z' },
          }),
        ]),
      ),
      messages: vi.fn((id: string) => of([chatMessage({ id: `m-${id}`, conversationId: id, message: `Verlauf ${id}` })])),
      markRead: vi.fn((id: string) => of(summary({ id, type: 'direct', unreadCount: 0 }))),
      send: vi.fn(),
      toggleReaction: vi.fn(),
      directory: vi.fn(() =>
        of([
          { id: 'u-me', displayName: 'Ich Selbst', boardRole: null, roles: ['member'] },
          { id: 'u-dora', displayName: 'Dora Neu', boardRole: null, roles: ['member'] },
          { id: 'u-dm-ben', displayName: 'Ben Probe', boardRole: null, roles: ['member'] },
        ]),
      ),
      startDirect: vi.fn((userId: string) =>
        of(direct('dm-dora', 'Dora Neu', { partnerId: userId })),
      ),
    };
  });

  it('lists only direct chats with partner name, preview and unread badge', async () => {
    const fixture = await create();
    const list = el(fixture).querySelector('.chat-aside')!;
    expect(list.textContent).toContain('Ben Probe');
    expect(list.textContent).toContain('Bringst du Karten mit?');
    expect(list.textContent).toContain('Clara Test');
    expect(list.textContent).not.toContain('Gruppenchat');
    expect(list.querySelector('vereint-avatar-badge')).toBeTruthy();
    // Ben ist geöffnet und damit gelesen; Clara behält ihr Badge.
    const badges = Array.from(list.querySelectorAll('.dm-unread')).map((node) => node.textContent?.trim());
    expect(badges).toEqual(['3']);
  });

  it('opens the newest conversation and marks it read', async () => {
    const fixture = await create();
    expect(api['messages']).toHaveBeenCalledWith('dm-ben');
    expect(api['markRead']).toHaveBeenCalledWith('dm-ben');
    expect(el(fixture).textContent).toContain('Verlauf dm-ben');
    const ben = el(fixture).querySelector('.dm-item.is-active');
    expect(ben?.textContent).toContain('Ben Probe');
    expect(ben?.querySelector('.dm-unread')).toBeNull();
  });

  it('filters the conversations by the search term', async () => {
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { term: { set: (value: string) => void } };
    component.term.set('clara');
    fixture.detectChanges();
    const list = el(fixture).querySelector('.dm-list')!;
    expect(list.textContent).toContain('Clara Test');
    expect(list.textContent).not.toContain('Ben Probe');
  });

  it('shows an empty state when the search matches nothing', async () => {
    const fixture = await create();
    const component = fixture.componentInstance as unknown as { term: { set: (value: string) => void } };
    component.term.set('unbekannt');
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Keine Konversationen');
  });

  it('picks a member from the directory (without oneself) and starts the chat', async () => {
    const fixture = await create();
    el(fixture).querySelector<HTMLButtonElement>('.dm-new')!.click();
    await settle(fixture);
    const sheet = document.querySelector('.ui-sheet') ?? el(fixture).querySelector('.ui-sheet');
    expect(sheet?.textContent).toContain('Dora Neu');
    expect(sheet?.textContent).not.toContain('Ich Selbst');

    const component = fixture.componentInstance as unknown as { memberTerm: { set: (value: string) => void } };
    component.memberTerm.set('dor');
    fixture.detectChanges();
    const buttons = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.dm-member'));
    expect(buttons.length).toBe(1);
    buttons[0].click();
    await settle(fixture);

    expect(api['startDirect']).toHaveBeenCalledWith('u-dora');
    expect(el(fixture).querySelector('.ui-sheet')).toBeNull();
    expect(el(fixture).querySelector('.dm-list')?.textContent).toContain('Dora Neu');
    expect(api['messages']).toHaveBeenCalledWith('dm-dora');
  });

  it('shows a retry state on load error', async () => {
    api['conversations'].mockReturnValue(throwError(() => new Error('boom')));
    const fixture = await create();
    expect(el(fixture).textContent).toContain('nicht verfügbar');
  });
});
