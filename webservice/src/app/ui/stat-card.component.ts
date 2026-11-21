import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from './icon.component';
import type { IconName } from './icons';

/**
 * Kompakte Kennzahlen-Karte (TICKET-032): Label, großer Wert und optionaler
 * Hinweistext. Reine Präsentation für Dashboards und Statistiken. Mit `link`
 * wird die ganze Karte ein Link auf die zugehörige Seite.
 */
@Component({
  selector: 'vereint-stat-card',
  imports: [IconComponent, NgTemplateOutlet, RouterLink],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (link) {
      <a class="ui-stat-card ui-stat-card-link" [routerLink]="link">
        <ng-container *ngTemplateOutlet="body" />
      </a>
    } @else {
      <article class="ui-stat-card">
        <ng-container *ngTemplateOutlet="body" />
      </article>
    }
    <ng-template #body>
      @if (icon) {
        <vereint-icon class="ui-stat-icon" [name]="icon" />
      }
      <p class="ui-stat-label">{{ label }}</p>
      <p class="ui-stat-value">{{ value }}</p>
      @if (hint) {
        <p class="ui-stat-hint">{{ hint }}</p>
      }
    </ng-template>
  `,
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() hint: string | null = null;
  @Input() icon: IconName | null = null;
  /** Ziel der Karte; ohne Wert bleibt sie reine Anzeige. */
  @Input() link: string | null = null;
}
