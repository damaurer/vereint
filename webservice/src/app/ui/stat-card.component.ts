import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';
import type { IconName } from './icons';

/**
 * Kompakte Kennzahlen-Karte (TICKET-032): Label, großer Wert und optionaler
 * Hinweistext. Reine Präsentation für Dashboards und Statistiken.
 */
@Component({
  selector: 'vereint-stat-card',
  imports: [IconComponent],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ui-stat-card">
      @if (icon) {
        <vereint-icon class="ui-stat-icon" [name]="icon" />
      }
      <p class="ui-stat-label">{{ label }}</p>
      <p class="ui-stat-value">{{ value }}</p>
      @if (hint) {
        <p class="ui-stat-hint">{{ hint }}</p>
      }
    </article>
  `,
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() hint: string | null = null;
  @Input() icon: IconName | null = null;
}
