import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { EventDetail, MemberProfile } from '../api/api.types';
import { EventManageComponent } from './event-manage.component';
import { EventManageService } from './event-manage.service';

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 'e-1',
    title: 'Sommerfest',
    description: 'Beschreibung',
    location: 'Halle',
    startsAt: '2026-07-01T18:00:00Z',
    endsAt: null,
    status: 'draft',
    ownerId: 'owner-1',
    ownerDisplayName: 'Owner',
    participantCount: 1,
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

function profile(overrides: Partial<MemberProfile> = {}): MemberProfile {
  return {
    id: 'owner-1',
    keycloakSubject: 'sub-1',
    displayName: 'Owner',
    email: null,
    disabled: false,
    drinkRecorder: false,
    boardRole: null,
    roles: ['member'],
    permissions: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('EventManageComponent', () => {
  let serviceStub: Record<string, ReturnType<typeof vi.fn>>;

  const configure = async () => {
    await TestBed.configureTestingModule({
      imports: [EventManageComponent],
      providers: [
        provideRouter([]),
        { provide: EventManageService, useValue: serviceStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'e-1' } } },
        },
      ],
    }).compileComponents();
  };

  const createFixture = async () => {
    await configure();
    const fixture = TestBed.createComponent(EventManageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const textOf = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    serviceStub = {
      getEvent: vi.fn(() => of(event())),
      loadProfile: vi.fn(() => of(profile())),
      listParticipants: vi.fn(() => of([])),
      listDrinks: vi.fn(() => of([])),
      listEventFood: vi.fn(() => of([])),
      listInvites: vi.fn(() => of([])),
      listMessages: vi.fn(() => of([])),
      addParticipant: vi.fn(() => of({})),
      removeParticipant: vi.fn(() => of(undefined)),
      addDrink: vi.fn(() => of({})),
      removeDrink: vi.fn(() => of(undefined)),
      addFood: vi.fn(() => of({})),
      removeFood: vi.fn(() => of(undefined)),
      assignSublist: vi.fn(() => of([])),
      createInvite: vi.fn(() => of({ id: 'i-1', acceptPath: '/invite/accept?token=x' })),
      revokeInvite: vi.fn(() => of(undefined)),
      sendMessage: vi.fn(() => of({})),
    };
  });

  it('shows the management sections for the owner and prefills the title', async () => {
    const fixture = await createFixture();

    expect(textOf(fixture)).toContain('Sommerfest verwalten');
    expect(textOf(fixture)).toContain('Teilnehmer');
    expect(serviceStub['listParticipants']).toHaveBeenCalledWith('e-1');
    const title = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[name="title"]');
    expect(title?.value).toBe('Sommerfest');
  });

  it('denies management for a non-owner member and skips section loading', async () => {
    serviceStub['loadProfile'] = vi.fn(() => of(profile({ id: 'someone-else' })));

    const fixture = await createFixture();

    expect(textOf(fixture)).toContain('Keine Verwaltungsrechte');
    expect(serviceStub['listParticipants']).not.toHaveBeenCalled();
  });

  it('allows a board member to manage an event they do not own', async () => {
    serviceStub['loadProfile'] = vi.fn(() => of(profile({ id: 'someone-else', roles: ['member', 'board'] })));

    const fixture = await createFixture();

    expect(textOf(fixture)).not.toContain('Keine Verwaltungsrechte');
    expect(serviceStub['listParticipants']).toHaveBeenCalledWith('e-1');
  });

  it('creates a guest invite and reveals the one-time accept path', async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance as unknown as {
      inviteForm: { expiresInMinutes: string; maxUses: string };
      createInvite: () => void;
    };
    component.inviteForm.expiresInMinutes = '60';
    component.createInvite();
    fixture.detectChanges();

    expect(serviceStub['createInvite']).toHaveBeenCalledWith('e-1', { role: 'guest', expiresInMinutes: 60 });
    expect(textOf(fixture)).toContain('/invite/accept?token=x');
  });
});
