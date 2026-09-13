import { TestBed } from '@angular/core/testing';
import { InviteModalComponent } from './invite-modal.component';

interface InviteInternals {
  email: string;
  role: string;
  invites(): { id: string; email: string; status: string }[];
  error(): string | null;
  info(): string | null;
  send(): void;
  renew(id: string): void;
  close(): void;
}

describe('InviteModalComponent', () => {
  const create = (open = true) => {
    TestBed.configureTestingModule({ imports: [InviteModalComponent] });
    const fixture = TestBed.createComponent(InviteModalComponent);
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('renders the form and open invitations when open', () => {
    const fixture = create();
    expect(html(fixture)).toContain('Mitglied einladen');
    expect(html(fixture)).toContain('Offene Einladungen');
    expect(html(fixture)).toContain('flo.eber@web.de');
    expect(html(fixture)).toContain('Abgelaufen');
  });

  it('renders nothing when closed', () => {
    const fixture = create(false);
    expect(html(fixture)).not.toContain('Mitglied einladen');
  });

  it('rejects an invalid email and keeps the input', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as InviteInternals;
    const before = cmp.invites().length;
    cmp.email = 'not-an-email';
    cmp.send();
    expect(cmp.error()).toBeTruthy();
    expect(cmp.invites().length).toBe(before);
    expect(cmp.email).toBe('not-an-email');
  });

  it('adds a pending invitation for a valid email', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as InviteInternals;
    const before = cmp.invites().length;
    cmp.email = 'neu@example.org';
    cmp.send();
    expect(cmp.error()).toBeNull();
    expect(cmp.info()).toBeTruthy();
    expect(cmp.invites().length).toBe(before + 1);
    expect(cmp.invites()[0].email).toBe('neu@example.org');
    expect(cmp.email).toBe('');
  });

  it('renews an expired invitation to pending', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as InviteInternals;
    const expired = cmp.invites().find((invite) => invite.status === 'expired');
    expect(expired).toBeTruthy();
    cmp.renew(expired!.id);
    const renewed = cmp.invites().find((invite) => invite.id === expired!.id);
    expect(renewed?.status).toBe('pending');
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
