import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { AuthService } from '../auth/auth.service';
import { LiveUpdatesService, type LiveEvent } from '../live/live-updates.service';
import { ChatApiService } from './chat-api.service';
import {
  CHAT_OUTBOX_RETRY_MS,
  CHAT_OUTBOX_STORAGE_KEY,
  ChatOutboxService,
  clearChatOutbox,
  type OutboxEntry,
} from './chat-outbox.service';
import { chatMessage } from './chat-test-data';

describe('ChatOutboxService', () => {
  let api: { send: ReturnType<typeof vi.fn> };
  let session: { uid: string; stammtisch: { id: string; name: string } | null };
  let liveEvents: Subject<LiveEvent>;

  const settle = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };

  const service = () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChatApiService, useValue: api },
        { provide: AuthService, useValue: { getSession: () => Promise.resolve(session) } },
        { provide: LiveUpdatesService, useValue: { on: () => liveEvents.asObservable() } },
      ],
    });
    return TestBed.inject(ChatOutboxService);
  };

  const stored = (): OutboxEntry[] => JSON.parse(localStorage.getItem(CHAT_OUTBOX_STORAGE_KEY) ?? '[]');

  beforeEach(() => {
    localStorage.clear();
    api = { send: vi.fn((id: string, message: string) => of(chatMessage({ id: 'm-new', conversationId: id, message }))) };
    session = { uid: 'kc-me', stammtisch: { id: 'st-1', name: 'Test' } };
    liveEvents = new Subject<LiveEvent>();
  });

  afterEach(() => vi.useRealTimers());

  it('sends right away and reports the delivered message', async () => {
    const outbox = service();
    const delivered = vi.fn();
    outbox.delivered$.subscribe(delivered);
    const entry = await outbox.enqueue('c-1', 'club', 'Hallo');
    await settle();
    expect(api.send).toHaveBeenCalledWith('c-1', 'Hallo', 'club', entry.clientId, 'st-1', undefined);
    expect(delivered).toHaveBeenCalledWith(expect.objectContaining({ entry }));
    expect(outbox.entries()).toEqual([]);
    expect(localStorage.getItem(CHAT_OUTBOX_STORAGE_KEY)).toBeNull();
  });

  it('keeps messages on the device while offline and sends them in order with backoff', async () => {
    vi.useFakeTimers();
    api.send.mockReturnValue(throwError(() => new ApiError(0, 'network_error', '')));
    const outbox = service();
    await outbox.enqueue('c-1', 'club', 'Eins');
    await outbox.enqueue('c-1', 'club', 'Zwei');
    await settle();
    expect(stored().map((entry) => entry.message)).toEqual(['Eins', 'Zwei']);
    expect(outbox.forConversation('c-1').every((entry) => entry.state === 'pending')).toBe(true);
    // Beim ersten Fehler hört die Runde auf, die zweite Nachricht wartet.
    const callsWhileOffline = api.send.mock.calls.length;

    api.send.mockImplementation((id: string, message: string) => of(chatMessage({ conversationId: id, message })));
    await vi.advanceTimersByTimeAsync(CHAT_OUTBOX_RETRY_MS[0]);
    await settle();
    const sent = api.send.mock.calls.slice(callsWhileOffline).map((call) => call[1]);
    expect(sent).toEqual(['Eins', 'Zwei']);
    expect(outbox.entries()).toEqual([]);
  });

  it('sends waiting messages as soon as the network is back', async () => {
    api.send.mockReturnValueOnce(throwError(() => new ApiError(503, 'service_unavailable', '')));
    const outbox = service();
    await outbox.enqueue('d-1', 'direct', 'Bist du da?');
    await settle();
    expect(outbox.entries()).toHaveLength(1);
    globalThis.dispatchEvent(new Event('online'));
    await settle();
    expect(api.send).toHaveBeenCalledTimes(2);
    expect(api.send.mock.calls[0][3]).toBe(api.send.mock.calls[1][3]);
    expect(outbox.entries()).toEqual([]);
  });

  it('marks rejected messages as failed and can retry or discard them', async () => {
    api.send.mockReturnValueOnce(throwError(() => new ApiError(403, 'access_denied', '')));
    const outbox = service();
    const entry = await outbox.enqueue('c-1', 'event', 'Hallo');
    await settle();
    expect(outbox.entries()[0].state).toBe('failed');
    outbox.retry(entry.clientId);
    await settle();
    expect(api.send).toHaveBeenCalledTimes(2);
    expect(outbox.entries()).toEqual([]);

    api.send.mockReturnValueOnce(throwError(() => new ApiError(400, 'invalid_request', '')));
    const second = await outbox.enqueue('c-1', 'event', 'Nochmal');
    await settle();
    outbox.discard(second.clientId);
    expect(outbox.entries()).toEqual([]);
  });

  it('sends group chats with their own group and only for the account that wrote them', async () => {
    const entries: OutboxEntry[] = [
      { clientId: 'a', conversationId: 'c-1', type: 'club', stammtischId: 'st-2', owner: 'kc-me', message: 'Andere Gruppe', createdAt: new Date().toISOString(), state: 'pending' },
      { clientId: 'b', conversationId: 'c-2', type: 'club', stammtischId: 'st-1', owner: 'kc-other', message: 'Anderes Konto', createdAt: new Date().toISOString(), state: 'pending' },
      { clientId: 'c', conversationId: 'd-1', type: 'direct', stammtischId: null, owner: 'kc-me', message: 'DM', createdAt: new Date().toISOString(), state: 'pending' },
    ];
    localStorage.setItem(CHAT_OUTBOX_STORAGE_KEY, JSON.stringify(entries));
    const outbox = service();
    await outbox.start();
    await settle();
    expect(api.send.mock.calls.map((call) => [call[1], call[4]])).toEqual([
      ['Andere Gruppe', 'st-2'],
      ['DM', null],
    ]);
    expect(outbox.entries()).toEqual([]);
    // Die Nachricht des anderen Kontos bleibt auf dem Gerät liegen.
    expect(stored().map((entry) => entry.clientId)).toEqual(['b']);
  });

  it('drops entries older than a week and clears everything on logout', async () => {
    const old: OutboxEntry = {
      clientId: 'old', conversationId: 'c-1', type: 'club', stammtischId: 'st-9', owner: 'kc-me', message: 'Alt',
      createdAt: '2020-01-01T00:00:00Z', state: 'pending',
    };
    localStorage.setItem(CHAT_OUTBOX_STORAGE_KEY, JSON.stringify([old]));
    const outbox = service();
    await outbox.start();
    expect(outbox.entries()).toEqual([]);
    localStorage.setItem(CHAT_OUTBOX_STORAGE_KEY, '[]');
    clearChatOutbox();
    expect(localStorage.getItem(CHAT_OUTBOX_STORAGE_KEY)).toBeNull();
  });
});
