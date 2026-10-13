import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from './icon.component';
import type { IconName } from './icons';

/** Art des Zustands: lädt, leer oder fehlgeschlagen. */
export type StateKind = 'loading' | 'empty' | 'error';

const DEFAULT_ICON: Record<Exclude<StateKind, 'loading'>, IconName> = {
  empty: 'sparkle',
  error: 'alert',
};

/**
 * Einheitliche Lade-, Leer- und Fehleranzeige für alle Seiten.
 *
 * Laden wird als `status` angesagt, Fehler als `alert`. Mit `retry` erscheint
 * ein „Erneut versuchen“-Knopf, damit niemand die Seite neu laden muss.
 */
@Component({
  selector: 'vereint-state',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="state-card ui-state"
      [class.state-error]="kind === 'error'"
      [class.ui-state-empty]="kind === 'empty'"
      [attr.role]="kind === 'error' ? 'alert' : 'status'"
      [attr.aria-live]="kind === 'loading' ? 'polite' : null"
      [attr.aria-busy]="kind === 'loading' ? 'true' : null"
    >
      <span class="ui-state-visual" aria-hidden="true">
        @if (kind === 'loading') {
          <span class="ui-state-spinner"></span>
        } @else {
          <vereint-icon [name]="icon ?? defaultIcon" [size]="22" />
        }
      </span>
      <span class="ui-state-text">
        <strong>{{ title }}</strong>
        @if (message) {
          <span>{{ message }}</span>
        }
        @if (kind === 'error' && retry.observed) {
          <button type="button" class="member-button" (click)="retry.emit()">
            {{ retryLabel }}
          </button>
        }
        <ng-content />
      </span>
    </div>
  `,
})
export class StateComponent {
  @Input() kind: StateKind = 'loading';
  @Input({ required: true }) title = '';
  @Input() message: string | null = null;
  /** Eigenes Icon für Leer-/Fehlerzustände (Standard: Funken bzw. Warnung). */
  @Input() icon: IconName | null = null;
  @Input() retryLabel = 'Erneut versuchen';

  /** Nur gebunden erscheint der Knopf „Erneut versuchen“. */
  @Output() retry = new EventEmitter<void>();

  protected get defaultIcon(): IconName {
    return this.kind === 'loading' ? 'clock' : DEFAULT_ICON[this.kind];
  }
}
