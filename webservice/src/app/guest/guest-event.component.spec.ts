import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { ChatMessage } from '../events/event-manage.types';
import { GuestEventComponent } from './guest-event.component';
import { GuestEventService } from './guest-event.service';

function message(id: string, text: string): ChatMessage {
  return {
    id,
    conversationId: 'c-1',
    senderType: 'guest',
    senderId: null,
    senderName: 'Gast',
    message: text,
    imageUrl: null,
    createdAt: '2026-07-01T18:05:00Z',
  };
}

describe('GuestEventComponent', () => {
  let serviceStub: { listMessages: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn> };
  let query: Record<string, string | null>;

  const configure = async () => {
    await TestBed.configureTestingModule({
      imports: [GuestEventComponent],
      providers: [
        { provide: GuestEventService, useValue: serviceStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => 'e-1' },
              queryParamMap: { get: (key: string) => query[key] ?? null },
            },
          },
        },
      ],
    }).compileComponents();
  };

  const createFixture = async () => {
    await configure();
    const fixture = TestBed.createComponent(GuestEventComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const textOf = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    query = {};
    serviceStub = {
      listMessages: vi.fn(() => of([message('m-1', 'Willkommen')])),
      sendMessage: vi.fn(() => of(message('m-2', 'Danke'))),
    };
  });

  it('shows a neutral notice and does not call the service without a token', async () => {
    const fixture = await createFixture();

    expect(textOf(fixture)).toContain('Kein Gastzugang');
    expect(serviceStub.listMessages).not.toHaveBeenCalled();
  });

  it('loads the guest chat with the token from the magic link', async () => {
    query = { token: 'guest-secret', title: 'Sommerfest' };

    const fixture = await createFixture();

    expect(serviceStub.listMessages).toHaveBeenCalledWith('e-1', 'guest-secret');
    expect(textOf(fixture)).toContain('Sommerfest');
    expect(textOf(fixture)).toContain('Willkommen');
  });

  it('sends a guest message with the token and reloads', async () => {
    query = { token: 'guest-secret' };

    const fixture = await createFixture();
    const component = fixture.componentInstance as unknown as { message: string; send: () => void };
    component.message = 'Hallo';
    component.send();
    fixture.detectChanges();

    expect(serviceStub.sendMessage).toHaveBeenCalledWith('e-1', 'guest-secret', { message: 'Hallo' });
    // Nach dem Senden wird der Chat erneut geladen (initial + Reload).
    expect(serviceStub.listMessages).toHaveBeenCalledTimes(2);
  });
});
