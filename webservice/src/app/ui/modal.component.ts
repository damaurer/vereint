import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';

/**
 * Modales Overlay (TICKET-032) für Dialoge wie das Einladungs-Modal.
 *
 * Rendert nur, wenn `open` gesetzt ist. Schließt bei `Escape` und Klick auf den
 * Hintergrund und meldet dies über `closed`. `role="dialog"` und `aria-modal`
 * sorgen für zugängliche Semantik; der projizierte Inhalt trägt die Steuerung.
 */
@Component({
  selector: 'vereint-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <div class="ui-overlay" (click)="onBackdrop($event)">
        <div
          class="ui-modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title"
          (click)="$event.stopPropagation()"
        >
          <header class="ui-modal-head">
            <h2 class="ui-modal-title">{{ title }}</h2>
            <button
              type="button"
              class="ui-icon-button"
              aria-label="Schließen"
              (click)="requestClose()"
            >
              ✕
            </button>
          </header>
          <div class="ui-modal-body"><ng-content></ng-content></div>
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
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
