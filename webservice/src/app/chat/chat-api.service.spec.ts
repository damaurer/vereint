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

    service.startDirect('u-1').subscribe();
    const direct = http.expectOne({ method: 'POST', url: '/api/v1/conversations/direct' });
    expect(direct.request.body).toEqual({ userId: 'u-1' });
    direct.flush({});

    service.directory().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/users/directory' }).flush([]);

    service.me().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/users/me' }).flush({});
  });
});
