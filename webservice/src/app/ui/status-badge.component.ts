import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Farbige Statusanzeige (TICKET-032), z. B. für Teilnehmer- oder Kontostatus. */
export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'vereint-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="ui-badge" [class]="'ui-badge-' + tone">{{ label }}</span>`,
})
export class StatusBadgeComponent {
  @Input() label = '';
  @Input() tone: StatusTone = 'neutral';
}
