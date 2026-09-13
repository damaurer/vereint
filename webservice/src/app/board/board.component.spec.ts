import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { PagedResponse } from '../auth/auth.types';
import type { AuditLogEntry, EventSummary } from '../api/api.types';
import { BoardApiService } from './board-api.service';
import { BoardComponent } from './board.component';

const events: EventSummary[] = [
  {
    id: 'e-1',
    title: 'Sommerfest',
    status: 'active',
    startsAt: '2026-06-01T18:00:00Z',
    endsAt: null,
    ownerId: 'o-1',
    ownerDisplayName: 'Owner',
  },
];

const audit: PagedResponse<AuditLogEntry> = {
  content: [
    {
      id: 'a-1',
      action: 'notification.send',
      targetEntity: 'Notification',
      targetId: 'n-1',
      actorId: 'act-1',
      actorDisplayName: 'Kasse',
      details: 'Mitteilung versendet',
      createdAt: '2026-06-01T19:00:00Z',
    },
  ],
  page: 0,
  size: 25,
  totalElements: 1,
  totalPages: 1,
  sort: '',
};

describe('BoardComponent', () => {
  let api: {
    listEvents: ReturnType<typeof vi.fn>;
    listAuditLogs: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [BoardComponent],
      providers: [provideRouter([]), { provide: BoardApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(BoardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      listEvents: vi.fn(() => of(events)),
      listAuditLogs: vi.fn(() => of(audit)),
    };
  });

  it('renders visible events and recent audit entries', async () => {
    const fixture = await create();
    expect(html(fixture)).toContain('Sommerfest');
    expect(html(fixture)).toContain('Kommunikation');
    expect(html(fixture)).toContain('notification.send');
  });

  it('shows an empty state when there are no events', async () => {
    api.listEvents.mockReturnValue(of([]));
    const fixture = await create();
    expect(html(fixture)).toContain('Keine Events');
  });

  it('shows a neutral error state when access is denied', async () => {
    api.listEvents.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
    expect(html(fixture)).toContain('erforderlichen Rechte');
  });
});
