import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StrichlisteRowComponent } from './strichliste-row.component';

/** Nachweis der Strichlisten-Zeile (TICKET-034). */
describe('StrichlisteRowComponent', () => {
  const create = (count: number) => {
    TestBed.configureTestingModule({ imports: [StrichlisteRowComponent] });
    const fixture = TestBed.createComponent(StrichlisteRowComponent);
    fixture.componentInstance.name = 'Alice';
    fixture.componentInstance.count = count;
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('renders the member name and stroke count', () => {
    const fixture = create(7);
    expect(root(fixture).textContent).toContain('Alice');
    expect(root(fixture).textContent).toContain('(7)');
  });

  it('groups strokes into fives', () => {
    const fixture = create(13);
    expect(fixture.componentInstance.tallyGroups).toEqual([5, 5, 3]);
  });

  it('emits increment on the plus button', () => {
    const fixture = create(0);
    let increments = 0;
    fixture.componentInstance.increment.subscribe(() => (increments += 1));
    const plus = Array.from(root(fixture).querySelectorAll('button'))[1] as HTMLButtonElement;
    plus.click();
    expect(increments).toBe(1);
  });

  it('emits decrement on the minus button', () => {
    const fixture = create(2);
    let decrements = 0;
    fixture.componentInstance.decrement.subscribe(() => (decrements += 1));
    const minus = Array.from(root(fixture).querySelectorAll('button'))[0] as HTMLButtonElement;
    minus.click();
    expect(decrements).toBe(1);
  });
});
