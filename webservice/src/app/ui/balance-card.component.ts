import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Guthaben-Karte (TICKET-032): großer Betrag mit optionaler „Aufladen“-Aktion.
 * Negatives Guthaben wird rot dargestellt (`negative`). Reine Präsentation;
 * der eigentliche Aufladevorgang wird vom Aufrufer über `topup` behandelt.
 */
@Component({
  selector: 'vereint-balance-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ui-balance-card">
      <p class="ui-balance-label">{{ label }}</p>
      <p class="ui-balance-value" [class.ui-balance-negative]="negative">{{ amount }}</p>
      @if (showTopup) {
        <button type="button" class="ui-button" (click)="topup.emit()">{{ topupLabel }}</button>
      }
    </article>
  `,
})
export class BalanceCardComponent {
  @Input() label = 'Guthaben';
  @Input() amount = '';
  @Input() negative = false;
  @Input() showTopup = false;
  @Input() topupLabel = 'Aufladen';
  @Output() topup = new EventEmitter<void>();
}
