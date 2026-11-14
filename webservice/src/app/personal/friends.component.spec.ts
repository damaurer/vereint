import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FriendContact } from '../api/api.types';
import { ChatApiService } from '../chat/chat-api.service';
import { FriendsComponent } from './friends.component';
import { PersonalApiService } from './personal-api.service';

function person(
  userId: string,
  displayName: string,
  extra: Partial<FriendContact> = {},
): FriendContact {
  return {
    userId,
    displayName,
    friendStatus: 'none',
    since: null,
    sharedGroups: [{ id: 'g-1', name: 'Kegelclub' }],
    canMessage: true,
    ...extra,
  };
}

describe('FriendsComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let chat: Record<string, ReturnType<typeof vi.fn>>;

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [FriendsComponent],
      providers: [
        provideRouter([]),
        { provide: PersonalApiService, useValue: api },
        { provide: ChatApiService, useValue: chat },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    const fixture = TestBed.createComponent(FriendsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    api = {
      friends: vi.fn(() =>
        of({
          friends: [person('u-ede', 'Ede Fern', { friendStatus: 'friend', sharedGroups: [] })],
          incoming: [person('u-ina', 'Ina Frage', { friendStatus: 'incoming' })],
          outgoing: [person('u-otto', 'Otto Warte', { friendStatus: 'outgoing' })],
        }),
      ),
      contacts: vi.fn(() =>
        of([
          person('u-dora', 'Dora Neu'),
          person('u-ina', 'Ina Frage', { friendStatus: 'incoming' }),
          person('u-ede', 'Ede Fern', { friendStatus: 'friend', sharedGroups: [] }),
        ]),
      ),
      request: vi.fn(() => of(person('u-dora', 'Dora Neu', { friendStatus: 'outgoing' }))),
      accept: vi.fn(() => of(person('u-ina', 'Ina Frage', { friendStatus: 'friend' }))),
      remove: vi.fn(() => of(null)),
    };
    chat = { startDirect: vi.fn(() => of({ id: 'dm-1' })) };
  });

  it('shows requests, friends without shared group and people to add', async () => {
    const fixture = await create();
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Anfragen an dich (1)');
    expect(text).toContain('Ina Frage');
    expect(text).toContain('Ede Fern');
    expect(text).toContain('Keine gemeinsame Gruppe mehr');
    expect(text).toContain('Otto Warte');
    // Nur Personen ohne Beziehung stehen unter „Freunde hinzufügen“.
    const addButtons = Array.from(el(fixture).querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Anfragen',
    );
    expect(addButtons.length).toBe(1);
  });

  it('sends, accepts and starts a direct message', async () => {
    const fixture = await create();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const button = (label: string) =>
      Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === label,
      )!;
    button('Anfragen').click();
    expect(api['request']).toHaveBeenCalledWith('u-dora');
    button('Annehmen').click();
    expect(api['accept']).toHaveBeenCalledWith('u-ina');
    button('Nachricht').click();
    expect(chat['startDirect']).toHaveBeenCalledWith('u-ede');
    expect(navigate).toHaveBeenCalledWith(['/direktnachrichten'], { queryParams: { id: 'dm-1' } });
  });

  it('asks before ending a friendship', async () => {
    const fixture = await create();
    const button = (label: string) =>
      Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === label,
      );
    button('Entfernen')!.click();
    fixture.detectChanges();
    expect(api['remove']).not.toHaveBeenCalled();
    button('Wirklich entfernen')!.click();
    expect(api['remove']).toHaveBeenCalledWith('u-ede');
  });
});
