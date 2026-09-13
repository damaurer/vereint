import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { TabletMember } from '../api/api.types';
import { RevenueSheetComponent } from './revenue-sheet.component';

const members: TabletMember[] = [
  { memberId: 'm-1', displayName: 'Alice' },
  { memberId: 'm-2', displayName: 'Bob' },
];

/** Nachweis des Runden-/Abend-Sheets (TICKET-034). */
describe('RevenueSheetComponent', () => {
  const create = (open: boolean, kind: 'round' | 'evening' = 'round') => {
    TestBed.configureTestingModule({ imports: [RevenueSheetComponent] });
    const fixture = TestBed.createComponent(RevenueSheetComponent);
    fixture.componentInstance.open = open;
    fixture.componentInstance.kind = kind;
    fixture.componentInstance.members = members;
    fixture.componentInstance.selection = { 'm-1': true, 'm-2': false };
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('renders nothing while closed', () => {
    const fixture = create(false);
    expect(root(fixture).querySelector('.sheet-list')).toBeFalsy();
  });

  it('renders the beneficiaries and an idempotency hint while open', () => {
    const fixture = create(true);
    expect(root(fixture).textContent).toContain('Alice');
    expect(root(fixture).textContent).toContain('Bob');
    expect(root(fixture).textContent).toContain('Idempotency');
  });

  it('reflects the checkbox state from the selection', () => {
    const fixture = create(true);
    const checkboxes = Array.from(
      root(fixture).querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it('emits toggle for a member checkbox change', () => {
    const fixture = create(true);
    let toggled: string | null = null;
    fixture.componentInstance.toggle.subscribe((id) => (toggled = id));
    const checkboxes = Array.from(
      root(fixture).querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    checkboxes[1].dispatchEvent(new Event('change'));
    expect(toggled).toBe('m-2');
  });

  it('switches the title and confirm label with the kind', () => {
    const fixture = create(true, 'round');
    expect(root(fixture).textContent).toContain('Runde ausgeben');
    fixture.componentInstance.kind = 'evening';
    fixture.detectChanges();
    expect(root(fixture).textContent).toContain('Abend stiften');
  });

  it('emits confirm when the action button is used', () => {
    const fixture = create(true);
    let confirmed = 0;
    fixture.componentInstance.confirm.subscribe(() => (confirmed += 1));
    const button = Array.from(root(fixture).querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Runde ausgeben'),
    ) as HTMLButtonElement;
    button.click();
    expect(confirmed).toBe(1);
  });
});
