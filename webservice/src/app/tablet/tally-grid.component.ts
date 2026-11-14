import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { AvatarBadgeComponent } from '../ui';
import { TranslatePipe } from '../i18n';
import { formatMoney } from '../member/member-format';
import type { TabletBoardColumn, TabletBoardMember } from '../api/api.types';
import { TallyMarksComponent } from './tally-marks.component';

/** Getipptes Feld: Mitglied und Spalte (`null` = „Sonstiges“). */
export interface TallyCell {
  memberId: string;
  categoryId: string | null;
}

/**
 * Strichliste wie auf Papier (Issue #80): eine Zeile je Mitglied, eine Spalte
 * je Strich-Kategorie, rechts optional „Sonstiges“. Jedes Feld zeigt die
 * Striche als Bündel und rechts die Zahl, leere Felder ein „+“. Die Komponente
 * bucht nicht selbst, sondern meldet den Tipp über `cellTap`.
 */
@Component({
  selector: 'app-tally-grid',
  standalone: true,
  imports: [AvatarBadgeComponent, TallyMarksComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid-scroll">
      <table class="tally-grid">
        <thead>
          <tr>
            <th scope="col" class="member-head">{{ 'tablet.board.member' | t }}</th>
            @for (column of columns; track column.categoryId) {
              <th scope="col">
                <span class="col-name">{{ column.name }}</span>
                <span class="col-price">{{ 'tablet.board.perTally' | t: { price: money(column.price, column.currency) } }}</span>
              </th>
            }
            @if (showOther) {
              <th scope="col">
                <span class="col-name">{{ 'tablet.board.other' | t }}</span>
                <span class="col-price">{{ 'tablet.board.otherHint' | t }}</span>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows; track row.memberId) {
            <tr>
              <th scope="row" class="member-cell">
                <vereint-avatar-badge [name]="row.displayName" />
                <span class="member-text">
                  <span class="member-name">{{ row.displayName }}</span>
                  <span class="member-payer" [class.is-round]="!!payers[row.memberId]">
                    {{ payers[row.memberId] || ('tablet.board.ownTab' | t) }}
                  </span>
                </span>
              </th>
              @for (column of columns; track column.categoryId) {
                <td>
                  <button
                    type="button"
                    class="tally-cell"
                    [class.is-last]="isLast(row.memberId, column.categoryId)"
                    [disabled]="disabled"
                    [attr.aria-label]="'tablet.board.cellLabel' | t: { name: row.displayName, column: column.name, count: count(row, column.categoryId) }"
                    (click)="cellTap.emit({ memberId: row.memberId, categoryId: column.categoryId })"
                  >
                    <app-tally-marks [count]="count(row, column.categoryId)" />
                    <span class="cell-count">{{ count(row, column.categoryId) || '+' }}</span>
                  </button>
                </td>
              }
              @if (showOther) {
                <td>
                  <button
                    type="button"
                    class="tally-cell"
                    [class.is-last]="isLast(row.memberId, null)"
                    [disabled]="disabled"
                    [attr.aria-label]="'tablet.board.cellLabel' | t: { name: row.displayName, column: ('tablet.board.other' | t), count: row.otherCount }"
                    (click)="cellTap.emit({ memberId: row.memberId, categoryId: null })"
                  >
                    <app-tally-marks [count]="row.otherCount" />
                    <span class="cell-count">{{ row.otherCount || '+' }}</span>
                  </button>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .grid-scroll {
        overflow-x: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: var(--color-surface);
      }
      .tally-grid {
        width: 100%;
        border-collapse: collapse;
        min-width: 32rem;
      }
      th,
      td {
        border-bottom: 1px solid var(--color-border);
        border-left: 1px solid var(--color-border);
        padding: 0;
        text-align: left;
        vertical-align: middle;
      }
      th:first-child,
      td:first-child {
        border-left: 0;
      }
      tbody tr:last-child th,
      tbody tr:last-child td {
        border-bottom: 0;
      }
      thead th {
        padding: var(--space-2);
        background: var(--color-surface-subtle);
      }
      .member-head {
        font-size: 0.8rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .col-name {
        display: block;
        font-weight: 700;
      }
      .col-price {
        display: block;
        font-size: 0.85rem;
        font-weight: 400;
        color: var(--color-text-muted);
      }
      .member-cell {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 12rem;
        padding: var(--space-2);
        border-left: 0;
      }
      .member-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .member-name {
        overflow: hidden;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .member-payer {
        font-size: 0.85rem;
        font-weight: 400;
        color: var(--color-text-muted);
      }
      .member-payer.is-round {
        font-weight: 700;
        color: var(--color-brand);
      }
      .tally-cell {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-1);
        width: 100%;
        min-width: 7rem;
        min-height: 4.5rem;
        padding: var(--space-2);
        border: 0;
        background: transparent;
        color: var(--color-text);
        font: inherit;
        cursor: pointer;
      }
      .tally-cell:hover,
      .tally-cell:focus-visible,
      .tally-cell.is-last {
        background: var(--color-brand-soft);
      }
      .tally-cell:disabled {
        cursor: progress;
      }
      .cell-count {
        flex: none;
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class TallyGridComponent {
  @Input() columns: TabletBoardColumn[] = [];
  @Input() rows: TabletBoardMember[] = [];
  @Input() showOther = false;
  @Input() disabled = false;
  /** Auf wessen Kosten getrunken wird, je Mitglied; ohne Eintrag die eigene Rechnung. */
  @Input() payers: Record<string, string> = {};
  /** Zuletzt getipptes Feld, wird hervorgehoben. */
  @Input() last: TallyCell | null = null;

  @Output() cellTap = new EventEmitter<TallyCell>();

  count(row: TabletBoardMember, categoryId: string): number {
    return row.counts?.[categoryId] ?? 0;
  }

  isLast(memberId: string, categoryId: string | null): boolean {
    return this.last?.memberId === memberId && this.last?.categoryId === categoryId;
  }

  money(amount: string, currency: string): string {
    return formatMoney(String(amount), currency);
  }
}
