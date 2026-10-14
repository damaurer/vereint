import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import { MemberInvitesApiService, type MemberInvite } from '../invites/member-invites-api.service';
import { InviteModalComponent } from './invite-modal.component';

interface InviteInternals {
  label: string;
  maxUses: number;
  validityDays: number;
  invites(): MemberInvite[];
  created(): { url: string; expiresAt: string } | null;
  error(): string | null;
  create(): void;
  revoke(invite: MemberInvite): void;
  close(): void;
}

const invite = (overrides: Partial<MemberInvite> = {}): MemberInvite => ({
  id: 'inv-1',
  label: 'Anna Neumann',
  status: 'active',
  maxUses: 1,
  usesCount: 0,
  expiresAt: '2026-10-21T08:00:00Z',
  createdAt: '2026-10-14T08:00:00Z',
  createdByName: 'Vorstand',
  revokedAt: null,
  registeredMembers: [],
  ...overrides,
});

describe('InviteModalComponent', () => {
  let api: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      list: vi.fn(() =>
        of([invite(), invite({ id: 'inv-2', label: null, status: 'used', usesCount: 1, registeredMembers: ['Ben Alt'] })]),
      ),
      create: vi.fn(() =>
        of({ invite: invite({ id: 'inv-new', label: 'Neu' }), token: 'raw-token', registerPath: '/register#raw-token' }),
      ),
      revoke: vi.fn(() => of(invite({ status: 'revoked', revokedAt: '2026-10-14T09:00:00Z' }))),
    };
  });

  const create = (open = true) => {
    TestBed.configureTestingModule({
      imports: [InviteModalComponent],
      providers: [{ provide: MemberInvitesApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(InviteModalComponent);
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
    return fixture;
  };

  const text = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('loads and shows existing links when opened', () => {
    const fixture = create();
    expect(api.list).toHaveBeenCalledOnce();
    expect(text(fixture)).toContain('Anna Neumann');
    expect(text(fixture)).toContain('Offen');
    expect(text(fixture)).toContain('Verwendet');
    expect(text(fixture)).toContain('Registriert: Ben Alt');
    expect(text(fixture)).toContain('Zurückziehen');
  });

  it('does nothing while closed', () => {
    const fixture = create(false);
    expect(api.list).not.toHaveBeenCalled();
    expect(text(fixture)).not.toContain('Mitglied einladen');
  });

  it('creates a link and shows the full URL once', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as InviteInternals;
    cmp.label = '  Neu  ';
    cmp.maxUses = 2;
    cmp.validityDays = 30;
    cmp.create();
    fixture.detectChanges();

    expect(api.create).toHaveBeenCalledWith({ label: 'Neu', expiresInDays: 30, maxUses: 2 });
    expect(cmp.created()?.url).toBe(`${globalThis.location.origin}/register#raw-token`);
    expect(cmp.invites()[0].id).toBe('inv-new');
    expect(text(fixture)).toContain('Einladungslink erstellt');

    cmp.close();
    expect(cmp.created()).toBeNull();
  });

  it('rejects an out-of-range number of people without calling the API', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as InviteInternals;
    cmp.maxUses = 0;
    cmp.create();
    expect(cmp.error()).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('shows a readable error when creating fails', () => {
    api.create.mockReturnValue(throwError(() => new ApiError(403, 'access_denied', 'nope')));
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as InviteInternals;
    cmp.create();
    expect(cmp.error()).toContain('Rechte');
    expect(cmp.created()).toBeNull();
  });

  it('revokes an open link', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as InviteInternals;
    cmp.revoke(cmp.invites()[0]);
    expect(api.revoke).toHaveBeenCalledWith('inv-1');
    expect(cmp.invites()[0].status).toBe('revoked');
  });

  it('emits closed when the modal is dismissed', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as InviteInternals;
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    cmp.close();
    expect(closed).toBe(true);
  });
});
