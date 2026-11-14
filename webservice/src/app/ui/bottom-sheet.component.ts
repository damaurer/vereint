import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { TranslatePipe } from '../i18n';
import { IconComponent } from './icon.component';

/** Ab dieser Wischstrecke (px) nach unten schließt das Sheet beim Loslassen. */
export const SHEET_DISMISS_DISTANCE = 96;

/** Ab dieser Geschwindigkeit (px/ms) reicht auch ein kurzer, schneller Wisch. */
export const SHEET_DISMISS_VELOCITY = 0.5;

/**
 * Von unten einfahrendes Sheet (TICKET-032) für Aktionen wie „Runde ausgeben“
 * oder das Getränke-Overlay auf dem Handy.
 *
 * Rendert nur, wenn `open` gesetzt ist, schließt bei `Escape`/Backdrop-Klick
 * und meldet dies über `closed`. Der projizierte Inhalt liefert die Aktionen.
 * Kopf und Griff bleiben stehen, gescrollt wird nur `ui-sheet-body`. Mit dem
 * Finger lässt sich das Sheet nach unten wegwischen: am Griff/Kopf jederzeit,
 * im Inhalt nur, wenn dieser ganz nach oben gescrollt ist.
 */
@Component({
  selector: 'vereint-bottom-sheet',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <div class="ui-overlay ui-overlay-bottom" (click)="onBackdrop($event)">
        <div
          #sheet
          class="ui-sheet"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title"
          (click)="$event.stopPropagation()"
          (touchstart)="onTouchStart($event)"
          (touchmove)="onTouchMove($event)"
          (touchend)="onTouchEnd($event)"
          (touchcancel)="resetDrag()"
        >
          <div class="ui-sheet-grabber" aria-hidden="true"></div>
          @if (title) {
            <header class="ui-sheet-head">
              <h2 class="ui-sheet-title">{{ title }}</h2>
              @if (dismissible) {
                <button type="button" class="ui-sheet-close" [attr.aria-label]="'common.close' | t" (click)="requestClose()">
                  <vereint-icon name="close" />
                </button>
              }
            </header>
          }
          <div #body class="ui-sheet-body"><ng-content></ng-content></div>
        </div>
      </div>
    }
  `,
})
export class BottomSheetComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() dismissible = true;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('sheet') private sheetRef?: ElementRef<HTMLElement>;
  @ViewChild('body') private bodyRef?: ElementRef<HTMLElement>;

  /** Laufende Wischgeste; `null`, solange kein Finger das Sheet zieht. */
  private drag: {
    startY: number;
    startTime: number;
    fromBody: boolean;
    offset: number;
    active: boolean;
  } | null = null;

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.requestClose();
  }

  onBackdrop(_event: MouseEvent): void {
    this.requestClose();
  }

  requestClose(): void {
    if (!this.dismissible) return;
    this.closed.emit();
  }

  onTouchStart(event: TouchEvent): void {
    if (!this.dismissible || event.touches.length !== 1) return;
    const target = event.target as Node | null;
    const body = this.bodyRef?.nativeElement;
    this.drag = {
      startY: event.touches[0].clientY,
      startTime: Date.now(),
      fromBody: !!body && !!target && body.contains(target),
      offset: 0,
      active: false,
    };
  }

  onTouchMove(event: TouchEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const dy = event.touches[0].clientY - drag.startY;
    if (!drag.active) {
      // Im Inhalt gewinnt das Scrollen, solange dort noch nach oben gescrollt werden kann.
      const bodyScrolled = drag.fromBody && (this.bodyRef?.nativeElement.scrollTop ?? 0) > 0;
      if (dy <= 0 || bodyScrolled) {
        if (dy < 0 || bodyScrolled) this.drag = null;
        return;
      }
      drag.active = true;
      drag.startY = event.touches[0].clientY;
      drag.startTime = Date.now();
    }
    if (event.cancelable) event.preventDefault();
    drag.offset = Math.max(0, event.touches[0].clientY - drag.startY);
    this.applyOffset(drag.offset, false);
  }

  onTouchEnd(_event: TouchEvent): void {
    const drag = this.drag;
    if (!drag?.active) {
      this.drag = null;
      return;
    }
    const velocity = drag.offset / Math.max(1, Date.now() - drag.startTime);
    this.drag = null;
    if (drag.offset >= SHEET_DISMISS_DISTANCE || (drag.offset > 24 && velocity >= SHEET_DISMISS_VELOCITY)) {
      this.applyOffset(0, false);
      this.requestClose();
    } else {
      this.applyOffset(0, true);
    }
  }

  resetDrag(): void {
    this.drag = null;
    this.applyOffset(0, true);
  }

  private applyOffset(offset: number, animate: boolean): void {
    const sheet = this.sheetRef?.nativeElement;
    if (!sheet) return;
    sheet.style.transition = animate ? 'transform 0.2s ease' : 'none';
    sheet.style.transform = offset > 0 ? `translateY(${offset}px)` : '';
  }
}
