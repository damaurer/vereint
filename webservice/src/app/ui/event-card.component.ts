import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';
import { StatusBadgeComponent, StatusTone } from './status-badge.component';

/**
 * Karte für den nächsten/ausgewählten Termin (TICKET-032): Titel, Zeitpunkt,
 * Ort und optionaler Statushinweis. Reine Präsentation.
 */
@Component({
  selector: 'vereint-event-card',
  standalone: true,
  imports: [StatusBadgeComponent, IconComponent],
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
        <p class="ui-event-meta">@if (icons) {<vereint-icon name="clock" />} {{ when }}</p>
      }
      @if (location) {
        <p class="ui-event-meta">@if (icons) {<vereint-icon name="location" />} {{ location }}</p>
      }
      <ng-content />
    </article>
  `,
})
export class EventCardComponent {
  @Input() title = '';
  @Input() when: string | null = null;
  @Input() location: string | null = null;
  @Input() statusLabel: string | null = null;
  @Input() statusTone: StatusTone = 'neutral';
  /** Uhr- und Ortssymbol vor den Zeilen (Startseite); die Eventliste zeigt nur Text. */
  @Input() icons = true;
}
