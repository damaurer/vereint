import { ChangeDetectionStrategy, Component, Input, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '../i18n';

/** Spaltendefinition der Daten-Tabelle (TICKET-032). */
export interface DataTableColumn<T> {
  /** Stabile Kennung/Schlüssel der Spalte. */
  key: string;
  /** Spaltenüberschrift. */
  header: string;
  /** Optionaler Textzugriff, wenn keine Zell-Vorlage genutzt wird. */
  value?: (row: T) => string;
}

/**
 * Generische Daten-Tabelle (TICKET-032) für Mitglieder-/Rollenverwaltung.
 *
 * Reine Präsentation: Zeilen und Spalten werden übergeben; komplexe Zellen
 * (Avatar, Chips, Aktionen) werden über eine benannte Zell-Vorlage projiziert.
 */
@Component({
  selector: 'vereint-data-table',
  standalone: true,
  imports: [NgTemplateOutlet, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="ui-table">
      <thead>
        <tr>
          @for (column of columns; track column.key) {
            <th scope="col">{{ column.header }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows; track trackRow($index, row)) {
          <tr>
            @for (column of columns; track column.key) {
              <td [attr.data-label]="column.header">
                @if (cellTemplate) {
                  <ng-container
                    [ngTemplateOutlet]="cellTemplate"
                    [ngTemplateOutletContext]="{ $implicit: row, column: column }"
                  />
                } @else {
                  {{ column.value ? column.value(row) : '' }}
                }
              </td>
            }
          </tr>
        } @empty {
          <tr>
            <td class="ui-table-empty" [attr.colspan]="columns.length">{{ emptyLabel ?? ('ui.dataTable.empty' | t) }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class DataTableComponent<T = Record<string, unknown>> {
  @Input() columns: DataTableColumn<T>[] = [];
  @Input() rows: T[] = [];
  /** Ohne Angabe: „Keine Einträge vorhanden.“ in der aktiven Sprache. */
  @Input() emptyLabel: string | null = null;
  @Input() cellTemplate: TemplateRef<unknown> | null = null;
  @Input() trackBy: ((index: number, row: T) => unknown) | null = null;

  trackRow(index: number, row: T): unknown {
    return this.trackBy ? this.trackBy(index, row) : index;
  }
}
