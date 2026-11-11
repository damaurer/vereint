import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { DirectoryMember } from '../api/api.types';
import { MemberApiService } from '../member/member-api.service';
import { EventCreateComponent } from './event-create.component';

const directory: DirectoryMember[] = [
  { id: 'u-2', displayName: 'Bruno', boardRole: null, roles: ['member'] },
  { id: 'u-1', displayName: 'Anna', boardRole: null, roles: ['member'] },
  { id: 'u-3', displayName: 'Carla', boardRole: 'chair', roles: ['member', 'board'] },
];

describe('EventCreateComponent', () => {
  let api: { listDirectory: ReturnType<typeof vi.fn>; createEvent: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.fn>;

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [EventCreateComponent],
      providers: [provideRouter([]), { provide: MemberApiService, useValue: api }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(EventCreateComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  type Form = {
    title: string;
    description: string;
    location: string;
    startsAt: string;
    endsAt: string;
    timing: 'onPublish' | 'at';
    notifyAt: string;
    reminderHours: number | null;
    statisticsEnabled: boolean;
  };
  const cmp = (fixture: { componentInstance: unknown }) =>
    fixture.componentInstance as unknown as {
      form: Form;
      selectedIds: string[];
      inviteAll: boolean;
      submit(status: 'draft' | 'published'): void;
    };
  const text = (fixture: { nativeElement: unknown }) => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      listDirectory: vi.fn(() => of(directory)),
      createEvent: vi.fn(() => of({ id: 'e-42' })),
    };
  });

  it('lists members by name, sorted, with a search filter', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const names = Array.from(root.querySelectorAll('.picker-item span')).map((el) => el.textContent?.trim());
    expect(names).toEqual(['Anna', 'Bruno', 'Carla']);

    const search = root.querySelector('.picker-search input') as HTMLInputElement;
    search.value = 'car';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const filtered = Array.from(root.querySelectorAll('.picker-item span')).map((el) => el.textContent?.trim());
    expect(filtered).toEqual(['Carla']);
  });

  it('offers both submit buttons and the reminder options', async () => {
    const fixture = await create();
    expect(text(fixture)).toContain('Als Entwurf speichern');
    expect(text(fixture)).toContain('Veröffentlichen und einladen');
    expect(text(fixture)).toContain('Alle Mitglieder einladen');
    const options = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('select[name="reminder"] option'));
    expect(options.length).toBe(5);
  });

  it('publishes with the selected invitees and opens the manage page', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const c = cmp(fixture);
    c.form.title = '  Grillabend ';
    c.form.startsAt = '2026-11-01T18:00';
    c.form.endsAt = '2026-11-01T23:00';
    c.form.reminderHours = 24;
    (root.querySelectorAll('.picker-item input')[0] as HTMLInputElement).click();
    fixture.detectChanges();
    c.submit('published');

    expect(api.createEvent).toHaveBeenCalledWith({
      title: 'Grillabend',
      description: null,
      location: null,
      startsAt: new Date('2026-11-01T18:00').toISOString(),
      endsAt: new Date('2026-11-01T23:00').toISOString(),
      status: 'published',
      invitationNotifyAt: null,
      reminderHoursBefore: 24,
      statisticsEnabled: true,
      inviteUserIds: ['u-1'],
    });
    expect(navigate).toHaveBeenCalledWith(['/events', 'e-42', 'manage']);
  });

  it('saves a draft that invites all members at a chosen time', async () => {
    const fixture = await create();
    const c = cmp(fixture);
    c.form.title = 'Jahreshauptversammlung';
    c.form.startsAt = '2026-12-01T19:00';
    c.form.timing = 'at';
    c.form.notifyAt = '2026-11-20T09:00';
    c.inviteAll = true;
    c.submit('draft');

    const payload = api.createEvent.mock.calls[0][0];
    expect(payload.status).toBe('draft');
    expect(payload.inviteAllMembers).toBe(true);
    expect(payload.inviteUserIds).toBeUndefined();
    expect(payload.invitationNotifyAt).toBe(new Date('2026-11-20T09:00').toISOString());
    expect(payload.reminderHoursBefore).toBeNull();
  });

  it('sends the statistics switch of the event', async () => {
    const fixture = await create();
    const c = cmp(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="event-statistics-switch"]')).not.toBeNull();
    c.form.title = 'Ohne Statistik';
    c.form.startsAt = '2026-11-20T19:00';
    c.form.statisticsEnabled = false;
    c.submit('draft');

    expect(api.createEvent.mock.calls[0][0].statisticsEnabled).toBe(false);
  });

  it('validates title, start and the end time before sending', async () => {
    const fixture = await create();
    const c = cmp(fixture);
    c.submit('published');
    fixture.detectChanges();
    expect(text(fixture)).toContain('Titel');
    c.form.title = 'X';
    c.form.startsAt = '2026-12-01T19:00';
    c.form.endsAt = '2026-12-01T18:00';
    c.submit('published');
    fixture.detectChanges();
    expect(text(fixture)).toContain('Ende');
    expect(api.createEvent).not.toHaveBeenCalled();
  });

  it('shows the server error and stays on the page', async () => {
    api.createEvent.mockReturnValue(throwError(() => new ApiError(403, 'permission_denied', '')));
    const fixture = await create();
    const c = cmp(fixture);
    c.form.title = 'X';
    c.form.startsAt = '2026-12-01T19:00';
    c.submit('published');
    fixture.detectChanges();
    expect(text(fixture)).toContain('Rechte');
    expect(navigate).not.toHaveBeenCalled();
  });
});
