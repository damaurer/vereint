import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '../i18n';

/**
 * Guthaben-Karte (TICKET-032): großer Betrag mit optionaler „Aufladen“-Aktion.
 * Negatives Guthaben wird rot dargestellt (`negative`). Reine Präsentation;
 * der eigentliche Aufladevorgang wird vom Aufrufer über `topup` behandelt.
 */
@Component({
  selector: 'vereint-balance-card',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ui-balance-card">
      <p class="ui-balance-label">{{ label ?? ('ui.balanceCard.label' | t) }}</p>
      <p class="ui-balance-value" [class.ui-balance-negative]="negative">{{ amount }}</p>
      @if (showTopup) {
        <button type="button" class="ui-button" (click)="topup.emit()">{{ topupLabel ?? ('ui.balanceCard.topup' | t) }}</button>
      }
    </article>
  `,
})
export class BalanceCardComponent {
  /** Ohne Angabe: „Guthaben“ in der aktiven Sprache. */
  @Input() label: string | null = null;
  @Input() amount = '';
  @Input() negative = false;
  @Input() showTopup = false;
  /** Ohne Angabe: „Aufladen“ in der aktiven Sprache. */
  @Input() topupLabel: string | null = null;
  @Output() topup = new EventEmitter<void>();
}
