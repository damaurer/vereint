import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { BottomSheetComponent, AvatarBadgeComponent } from '../ui';
import { TranslatePipe } from '../i18n';
import type { TabletMember } from '../api/api.types';

/** Umfang einer Revenue-Only-Aktion des Terminals. */
export type RevenueKind = 'round' | 'evening';

/**
 * „Runde ausgeben“ / „Ganzen Abend stiften“-Sheet des Terminals (TICKET-034).
 *
 * Bereichsnahe Präsentationskomponente auf Basis des `BottomSheetComponent`
 * aus TICKET-032: Auswahl von Umfang (Runde/Abend) und Begünstigten sowie ein
 * Idempotenz-Hinweis. Die eigentliche Buchung löst der Aufrufer über den
 * bestehenden Runden-/Abend-Endpunkt aus (`idempotencyKey`); das Sheet ist
 * reine Client-UI und schließt per `Escape`/Backdrop.
 */
@Component({
  selector: 'app-revenue-sheet',
  standalone: true,
  imports: [BottomSheetComponent, AvatarBadgeComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <vereint-bottom-sheet
      [open]="open"
      [title]="(kind === 'evening' ? 'tablet.revenue.eveningTitle' : 'tablet.revenue.roundTitle') | t"
      [dismissible]="true"
      (closed)="closed.emit()"
    >
      <div class="sheet-modes" role="group" [attr.aria-label]="'tablet.revenue.scope' | t">
        <button
          type="button"
          class="sheet-mode"
          [class.is-active]="kind === 'round'"
          [attr.aria-pressed]="kind === 'round'"
          (click)="kindChange.emit('round')"
        >
          {{ 'tablet.revenue.oneRound' | t }}
        </button>
        <button
          type="button"
          class="sheet-mode"
          [class.is-active]="kind === 'evening'"
          [attr.aria-pressed]="kind === 'evening'"
          (click)="kindChange.emit('evening')"
        >
          {{ 'tablet.revenue.eveningTitle' | t }}
        </button>
      </div>

      <p class="sheet-label">{{ 'tablet.revenue.recipients' | t }}</p>
      <ul class="sheet-list">
        @for (member of members; track member.memberId) {
          <li class="sheet-item">
            <label class="sheet-check">
              <vereint-avatar-badge [name]="member.displayName" />
              <span class="sheet-name">{{ member.displayName }}</span>
              <input
                type="checkbox"
                [checked]="selection[member.memberId]"
                (change)="toggle.emit(member.memberId)"
              />
            </label>
          </li>
        }
      </ul>

      <p class="sheet-hint" role="note">
        {{ 'tablet.revenue.hint' | t }}
      </p>

      <button
        type="button"
        class="member-button sheet-confirm"
        [disabled]="disabled"
        (click)="confirm.emit()"
      >
        {{ (kind === 'evening' ? 'tablet.revenue.confirmEvening' : 'tablet.revenue.confirmRound') | t }}
      </button>
    </vereint-bottom-sheet>
  `,
  styles: [
    `
      .sheet-modes {
        display: flex;
        gap: 0.5rem;
        margin-bottom: var(--space-3, 1rem);
      }
      .sheet-mode {
        flex: 1 1 0;
        padding: 0.6rem 0.75rem;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: var(--radius-md, 0.75rem);
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      .sheet-mode.is-active {
        border-color: var(--color-brand);
        background: rgba(245, 166, 35, 0.15);
        font-weight: 600;
      }
      .sheet-label {
        margin: 0 0 0.5rem;
        font-weight: 600;
        opacity: 0.75;
      }
      .sheet-list {
        list-style: none;
        margin: 0 0 var(--space-3, 1rem);
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .sheet-check {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.5rem 0.6rem;
        border-radius: var(--radius-md, 0.75rem);
        background: rgba(148, 163, 184, 0.08);
      }
      .sheet-name {
        flex: 1 1 auto;
      }
      .sheet-hint {
        opacity: 0.75;
        font-size: 0.9rem;
      }
      .sheet-confirm {
        width: 100%;
      }
    `,
  ],
})
export class RevenueSheetComponent {
  @Input() open = false;
  @Input() kind: RevenueKind = 'round';
  @Input() members: TabletMember[] = [];
  @Input() selection: Record<string, boolean> = {};
  @Input() disabled = false;

  @Output() kindChange = new EventEmitter<RevenueKind>();
  @Output() toggle = new EventEmitter<string>();
  @Output() confirm = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}
