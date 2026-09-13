import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';

/**
 * Von unten einfahrendes Sheet (TICKET-032) für Aktionen wie „Runde ausgeben“
 * oder das Getränke-Overlay auf dem Handy.
 *
 * Rendert nur, wenn `open` gesetzt ist, schließt bei `Escape`/Backdrop-Klick
 * und meldet dies über `closed`. Der projizierte Inhalt liefert die Aktionen.
 */
@Component({
  selector: 'vereint-bottom-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <div class="ui-overlay ui-overlay-bottom" (click)="onBackdrop($event)">
        <div
          class="ui-sheet"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title"
          (click)="$event.stopPropagation()"
        >
          <div class="ui-sheet-grabber" aria-hidden="true"></div>
          @if (title) {
            <header class="ui-sheet-head">
              <h2 class="ui-sheet-title">{{ title }}</h2>
            </header>
          }
          <div class="ui-sheet-body"><ng-content></ng-content></div>
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
}
