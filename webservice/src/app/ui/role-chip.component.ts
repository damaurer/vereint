import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Rollen-/Kategorie-Chip (TICKET-032). Reine Präsentation; `tone` steuert die
 * Farbgebung über die globalen Chip-Klassen aus `styles.css`.
 */
@Component({
  selector: 'vereint-role-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="ui-chip" [class.ui-chip-accent]="tone === 'accent'">{{ label }}</span>`,
})
export class RoleChipComponent {
  @Input() label = '';
  @Input() tone: 'default' | 'accent' = 'default';
}
