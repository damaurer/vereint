import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatApiService } from './chat-api.service';

describe('ChatApiService', () => {
  let service: ChatApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ChatApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('calls the conversation endpoints', () => {
    service.conversations().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/conversations' }).flush([]);

    service.unreadCount().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/conversations/unread-count' }).flush({ unread: 0 });

    service.messages('c 1').subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/conversations/c%201/messages' }).flush([]);

    service.send('c1', 'Hallo').subscribe();
    const send = http.expectOne({ method: 'POST', url: '/api/v1/conversations/c1/messages' });
    expect(send.request.body).toEqual({ message: 'Hallo' });
    send.flush({});

    service.markRead('c1').subscribe();
    http.expectOne({ method: 'POST', url: '/api/v1/conversations/c1/read' }).flush({});

    service.toggleReaction('c1', 'm1', '🍺').subscribe();
    const reaction = http.expectOne({ method: 'POST', url: '/api/v1/conversations/c1/messages/m1/reactions' });
    expect(reaction.request.body).toEqual({ emoji: '🍺' });
    reaction.flush({});


    service.me().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/users/me' }).flush({});
  });

  it('routes direct messages to the cross-group endpoints', () => {
    service.directConversations().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/direct-conversations' }).flush([]);

    service.startDirect('u-1').subscribe();
    const direct = http.expectOne({ method: 'POST', url: '/api/v1/direct-conversations' });
    expect(direct.request.body).toEqual({ userId: 'u-1' });
    direct.flush({});

    service.messages('d1', 'direct').subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/direct-conversations/d1/messages' }).flush([]);

    service.send('d1', 'Hi', 'direct').subscribe();
    http.expectOne({ method: 'POST', url: '/api/v1/direct-conversations/d1/messages' }).flush({});

    service.markRead('d1', 'direct').subscribe();
    http.expectOne({ method: 'POST', url: '/api/v1/direct-conversations/d1/read' }).flush({});

    service.toggleReaction('d1', 'm1', '🍺', 'direct').subscribe();
    http.expectOne({ method: 'POST', url: '/api/v1/direct-conversations/d1/messages/m1/reactions' }).flush({});

    service.contacts().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/friends/contacts' }).flush([]);
  });

  it('loads the shared chat list and names the group of a chat from another group', () => {
    service.allChats().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/chats' }).flush([]);

    service.allUnreadCount().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/chats/unread-count' }).flush({ unread: 0 });

    service.messages('c1', 'event', 'g-b').subscribe();
    const messages = http.expectOne({ method: 'GET', url: '/api/v1/conversations/c1/messages' });
    expect(messages.request.headers.get('X-Vereint-Chat-Group')).toBe('g-b');
    messages.flush([]);

    service.send('c1', 'Hallo', 'club', 'cid-1', 'g-b').subscribe();
    const send = http.expectOne({ method: 'POST', url: '/api/v1/conversations/c1/messages' });
    expect(send.request.headers.get('X-Vereint-Chat-Group')).toBe('g-b');
    send.flush({});

    // Direktnachrichten gehören keiner Gruppe.
    service.markRead('d1', 'direct', 'g-b').subscribe();
    const read = http.expectOne({ method: 'POST', url: '/api/v1/direct-conversations/d1/read' });
    expect(read.request.headers.has('X-Vereint-Chat-Group')).toBe(false);
    read.flush({});
  });
});
