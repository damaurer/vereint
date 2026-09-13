import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ModalComponent, RoleChipComponent } from '../ui';
import { formatMoney } from '../member/member-format';
import type { EventDrink } from '../events/event-manage.types';

/**
 * Getränke-/Menüauswahl-Overlay des Terminals (TICKET-034).
 *
 * Bereichsnahe Präsentationskomponente auf Basis des `ModalComponent` aus
 * TICKET-032: Kategorie-Chip, Karten-Grid der tabletfähigen Eventgetränke und
 * eine Sticky-Bestätigen-Leiste. Preise stammen unverändert aus dem
 * Fachservice; die Auswahl ist reine Client-UI vor dem bestehenden
 * Buchungsaufruf. `Escape`/Backdrop schließen über das Modal.
 */
@Component({
  selector: 'app-drink-overlay',
  standalone: true,
  imports: [ModalComponent, RoleChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <vereint-modal
      [open]="open"
      title="Getränkekarte / Menüauswahl"
      [dismissible]="true"
      (closed)="closed.emit()"
    >
      <p class="overlay-hint">Wähle das Standard-Getränk für die Strichliste.</p>

      <div class="overlay-chips" role="group" aria-label="Getränkekategorien">
        <vereint-role-chip [label]="'Getränke (' + drinks.length + ')'" [tone]="'accent'" />
      </div>

      <div class="overlay-grid" role="listbox" aria-label="Getränke">
        @for (drink of drinks; track drink.id) {
          <button
            type="button"
            class="overlay-card"
            role="option"
            [class.is-selected]="drink.id === selectedId"
            [attr.aria-selected]="drink.id === selectedId"
            (click)="select.emit(drink.id)"
          >
            <span class="overlay-card-name">{{ drink.drinkName }}</span>
            <span class="overlay-card-price">{{ formatMoney(drink.price, drink.currency) }}</span>
          </button>
        }
      </div>

      <footer class="overlay-confirm">
        <span class="overlay-selected">
          @if (selectedDrink(); as drink) {
            Aktuell ausgewählt: {{ drink.drinkName }}
          } @else {
            Noch kein Getränk gewählt.
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
  @Input() selectedId: string | null = null;

  @Output() select = new EventEmitter<string>();
  @Output() confirm = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  protected readonly formatMoney = formatMoney;

  /** Das aktuell markierte Getränk oder `null`. */
  selectedDrink(): EventDrink | null {
    return this.drinks.find((drink) => drink.id === this.selectedId) ?? null;
  }
}
