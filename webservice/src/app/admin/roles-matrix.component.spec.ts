import { TestBed } from '@angular/core/testing';
import { RolesMatrixComponent } from './roles-matrix.component';

interface MatrixInternals {
  rows(): { key: string; label: string; roles: Record<string, boolean> }[];
  dirty(): boolean;
  savedInfo(): boolean;
  onToggle(): void;
  save(): void;
  discard(): void;
  memberCount(role: string): number;
}

describe('RolesMatrixComponent', () => {
  const create = () => {
    TestBed.configureTestingModule({ imports: [RolesMatrixComponent] });
    const fixture = TestBed.createComponent(RolesMatrixComponent);
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('renders the permission rows and role columns', () => {
    const fixture = create();
    expect(html(fixture)).toContain('Rollen & Berechtigungen');
    expect(html(fixture)).toContain('Guthaben verwalten (Aufladen / Buchen)');
    expect(html(fixture)).toContain('Neue Mitglieder einladen');
  });

  it('marks the matrix dirty when a checkbox is toggled and clears it on save', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as MatrixInternals;
    expect(cmp.dirty()).toBe(false);

    cmp.rows()[0].roles['member'] = !cmp.rows()[0].roles['member'];
    cmp.onToggle();
    expect(cmp.dirty()).toBe(true);

    cmp.save();
    expect(cmp.dirty()).toBe(false);
    expect(cmp.savedInfo()).toBe(true);
  });

  it('restores the last saved state when changes are discarded', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as MatrixInternals;
    const original = cmp.rows()[0].roles['member'];

    cmp.rows()[0].roles['member'] = !original;
    cmp.onToggle();
    expect(cmp.dirty()).toBe(true);

    cmp.discard();
    expect(cmp.dirty()).toBe(false);
    expect(cmp.rows()[0].roles['member']).toBe(original);
  });

  it('shows the member counts passed via input', () => {
    const fixture = create();
    fixture.componentRef.setInput('roleCounts', { admin: 3, member: 9 });
    fixture.detectChanges();
    const cmp = fixture.componentInstance as unknown as MatrixInternals;
    expect(cmp.memberCount('admin')).toBe(3);
    expect(cmp.memberCount('member')).toBe(9);
    expect(cmp.memberCount('treasurer')).toBe(0);
  });
});
