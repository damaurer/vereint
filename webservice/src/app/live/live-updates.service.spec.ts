import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  LIVE_RETRY_MIN_MS,
  LIVE_URL,
  LIVE_WATCHDOG_MS,
  LiveEvent,
  LiveUpdatesService,
} from './live-updates.service';

/** Nachbau von `EventSource`, der Ereignisse auf Zuruf auslöst. */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.CONNECTING;
  onerror: (() => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  fire(type: string, data = '{}'): void {
    this.readyState = FakeEventSource.OPEN;
    for (const listener of this.listeners.get(type) ?? []) listener({ data } as MessageEvent<string>);
  }

  fail(closed: boolean): void {
    this.readyState = closed ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
    this.onerror?.();
  }
}

describe('LiveUpdatesService', () => {
  let service: LiveUpdatesService;
  let events: LiveEvent[];

  const latest = () => FakeEventSource.instances.at(-1)!;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'browser' }] });
    service = TestBed.inject(LiveUpdatesService);
    events = [];
    service.events$.subscribe((event) => events.push(event));
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects once and reports the connection after the server confirmed it', () => {
    service.start();
    service.start();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(latest().url).toBe(LIVE_URL);
    expect(service.connected()).toBe(false);

    latest().fire('ready');
    expect(service.connected()).toBe(true);
    // Die erste Bestätigung löst keinen Abgleich aus, die Seiten laden ohnehin.
    expect(events).toEqual([]);
  });

  it('passes on server signals with their conversation', () => {
    service.start();
    latest().fire('ready');
    latest().fire('chat', JSON.stringify({ type: 'chat', stammtischId: 's1', conversationId: 'c1' }));
    latest().fire('notification', 'kaputt');

    expect(events).toEqual([
      { type: 'chat', stammtischId: 's1', conversationId: 'c1' },
      { type: 'notification' },
    ]);
  });

  it('filters by type and always includes resync', () => {
    const chat: LiveEvent[] = [];
    service.on('chat').subscribe((event) => chat.push(event));
    service.start();
    latest().fire('ready');
    latest().fire('direct', '{}');
    latest().fire('chat', JSON.stringify({ conversationId: 'c1' }));
    latest().fail(false);
    latest().fire('ready');

    expect(chat.map((event) => event.type)).toEqual(['chat', 'resync']);
  });

  it('falls back to polling while the connection is down and resyncs after it is back', () => {
    service.start();
    latest().fire('ready');
    latest().fail(false);
    expect(service.connected()).toBe(false);
    // Der Browser verbindet sich selbst neu; dieselbe Instanz meldet sich wieder.
    latest().fire('ready');
    expect(service.connected()).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['resync']);
  });

  it('retries with growing delay when the browser gave up', () => {
    service.start();
    latest().fail(true);
    expect(FakeEventSource.instances).toHaveLength(1);

    vi.advanceTimersByTime(LIVE_RETRY_MIN_MS);
    expect(FakeEventSource.instances).toHaveLength(2);
    latest().fail(true);
    vi.advanceTimersByTime(LIVE_RETRY_MIN_MS);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(LIVE_RETRY_MIN_MS);
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('reconnects when the heartbeat stops', () => {
    service.start();
    latest().fire('ready');
    vi.advanceTimersByTime(LIVE_WATCHDOG_MS - 1000);
    latest().fire('ping');
    vi.advanceTimersByTime(LIVE_WATCHDOG_MS - 1000);
    expect(FakeEventSource.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(service.connected()).toBe(false);
    vi.advanceTimersByTime(LIVE_RETRY_MIN_MS);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('closes the connection on stop', () => {
    service.start();
    latest().fire('ready');
    service.stop();
    expect(latest().closed).toBe(true);
    expect(service.connected()).toBe(false);
  });

  it('does nothing during SSR', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    TestBed.inject(LiveUpdatesService).start();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
