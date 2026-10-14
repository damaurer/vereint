import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StepperComponent } from './stepper.component';

/** Nachweis des `+/−`-Steppers (TICKET-032). */
describe('StepperComponent', () => {
  const create = (value: number, min = 0, max = 5) => {
    TestBed.configureTestingModule({ imports: [StepperComponent] });
    const fixture = TestBed.createComponent(StepperComponent);
    fixture.componentInstance.value = value;
    fixture.componentInstance.min = min;
    fixture.componentInstance.max = max;
    fixture.detectChanges();
    return fixture;
  };

  const buttons = (fixture: { nativeElement: unknown }) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));

  it('emits an increased value on the plus button', () => {
    const fixture = create(1);
    const emitted: number[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    const [, plus] = buttons(fixture);
    (plus as HTMLButtonElement).click();
    expect(emitted).toEqual([2]);
  });

  it('emits a decreased value on the minus button', () => {
    const fixture = create(2);
    const emitted: number[] = [];
    fixture.componentInstance.decreased.subscribe((v) => emitted.push(v));
    const [minus] = buttons(fixture);
    (minus as HTMLButtonElement).click();
    expect(emitted).toEqual([1]);
  });

  it('keeps showing the bound value until the caller changes it', () => {
    // Die Theke öffnet ohne gewählten Artikel nur das Auswahl-Overlay; der
    // Stepper darf dann nicht schon einen Strich anzeigen.
    const fixture = create(0);
    const [, plus] = buttons(fixture);
    (plus as HTMLButtonElement).click();
    fixture.detectChanges();
    const shown = (fixture.nativeElement as HTMLElement).querySelector('.ui-stepper-value');
    expect(shown?.textContent?.trim()).toBe('0');
  });

  it('disables the minus button at the minimum', () => {
    const atMin = create(0, 0, 5);
    expect((buttons(atMin)[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables the plus button at the maximum', () => {
    const atMax = create(5, 0, 5);
    expect((buttons(atMax)[1] as HTMLButtonElement).disabled).toBe(true);
  });
});
