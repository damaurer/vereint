import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Kompakte Kennzahlen-Karte (TICKET-032): Label, großer Wert und optionaler
 * Hinweistext. Reine Präsentation für Dashboards und Statistiken.
 */
@Component({
  selector: 'vereint-stat-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ui-stat-card">
      @if (icon) {
        <span class="ui-stat-icon" aria-hidden="true">{{ icon }}</span>
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
  @Input() icon: string | null = null;
}
