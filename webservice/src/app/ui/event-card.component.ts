import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { StatusBadgeComponent, StatusTone } from './status-badge.component';

/**
 * Karte für den nächsten/ausgewählten Termin (TICKET-032): Titel, Zeitpunkt,
 * Ort und optionaler Statushinweis. Reine Präsentation.
 */
@Component({
  selector: 'vereint-event-card',
  standalone: true,
  imports: [StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ui-event-card">
      <div class="ui-event-head">
        <h3 class="ui-event-title">{{ title }}</h3>
        @if (statusLabel) {
          <vereint-status-badge [label]="statusLabel" [tone]="statusTone" />
        }
      </div>
      @if (when) {
        <p class="ui-event-meta">{{ when }}</p>
      }
      @if (location) {
        <p class="ui-event-meta">{{ location }}</p>
      }
    </article>
  `,
})
export class EventCardComponent {
  @Input() title = '';
  @Input() when: string | null = null;
  @Input() location: string | null = null;
  @Input() statusLabel: string | null = null;
  @Input() statusTone: StatusTone = 'neutral';
}
