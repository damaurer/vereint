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

  const touch = (type: string, target: Element, y: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
    const touches = type === 'touchend' ? [] : [{ clientY: y }];
    Object.defineProperty(event, 'touches', { value: touches });
    target.dispatchEvent(event);
    return event;
  };

  it('closes when swiped down far enough', () => {
    const fixture = create(true);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    const grabber = root(fixture).querySelector('.ui-sheet-grabber')!;
    touch('touchstart', grabber, 100);
    touch('touchmove', grabber, 110);
    const move = touch('touchmove', grabber, 300);
    expect(move.defaultPrevented).toBe(true);
    expect((root(fixture).querySelector('.ui-sheet') as HTMLElement).style.transform).toBe('translateY(190px)');
    touch('touchend', grabber, 300);
    expect(closed).toBe(1);
  });

  it('snaps back after a short swipe', () => {
    const fixture = create(true);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    const head = root(fixture).querySelector('.ui-sheet-head')!;
    touch('touchstart', head, 100);
    touch('touchmove', head, 105);
    touch('touchmove', head, 110);
    touch('touchend', head, 110);
    expect(closed).toBe(0);
    expect((root(fixture).querySelector('.ui-sheet') as HTMLElement).style.transform).toBe('');
  });

  it('lets the body scroll instead of closing while it is scrolled down', () => {
    const fixture = create(true);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    const body = root(fixture).querySelector('.ui-sheet-body') as HTMLElement;
    body.scrollTop = 50;
    Object.defineProperty(body, 'scrollTop', { value: 50, configurable: true });
    touch('touchstart', body, 100);
    const move = touch('touchmove', body, 400);
    touch('touchend', body, 400);
    expect(move.defaultPrevented).toBe(false);
    expect(closed).toBe(0);
  });

  it('cannot be swiped away when not dismissible', () => {
    const fixture = create(true);
    fixture.componentInstance.dismissible = false;
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    const grabber = root(fixture).querySelector('.ui-sheet-grabber')!;
    touch('touchstart', grabber, 100);
    touch('touchmove', grabber, 400);
    touch('touchend', grabber, 400);
    expect(closed).toBe(0);
  });
});
