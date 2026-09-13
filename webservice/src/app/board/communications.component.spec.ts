import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { PagedResponse, UserSummary } from '../auth/auth.types';
import type { AuditLogEntry, NotificationMessage } from '../api/api.types';
import { BoardApiService } from './board-api.service';
import { CommunicationsComponent } from './communications.component';

const users: PagedResponse<UserSummary> = {
  content: [
    {
      id: 'm-1',
      keycloakSubject: 'kc-1',
      displayName: 'Alice',
      email: 'alice@example.org',
      disabled: false,
      drinkRecorder: false,
      boardRole: null,
      roles: ['member'],
      createdAt: '2026-01-01T10:00:00Z',
    },
  ],
  page: 0,
  size: 25,
  totalElements: 1,
  totalPages: 1,
  sort: '',
};

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

const sent: NotificationMessage = {
  id: 'n-2',
  title: 'Hallo',
  body: 'Text',
  type: 'general',
  read: false,
  createdAt: '2026-06-02T10:00:00Z',
};

interface CommunicationsInternals {
  form: { userId: string; title: string; body: string };
  send(): void;
}

describe('CommunicationsComponent', () => {
  let api: {
    listUsers: ReturnType<typeof vi.fn>;
    listAuditLogs: ReturnType<typeof vi.fn>;
    sendNotification: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [CommunicationsComponent],
      providers: [provideRouter([]), { provide: BoardApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(CommunicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      listUsers: vi.fn(() => of(users)),
      listAuditLogs: vi.fn(() => of(audit)),
      sendNotification: vi.fn(() => of(sent)),
    };
  });

  it('renders recipients and the notification audit trail', async () => {
    const fixture = await create();
    expect(api.listAuditLogs).toHaveBeenCalledWith('Notification');
    expect(html(fixture)).toContain('Alice');
    expect(html(fixture)).toContain('notification.send');
  });

  it('sends a notification with the trimmed form values', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as CommunicationsInternals;
    cmp.form = { userId: ' m-1 ', title: ' Hallo ', body: ' Text ' };
    cmp.send();
    expect(api.sendNotification).toHaveBeenCalledWith({
      userId: 'm-1',
      title: 'Hallo',
      body: 'Text',
    });
  });

  it('shows a neutral error state when the load fails', async () => {
    api.listUsers.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
