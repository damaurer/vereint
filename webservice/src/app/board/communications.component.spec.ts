import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { PagedResponse } from '../auth/auth.types';
import type { AuditLogEntry, ConversationSummary, DirectoryMember } from '../api/api.types';
import { BoardApiService } from './board-api.service';
import { CommunicationsComponent } from './communications.component';

const directory: DirectoryMember[] = [
  { id: 'm-2', displayName: 'Bob', boardRole: null, roles: ['member'] },
  { id: 'm-1', displayName: 'Alice', boardRole: 'treasurer', roles: ['member', 'board'] },
];

const audit: PagedResponse<AuditLogEntry> = {
  content: [
    {
      id: 'a-1',
      action: 'notification.send',
      targetEntity: 'Notification',
      targetId: 'n-1',
      actorId: 'act-1',
      actorDisplayName: 'Schriftführer',
      details: 'Ankündigung',
      createdAt: '2026-06-01T19:00:00Z',
    },
  ],
  page: 0,
  size: 25,
  totalElements: 1,
  totalPages: 1,
  sort: '',
};

const club = (text: string | null): ConversationSummary => ({
  id: 'c-1',
  type: 'club',
  title: 'Gruppenchat',
  eventId: null,
  partnerId: null,
  partnerName: null,
  lastMessage: null,
  unreadCount: 0,
  pinned: text ? { text, authorName: 'Schriftwart', pinnedAt: '2026-06-01T19:00:00Z' } : null,
  canWrite: true,
});

describe('CommunicationsComponent', () => {
  let api: {
    listDirectory: ReturnType<typeof vi.fn>;
    listAuditLogs: ReturnType<typeof vi.fn>;
    broadcast: ReturnType<typeof vi.fn>;
    getClubConversation: ReturnType<typeof vi.fn>;
    pinClubNotice: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [CommunicationsComponent],
      providers: [provideRouter([]), { provide: BoardApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(CommunicationsComponent);
    await settle(fixture);
    return fixture;
  };

  const settle = async (fixture: ComponentFixture<CommunicationsComponent>) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const html = (fixture: { nativeElement: unknown }) => root(fixture).textContent ?? '';

  const fill = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  const button = (fixture: { nativeElement: unknown }, text: string) =>
    Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === text,
    )!;

  const composeForm = (fixture: { nativeElement: unknown }) =>
    button(fixture, 'Senden').closest('form')!;

  const fillMessage = async (fixture: ComponentFixture<CommunicationsComponent>) => {
    const form = composeForm(fixture);
    fill(form.querySelector<HTMLInputElement>('input[name="title"]')!, ' Hallo ');
    fill(form.querySelector<HTMLTextAreaElement>('textarea[name="body"]')!, ' Text ');
    await settle(fixture);
  };

  beforeEach(() => {
    api = {
      listDirectory: vi.fn(() => of(directory)),
      listAuditLogs: vi.fn(() => of(audit)),
      broadcast: vi.fn(() => of({ sent: 12 })),
      getClubConversation: vi.fn(() => of(club('Grillfest am Samstag'))),
      pinClubNotice: vi.fn((text: string | null) => of(club(text))),
    };
  });

  it('renders the current notice and the notification audit trail', async () => {
    const fixture = await create();
    expect(api.listAuditLogs).toHaveBeenCalledWith('Notification');
    expect(root(fixture).querySelector('[data-testid="current-pin"]')?.textContent).toContain(
      'Grillfest am Samstag',
    );
    expect(root(fixture).querySelector<HTMLTextAreaElement>('textarea[name="pinText"]')!.value).toBe(
      'Grillfest am Samstag',
    );
    expect(html(fixture)).toContain('notification.send');
    expect(html(fixture)).not.toContain('Mitglieds-ID');
  });

  it('pins and removes the club chat notice', async () => {
    const fixture = await create();
    fill(root(fixture).querySelector<HTMLTextAreaElement>('textarea[name="pinText"]')!, ' Neu ');
    await settle(fixture);
    button(fixture, 'Anpinnen').click();
    await settle(fixture);
    expect(api.pinClubNotice).toHaveBeenCalledWith('Neu');
    expect(html(fixture)).toContain('Infotafel angepinnt.');

    button(fixture, 'Entfernen').click();
    await settle(fixture);
    expect(api.pinClubNotice).toHaveBeenLastCalledWith(null);
    expect(html(fixture)).toContain('Aktuell ist keine Infotafel angepinnt.');
    expect(button(fixture, 'Entfernen').disabled).toBe(true);
  });

  it('broadcasts to all members and shows how many received it', async () => {
    const fixture = await create();
    await fillMessage(fixture);
    composeForm(fixture).dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(api.broadcast).toHaveBeenCalledWith({ allMembers: true, title: 'Hallo', body: 'Text' });
    expect(html(fixture)).toContain('Mitteilung gesendet.');
    expect(html(fixture)).toContain('12 Mitglieder haben die Mitteilung erhalten.');
  });

  it('broadcasts to members chosen by name', async () => {
    const fixture = await create();
    const selected = root(fixture).querySelector<HTMLInputElement>(
      'input[name="recipientMode"][value="selected"]',
    )!;
    selected.checked = true;
    selected.dispatchEvent(new Event('change'));
    await settle(fixture);

    const names = Array.from(root(fixture).querySelectorAll('.comm-options .comm-choice span:first-of-type')).map(
      (n) => n.textContent?.trim(),
    );
    expect(names).toEqual(['Alice', 'Bob']);

    fill(root(fixture).querySelector<HTMLInputElement>('input[name="recipientSearch"]')!, 'bo');
    await settle(fixture);
    const boxes = root(fixture).querySelectorAll<HTMLInputElement>('.comm-options input[type="checkbox"]');
    expect(boxes.length).toBe(1);
    boxes[0].click();
    await settle(fixture);
    expect(root(fixture).querySelector('.comm-chips')?.textContent).toContain('Bob');

    await fillMessage(fixture);
    composeForm(fixture).dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(api.broadcast).toHaveBeenCalledWith({ userIds: ['m-2'], title: 'Hallo', body: 'Text' });
  });

  it('asks for at least one recipient when none is selected', async () => {
    const fixture = await create();
    const selected = root(fixture).querySelector<HTMLInputElement>(
      'input[name="recipientMode"][value="selected"]',
    )!;
    selected.checked = true;
    selected.dispatchEvent(new Event('change'));
    await settle(fixture);
    await fillMessage(fixture);
    composeForm(fixture).dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(api.broadcast).not.toHaveBeenCalled();
    expect(html(fixture)).toContain('Wähle mindestens ein Mitglied aus.');
  });

  it('shows a neutral error state when the audit trail fails', async () => {
    api.listAuditLogs.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
