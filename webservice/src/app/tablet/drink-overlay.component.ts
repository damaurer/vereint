import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ModalComponent, RoleChipComponent } from '../ui';
import { formatMoney } from '../member/member-format';
import type { EventDrink, EventFood } from '../events/event-manage.types';

export interface SelectedItem {
  id: string;
  type: 'drink' | 'food';
  name: string;
}

/**
 * Getränke-/Speisenauswahl-Overlay des Terminals (TICKET-034).
 */
@Component({
  selector: 'app-drink-overlay',
  standalone: true,
  imports: [ModalComponent, RoleChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <vereint-modal
      [open]="open"
      title="Getränkekarte & Speiseangebot"
      [dismissible]="true"
      (closed)="closed.emit()"
    >
      <p class="overlay-hint">Wähle den Verkaufsartikel für die Strichliste.</p>

      <div class="overlay-chips" role="group" aria-label="Kategorien">
        <button
          type="button"
          class="overlay-tab-chip"
          [class.is-active]="activeCategory === 'drinks'"
          (click)="activeCategory = 'drinks'"
        >
          <vereint-role-chip [label]="'Getränke (' + drinks.length + ')'" [tone]="activeCategory === 'drinks' ? 'accent' : 'default'" />
        </button>
        <button
          type="button"
          class="overlay-tab-chip"
          [class.is-active]="activeCategory === 'food'"
          (click)="activeCategory = 'food'"
        >
          <vereint-role-chip [label]="'Speisen (' + foods.length + ')'" [tone]="activeCategory === 'food' ? 'accent' : 'default'" />
        </button>
      </div>

      @if (activeCategory === 'drinks') {
        <div class="overlay-grid" role="listbox" aria-label="Getränke">
          @for (drink of drinks; track drink.id) {
            <button
              type="button"
              class="overlay-card"
              role="option"
              [class.is-selected]="drink.id === selectedId"
              [attr.aria-selected]="drink.id === selectedId"
              (click)="onSelectDrink(drink)"
            >
              <span class="overlay-card-name">{{ drink.drinkName }}</span>
              <span class="overlay-card-price">{{ formatMoney(drink.price, drink.currency) }}</span>
            </button>
          }
        </div>
      } @else {
        <div class="overlay-grid" role="listbox" aria-label="Speisen">
          @for (item of foods; track item.id) {
            <button
              type="button"
              class="overlay-card"
              role="option"
              [class.is-selected]="item.id === selectedId"
              [attr.aria-selected]="item.id === selectedId"
              (click)="onSelectFood(item)"
            >
              <span class="overlay-card-name">{{ item.foodName }}</span>
              <span class="overlay-card-price">{{ formatMoney(item.effectivePrice, item.currency) }}</span>
            </button>
          }
        </div>
      }

      <footer class="overlay-confirm">
        <span class="overlay-selected">
          @if (selectedItemName(); as name) {
            Aktuell ausgewählt: {{ name }}
          } @else {
            Noch kein Artikel gewählt.
          }
        </span>
        <button
          type="button"
          class="member-button"
          [disabled]="!selectedId"
          (click)="confirm.emit()"
        >
          Auswahl bestätigen
        </button>
      </footer>
    </vereint-modal>
  `,
  styles: [
    `
      .overlay-hint {
        margin: 0 0 var(--space-2, 0.75rem);
        opacity: 0.8;
      }
      .overlay-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: var(--space-3, 1rem);
      }
      .overlay-tab-chip {
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        font: inherit;
      }
      .overlay-grid {
        display: grid;
        gap: var(--space-2, 0.75rem);
        grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
      }
      .overlay-card {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: var(--space-3, 1rem);
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: var(--radius-md, 0.75rem);
        background: transparent;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }
      .overlay-card.is-selected {
        border-color: var(--color-brand);
        box-shadow: 0 0 0 1px var(--color-brand) inset;
      }
      .overlay-card-name {
        font-weight: 600;
      }
      .overlay-card-price {
        font-variant-numeric: tabular-nums;
        opacity: 0.85;
      }
      .overlay-confirm {
        position: sticky;
        bottom: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2, 0.75rem);
        margin-top: var(--space-3, 1rem);
        padding-top: var(--space-2, 0.75rem);
      }
      .overlay-selected {
        opacity: 0.85;
      }
    `,
  ],
})
export class DrinkOverlayComponent {
  @Input() open = false;
  @Input() drinks: EventDrink[] = [];
  @Input() foods: EventFood[] = [];
  @Input() selectedId: string | null = null;
  @Input() selectedType: 'drink' | 'food' = 'drink';

  @Output() itemSelect = new EventEmitter<string>();
  @Output() selectItem = new EventEmitter<SelectedItem>();
  @Output() confirm = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  protected activeCategory: 'drinks' | 'food' = 'drinks';
  protected readonly formatMoney = formatMoney;

  onSelectDrink(drink: EventDrink): void {
    this.itemSelect.emit(drink.id);
    this.selectItem.emit({ id: drink.id, type: 'drink', name: drink.drinkName });
  }

  onSelectFood(food: EventFood): void {
    this.itemSelect.emit(food.id);
    this.selectItem.emit({ id: food.id, type: 'food', name: food.foodName });
  }

  selectedItemName(): string | null {
    const drink = this.drinks.find((d) => d.id === this.selectedId);
    if (drink) return drink.drinkName;
    const food = this.foods.find((f) => f.id === this.selectedId);
    if (food) return food.foodName;
    return null;
  }

  /** Abwärtskompatibilität: markiertes Getränk oder `null`. */
  selectedDrink(): EventDrink | null {
    return this.drinks.find((drink) => drink.id === this.selectedId) ?? null;
  }
}
