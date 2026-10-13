import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';
import type { IconName } from './icons';

/**
 * Hervorgehobenes Info-/Pinnwand-Panel (TICKET-032), z. B. für das gepinnte
 * Schriftwart-Info oben im Chat. Inhalt wird projiziert.
 */
@Component({
  selector: 'vereint-info-panel',
  imports: [IconComponent],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="ui-info-panel" role="note">
      @if (title) {
        <p class="ui-info-title">
          @if (icon) {
            <vereint-icon class="ui-info-icon" [name]="icon" />
          }
          {{ title }}
        </p>
      }
      <div class="ui-info-body"><ng-content></ng-content></div>
    </aside>
  `,
})
export class InfoPanelComponent {
  @Input() title: string | null = null;
  @Input() icon: IconName | null = 'pin';
}
