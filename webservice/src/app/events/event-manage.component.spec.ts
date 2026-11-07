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

function showTab(fixture: { componentInstance: unknown; detectChanges(): void }, tab: string): void {
  (fixture.componentInstance as { tab: { set(value: string): void } }).tab.set(tab);
  fixture.detectChanges();
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
      inviteMembers: vi.fn(() => of([])),
      listDirectory: vi.fn(() =>
        of([
          { id: 'u-2', displayName: 'Bruno', boardRole: null, roles: ['member'] },
          { id: 'u-3', displayName: 'Carla', boardRole: null, roles: ['member'] },
        ]),
      ),
      listCatalogDrinks: vi.fn(() =>
        of([
          { id: 'd-1', name: 'Helles', defaultPrice: 2.5, currency: 'EUR', status: 'approved', active: true, catalogVersion: 1 },
          { id: 'd-2', name: 'Apfelschorle', defaultPrice: 2, currency: 'EUR', status: 'approved', active: true, catalogVersion: 1 },
        ]),
      ),
      listClubFood: vi.fn(() =>
        of([{ id: 'f-1', name: 'Brezn', category: null, defaultPrice: '1.50', costPrice: '0.50', currency: 'EUR', active: true }]),
      ),
      listSublists: vi.fn(() => of([{ id: 's-1', name: 'Sommerkarte', itemCount: 4 }])),
      updateEvent: vi.fn((_id: string, payload: object) => of(event(payload as Partial<EventDetail>))),
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
    showTab(fixture, 'guests');

    expect(serviceStub['createInvite']).toHaveBeenCalledWith('e-1', { role: 'guest', expiresInMinutes: 60 });
    expect(textOf(fixture)).toContain('/invite/accept?token=x');
  });

  it('lists participants by name with their answer and invites members picked by name', async () => {
    serviceStub['listParticipants'] = vi.fn(() =>
      of([{ userId: 'u-2', displayName: 'Bruno', role: 'participant', joinedAt: '2026-06-01T10:00:00Z', rsvp: 'maybe' }]),
    );
    const fixture = await createFixture();
    const root = fixture.nativeElement as HTMLElement;
    showTab(fixture, 'participants');
    expect(textOf(fixture)).toContain('Bruno');
    expect(textOf(fixture)).toContain('Vielleicht');
    expect(root.querySelector('input[name="participantId"]')).toBeNull();

    // Bruno ist schon eingeladen: nur Carla steht zur Auswahl.
    const pickable = Array.from(root.querySelectorAll('.picker-item span')).map((el) => el.textContent?.trim());
    expect(pickable).toEqual(['Carla']);
    (root.querySelector('.picker-item input') as HTMLInputElement).click();
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as { inviteMembers(): void };
    component.inviteMembers();
    expect(serviceStub['inviteMembers']).toHaveBeenCalledWith('e-1', { userIds: ['u-3'] });
  });

  it('invites all members at once', async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance as unknown as { inviteAll: boolean; inviteMembers(): void };
    component.inviteAll = true;
    component.inviteMembers();
    expect(serviceStub['inviteMembers']).toHaveBeenCalledWith('e-1', { allMembers: true });
  });

  it('picks event drinks, food and sublists by name instead of ids', async () => {
    serviceStub['listDrinks'] = vi.fn(() => of([{ id: 'ed-1', drinkId: 'd-2', drinkName: 'Apfelschorle', price: '2.00', currency: 'EUR' }]));
    const fixture = await createFixture();
    const root = fixture.nativeElement as HTMLElement;
    showTab(fixture, 'drinks');
    const drinkOptions = Array.from(root.querySelectorAll('select[name="drinkId"] option')).map((o) => o.textContent?.trim());
    expect(drinkOptions.some((o) => o?.startsWith('Helles'))).toBe(true);
    expect(drinkOptions.some((o) => o?.startsWith('Apfelschorle'))).toBe(false);
    const drinkRow = root.querySelector('.manage-row')?.textContent ?? '';
    expect(drinkRow).toContain('Apfelschorle');
    expect(drinkRow).not.toContain('d-2');
    expect(root.querySelector('select[name="foodId"]')?.textContent).toContain('Brezn');
    expect(root.querySelector('select[name="sublistId"]')?.textContent).toContain('Sommerkarte');

    const component = fixture.componentInstance as unknown as {
      drinkForm: { drinkId: string; price: string; costPrice: string; currency: string };
      addDrink(): void;
    };
    component.drinkForm.drinkId = 'd-1';
    component.addDrink();
    expect(serviceStub['addDrink']).toHaveBeenCalledWith('e-1', { drinkId: 'd-1', price: undefined, costPrice: undefined, currency: undefined });
  });

  it('saves the invitation timing and reminder with the event', async () => {
    serviceStub['getEvent'] = vi.fn(() => of(event({ invitationNotifyAt: '2026-06-20T08:00:00Z', reminderHoursBefore: 24 })));
    const fixture = await createFixture();
    const component = fixture.componentInstance as unknown as {
      form: { timing: 'onPublish' | 'at'; notifyAt: string; reminderHours: number | null };
      saveEvent(): void;
    };
    expect(component.form.timing).toBe('at');
    expect(component.form.reminderHours).toBe(24);

    component.saveEvent();
    let payload = serviceStub['updateEvent'].mock.calls[0][1];
    expect(payload.invitationNotifyAt).toBe('2026-06-20T08:00:00.000Z');
    expect(payload.reminderHoursBefore).toBe(24);
    expect(payload.inviteOnPublish).toBeUndefined();

    component.form.timing = 'onPublish';
    component.form.reminderHours = null;
    component.saveEvent();
    payload = serviceStub['updateEvent'].mock.calls[1][1];
    expect(payload.inviteOnPublish).toBe(true);
    expect(payload.invitationNotifyAt).toBeUndefined();
    expect(payload.reminderHoursBefore).toBe(0);
  });
});
