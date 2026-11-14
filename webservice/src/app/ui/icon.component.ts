import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ICONS, IconName, IconShape } from './icons';

/**
 * Inline-SVG-Icon aus dem Vereint-Icon-Set (`icons.ts`).
 *
 * Standardmäßig dekorativ (`aria-hidden`); mit `label` wird das Icon zu einem
 * benannten Bild für Screenreader. Größe folgt der Schriftgröße (`1em`) oder
 * explizit über `size` in Pixeln, Farbe über `color` im CSS.
 */
@Component({
  selector: 'vereint-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-icon' },
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size ?? '1em'"
      [attr.height]="size ?? '1em'"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
      [attr.role]="label ? 'img' : null"
      [attr.aria-label]="label"
      [attr.aria-hidden]="label ? null : 'true'"
    >
      @for (shape of shapes; track $index) {
        @switch (shape.t) {
          @case ('path') {
            <svg:path
              [attr.d]="shape.d"
              [attr.fill]="fillOf(shape)"
              [attr.stroke]="strokeOf(shape)"
            />
          }
          @case ('circle') {
            <svg:circle
              [attr.cx]="shape.cx"
              [attr.cy]="shape.cy"
              [attr.r]="shape.r"
              [attr.fill]="fillOf(shape)"
              [attr.stroke]="strokeOf(shape)"
            />
          }
          @case ('rect') {
            <svg:rect
              [attr.x]="shape.x"
              [attr.y]="shape.y"
              [attr.width]="shape.w"
              [attr.height]="shape.h"
              [attr.rx]="shape.rx"
            />
          }
          @case ('line') {
            <svg:line
              [attr.x1]="shape.x1"
              [attr.y1]="shape.y1"
              [attr.x2]="shape.x2"
              [attr.y2]="shape.y2"
            />
          }
        }
      }
    </svg>
  `,
})
export class IconComponent {
  @Input({ required: true }) name!: IconName;
  /** Kantenlänge in Pixeln; ohne Angabe skaliert das Icon mit der Schrift. */
  @Input() size: number | null = null;
  /** Zugängliche Bezeichnung; ohne Label ist das Icon rein dekorativ. */
  @Input() label: string | null = null;

  protected get shapes(): readonly IconShape[] {
    return ICONS[this.name] ?? [];
  }

  protected fillOf(shape: IconShape): string | null {
    return 'fill' in shape && shape.fill ? 'currentColor' : null;
  }

  protected strokeOf(shape: IconShape): string | null {
    return 'fill' in shape && shape.fill ? 'none' : null;
  }
}
