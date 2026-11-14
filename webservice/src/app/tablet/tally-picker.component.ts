import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ModalComponent } from '../ui';
import { TranslatePipe } from '../i18n';
import { formatMoney } from '../member/member-format';

/** Eintrag der Auswahl: ein Eventgetränk oder eine Eventspeise. */
export interface TallyPickItem {
  kind: 'drink' | 'food';
  id: string;
  name: string;
  price: string;
  currency: string;
}

/**
 * Auswahl am Thekenterminal, wenn ein Feld mehrere Artikel umfasst: die
 * Getränke einer Strich-Kategorie (Preis = Kategoriepreis) oder in der Spalte
 * „Sonstiges“ alle Getränke ohne Kategorie und die Speisen. Ein Tipp auf einen
 * Eintrag bucht ihn sofort.
 */
@Component({
  selector: 'app-tally-picker',
  standalone: true,
  imports: [ModalComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <vereint-modal [open]="open" [title]="title" [dismissible]="true" (closed)="closed.emit()">
      @if (subtitle) {
        <p class="picker-hint">{{ subtitle }}</p>
      }
      @if (items.length === 0) {
        <p class="picker-hint">{{ 'tablet.picker.empty' | t }}</p>
      } @else {
        <div class="picker-grid" role="list">
          @for (item of items; track item.kind + item.id) {
            <button type="button" class="picker-card" role="listitem" (click)="pick.emit(item)">
              <span class="picker-name">{{ item.name }}</span>
              <span class="picker-price">{{ formatMoney(item.price, item.currency) }}</span>
            </button>
          }
        </div>
      }
    </vereint-modal>
  `,
  styles: [
    `
      .picker-hint {
        margin: 0 0 var(--space-2);
        color: var(--color-text-muted);
      }
      .picker-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
        gap: var(--space-1);
      }
      .picker-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
        min-height: 4rem;
        padding: var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface-raised);
        color: var(--color-text);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .picker-card:hover,
      .picker-card:focus-visible {
        border-color: var(--color-brand);
        background: var(--color-brand-soft);
      }
      .picker-name {
        font-weight: 700;
      }
      .picker-price {
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class TallyPickerComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() items: TallyPickItem[] = [];

  @Output() pick = new EventEmitter<TallyPickItem>();
  @Output() closed = new EventEmitter<void>();

  protected readonly formatMoney = formatMoney;
}
