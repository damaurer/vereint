import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Zerlegt eine Anzahl in Bündel zu fünf Strichen (das letzte ggf. kleiner). */
export function tallyBundles(count: number): number[] {
  const bundles: number[] = [];
  let remaining = Math.max(0, Math.floor(count));
  while (remaining > 0) {
    const size = Math.min(5, remaining);
    bundles.push(size);
    remaining -= size;
  }
  return bundles;
}

/**
 * Striche wie auf dem Bierdeckel: vier senkrechte, der fünfte quer darüber.
 * Reine Anzeige; die Zahl daneben liest der Aufrufer vor.
 */
@Component({
  selector: 'app-tally-marks',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="marks" aria-hidden="true">
      @for (bundle of bundles; track $index) {
        <span class="bundle" [class.is-full]="bundle === 5">
          @for (stroke of strokes(bundle); track stroke) {
            <i class="stroke"></i>
          }
        </span>
      }
    </span>
  `,
  styles: [
    `
      .marks {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.55rem;
        min-height: 1.6rem;
      }
      .bundle {
        position: relative;
        display: inline-flex;
        gap: 0.22rem;
      }
      .stroke {
        display: inline-block;
        width: 0.16rem;
        height: 1.5rem;
        border-radius: 1px;
        background: currentColor;
      }
      .bundle.is-full .stroke:last-child {
        display: none;
      }
      .bundle.is-full::after {
        content: '';
        position: absolute;
        top: 50%;
        left: -0.2rem;
        right: -0.2rem;
        height: 0.16rem;
        background: currentColor;
        transform: rotate(-28deg);
      }
    `,
  ],
})
export class TallyMarksComponent {
  @Input() count = 0;

  get bundles(): number[] {
    return tallyBundles(this.count);
  }

  /** Im vollen Bündel werden vier senkrechte gezeichnet, der fünfte liegt quer. */
  strokes(size: number): number[] {
    return Array.from({ length: size }, (_, index) => index);
  }
}
