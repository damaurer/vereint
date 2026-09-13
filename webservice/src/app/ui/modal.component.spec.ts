import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ModalComponent } from './modal.component';

/** Nachweis des modalen Overlays (TICKET-032). */
describe('ModalComponent', () => {
  const create = (open: boolean, dismissible = true) => {
    TestBed.configureTestingModule({ imports: [ModalComponent] });
    const fixture = TestBed.createComponent(ModalComponent);
    fixture.componentInstance.open = open;
    fixture.componentInstance.dismissible = dismissible;
    fixture.componentInstance.title = 'Einladung';
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('renders nothing while closed', () => {
    const fixture = create(false);
    expect(root(fixture).querySelector('.ui-modal')).toBeFalsy();
  });

  it('renders a dialog with an accessible role while open', () => {
    const fixture = create(true);
    const dialog = root(fixture).querySelector('.ui-modal');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  it('emits closed on Escape', () => {
    const fixture = create(true);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    fixture.componentInstance.onEscape();
    expect(closed).toBe(1);
  });

  it('does not close a non-dismissible modal', () => {
    const fixture = create(true, false);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    fixture.componentInstance.requestClose();
    expect(closed).toBe(0);
  });
});
