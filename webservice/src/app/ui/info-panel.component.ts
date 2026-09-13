import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Hervorgehobenes Info-/Pinnwand-Panel (TICKET-032), z. B. für das gepinnte
 * Schriftwart-Info oben im Chat. Inhalt wird projiziert.
 */
@Component({
  selector: 'vereint-info-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="ui-info-panel" role="note">
      @if (title) {
        <p class="ui-info-title">
          @if (icon) {
            <span aria-hidden="true">{{ icon }}</span>
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
  @Input() icon: string | null = '📌';
}
