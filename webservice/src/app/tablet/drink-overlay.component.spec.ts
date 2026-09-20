import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { EventDrink } from '../events/event-manage.types';
import { DrinkOverlayComponent } from './drink-overlay.component';

const drinks: EventDrink[] = [
  {
    id: 'd-1',
    eventId: 'e-1',
    drinkId: 'g-1',
    drinkName: 'Bier',
    price: '2.50',
    currency: 'EUR',
    selfServiceEnabled: true,
    tabletEnabled: true,
    catalogVersion: 1,
    imageSnapshot: null,
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
  },
];

/** Nachweis des Getränke-Overlays (TICKET-034). */
describe('DrinkOverlayComponent', () => {
  const create = (open: boolean, selectedId: string | null = null) => {
    TestBed.configureTestingModule({ imports: [DrinkOverlayComponent] });
    const fixture = TestBed.createComponent(DrinkOverlayComponent);
    fixture.componentInstance.open = open;
    fixture.componentInstance.drinks = drinks;
    fixture.componentInstance.selectedId = selectedId;
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  const confirmButton = (fixture: { nativeElement: unknown }) =>
    Array.from(root(fixture).querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Auswahl bestätigen'),
    ) as HTMLButtonElement;

  it('renders nothing while closed', () => {
    const fixture = create(false);
    expect(root(fixture).querySelector('.overlay-grid')).toBeFalsy();
  });

  it('renders the drink cards while open', () => {
    const fixture = create(true);
    expect(root(fixture).textContent).toContain('Bier');
    expect(root(fixture).querySelectorAll('[role="option"]').length).toBe(1);
  });

  it('emits the selected drink id', () => {
    const fixture = create(true);
    let selected: string | null = null;
    fixture.componentInstance.itemSelect.subscribe((id) => (selected = id));
    (root(fixture).querySelector('[role="option"]') as HTMLButtonElement).click();
    expect(selected).toBe('d-1');
  });

  it('disables confirm while no drink is selected', () => {
    const fixture = create(true, null);
    expect(confirmButton(fixture).disabled).toBe(true);
  });

  it('enables confirm once a drink is selected', () => {
    const fixture = create(true, 'd-1');
    expect(confirmButton(fixture).disabled).toBe(false);
  });

  it('emits confirm when the sticky button is used', () => {
    const fixture = create(true, 'd-1');
    let confirmed = 0;
    fixture.componentInstance.confirm.subscribe(() => (confirmed += 1));
    confirmButton(fixture).click();
    expect(confirmed).toBe(1);
  });
});
