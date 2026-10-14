import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { AvatarBadgeComponent, StepperComponent } from '../ui';
import { TranslatePipe } from '../i18n';

/**
 * Strichlisten-Zeile des Tablet-/PWA-Terminals (TICKET-034).
 *
 * Bereichsnahe Präsentationskomponente: zeigt Mitglied, Avatar, die als Striche
 * gerenderte Anzahl und den `+/−`-Stepper aus TICKET-032. Sie hält keine Daten
 * und löst keine Buchung selbst aus, sondern meldet jede Änderung über
 * `increment`/`decrement`, damit der Aufrufer genau einen Buchungsaufruf
 * ausführt (`idempotencyKey`). Reine Anzeige – keine eigene Autorisierung.
 */
@Component({
  selector: 'app-strichliste-row',
  standalone: true,
  imports: [AvatarBadgeComponent, StepperComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tally-row">
      <vereint-avatar-badge [name]="name" [imageUrl]="imageUrl" />
      <div class="tally-info">
        <span class="tally-name">{{ name }}</span>
        <span class="tally-marks" aria-hidden="true">
          @for (group of tallyGroups; track $index) {
            <span class="tally-group" [class.is-full]="group === 5">
              @for (stroke of strokes(group); track stroke) {
                <i class="tally-stroke"></i>
              }
            </span>
          }
          <span class="tally-count">({{ count }})</span>
        </span>
      </div>
      <vereint-stepper
        [value]="count"
        [min]="0"
        [max]="max"
        [ariaLabel]="'tablet.row.strokesFor' | t: { name: name }"
        (increased)="increment.emit()"
        (decreased)="decrement.emit()"
      />
    </div>
  `,
  styles: [
    `
      .tally-row {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.75rem);
        padding: var(--space-2, 0.75rem);
        border-radius: var(--radius-md, 0.75rem);
        background: rgba(148, 163, 184, 0.08);
      }
      .tally-info {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        flex: 1 1 auto;
        min-width: 0;
      }
      .tally-name {
        font-weight: 600;
      }
      .tally-marks {
        display: inline-flex;
        align-items: flex-end;
        gap: 0.5rem;
        flex-wrap: wrap;
        min-height: 1.1rem;
      }
      .tally-group {
        position: relative;
        display: inline-flex;
        gap: 0.18rem;
      }
      .tally-stroke {
        display: inline-block;
        width: 0.14rem;
        height: 1rem;
        background: currentColor;
        border-radius: 1px;
      }
      .tally-group.is-full::after {
        content: '';
        position: absolute;
        inset: 45% -0.1rem auto -0.1rem;
        height: 0.14rem;
        background: currentColor;
        transform: rotate(-20deg);
      }
      .tally-count {
        font-size: 0.85rem;
        opacity: 0.7;
      }
    `,
  ],
})
export class StrichlisteRowComponent {
  @Input() name = '';
  @Input() imageUrl: string | null = null;
  @Input() count = 0;
  @Input() max = 99;

  @Output() increment = new EventEmitter<void>();
  @Output() decrement = new EventEmitter<void>();

  /** Zerlegt die Anzahl in Fünfergruppen für die Strich-Darstellung. */
  get tallyGroups(): number[] {
    const groups: number[] = [];
    let remaining = Math.max(0, this.count);
    while (remaining > 0) {
      const size = Math.min(5, remaining);
      groups.push(size);
      remaining -= size;
    }
    return groups;
  }

  /** Hilfsarray zum Rendern einzelner Striche einer Gruppe. */
  strokes(size: number): number[] {
    return Array.from({ length: size }, (_, index) => index);
  }
}
