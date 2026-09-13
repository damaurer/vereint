import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * `+/−`-Stepper (TICKET-032) für die Strichlisten-Zeile und Mengenauswahl.
 *
 * Steuert einen Zahlenwert zwischen `min` und `max`. Die Komponente hält den
 * Wert nicht selbst: Sie meldet jede Änderung über `valueChange`, sodass der
 * Aufrufer genau eine Buchung auslösen kann.
 */
@Component({
  selector: 'vereint-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-stepper" role="group" [attr.aria-label]="ariaLabel">
      <button
        type="button"
        class="ui-stepper-btn"
        [attr.aria-label]="'Verringern'"
        [disabled]="value <= min"
        (click)="decrement()"
      >
        −
      </button>
      <span class="ui-stepper-value" aria-live="polite">{{ value }}</span>
      <button
        type="button"
        class="ui-stepper-btn"
        [attr.aria-label]="'Erhöhen'"
        [disabled]="value >= max"
        (click)="increment()"
      >
        +
      </button>
    </div>
  `,
})
export class StepperComponent {
  @Input() value = 0;
  @Input() min = 0;
  @Input() max = 99;
  @Input() step = 1;
  @Input() ariaLabel = 'Menge';

  @Output() valueChange = new EventEmitter<number>();
  @Output() increased = new EventEmitter<number>();
  @Output() decreased = new EventEmitter<number>();

  increment(): void {
    if (this.value >= this.max) return;
    const next = this.value + this.step;
    this.value = next;
    this.valueChange.emit(next);
    this.increased.emit(next);
  }

  decrement(): void {
    if (this.value <= this.min) return;
    const next = this.value - this.step;
    this.value = next;
    this.valueChange.emit(next);
    this.decreased.emit(next);
  }
}
