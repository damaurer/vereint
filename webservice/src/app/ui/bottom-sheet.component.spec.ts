import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BottomSheetComponent } from './bottom-sheet.component';

/** Nachweis des Bottom-Sheets (TICKET-032). */
describe('BottomSheetComponent', () => {
  const create = (open: boolean) => {
    TestBed.configureTestingModule({ imports: [BottomSheetComponent] });
    const fixture = TestBed.createComponent(BottomSheetComponent);
    fixture.componentInstance.open = open;
    fixture.componentInstance.title = 'Runde ausgeben';
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('renders nothing while closed', () => {
    expect(root(create(false)).querySelector('.ui-sheet')).toBeFalsy();
  });

  it('renders an accessible sheet while open', () => {
    const sheet = root(create(true)).querySelector('.ui-sheet');
    expect(sheet).toBeTruthy();
    expect(sheet?.getAttribute('role')).toBe('dialog');
    expect(sheet?.getAttribute('aria-modal')).toBe('true');
  });

  it('emits closed on Escape and backdrop', () => {
    const fixture = create(true);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    fixture.componentInstance.onEscape();
    fixture.componentInstance.onBackdrop(new MouseEvent('click'));
    expect(closed).toBe(2);
  });
});
