import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { AvatarBadgeComponent, StatusBadgeComponent } from '../ui';
import { IconComponent } from '../ui/icon.component';
import { TranslatePipe } from '../i18n';
import { formatMoney } from '../member/member-format';
import type { Round } from '../api/api.types';
import { describeRound, roundStatusLabel, roundStatusTone, validityText } from './round-format';

/**
 * Karte einer Runde: wer ausgibt, was, Stand, Höchstsumme, Verbrauch,
 * Gültigkeit und die Eingeladenen (eingelöst mit Häkchen). Am Terminal nur
 * Anzeige; am Handy optional mit „Beenden“ für die eigene Runde.
 */
@Component({
  selector: 'app-round-card',
  standalone: true,
  imports: [AvatarBadgeComponent, StatusBadgeComponent, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="round-card">
      <header class="round-head">
        <vereint-avatar-badge [name]="round.sponsorName" />
        <div class="round-who">
          <span class="round-sponsor">{{ round.sponsorName }}</span>
          <span class="round-what">{{ describe() }}</span>
        </div>
        <vereint-status-badge [label]="statusLabel()" [tone]="statusTone()" />
      </header>
      <dl class="round-stats">
        <div class="round-stat">
          <dt>{{ 'rounds.card.gives' | t }}</dt>
          <dd>{{ 'rounds.card.upTo' | t: { amount: money(round.maxAmount) } }}</dd>
        </div>
        <div class="round-stat">
          <dt>{{ 'rounds.card.used' | t }}</dt>
          <dd>{{ money(round.usedAmount) }}</dd>
        </div>
        <div class="round-stat is-valid">
          <dt>{{ 'rounds.card.valid' | t }}</dt>
          <dd>{{ validity() }}</dd>
        </div>
      </dl>
      <p class="round-invited">
        @if (round.kind === 'round') {
          {{ 'rounds.card.redeemed' | t: { count: redeemedCount(), total: round.invitees.length } }}
        } @else {
          {{ 'rounds.card.invited' | t }}
        }
      </p>
      <ul class="round-people">
        @for (person of round.invitees; track person.memberId) {
          <li class="round-person" [class.is-redeemed]="person.redeemed">
            @if (person.redeemed) {
              <vereint-icon name="check" />
            }
            {{ person.displayName }}
          </li>
        }
      </ul>
      @if (endable) {
        <button
          type="button"
          class="member-button ghost round-end"
          [disabled]="busy"
          (click)="end.emit(round)"
        >
          {{ 'rounds.end' | t }}
        </button>
      }
    </article>
  `,
  styles: [
    `
      .round-card {
        display: grid;
        gap: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: var(--color-surface);
      }
      .round-head {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .round-who {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
      }
      .round-sponsor {
        font-weight: 800;
      }
      .round-what {
        color: var(--color-text-muted);
      }
      .round-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-1);
        margin: 0;
      }
      .round-stat {
        padding: var(--space-2);
        border-radius: var(--radius-md);
        background: var(--color-surface-subtle);
      }
      .round-stat.is-valid {
        background: var(--color-brand-soft);
        color: var(--color-brand);
      }
      .round-stat dt {
        font-size: 0.75rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .round-stat dd {
        margin: 0.2rem 0 0;
        font-size: 1.1rem;
        font-weight: 800;
      }
      .round-invited {
        margin: 0;
        font-weight: 700;
      }
      .round-people {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .round-person {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.3rem 0.8rem;
        border: 1px solid var(--color-border-dark);
        border-radius: 999px;
      }
      .round-person.is-redeemed {
        border-color: transparent;
        background: var(--color-success-light);
        color: var(--color-success);
        font-weight: 700;
      }
      .round-end {
        justify-self: start;
        min-height: 44px;
      }
    `,
  ],
})
export class RoundCardComponent {
  @Input({ required: true }) round!: Round;
  /** Zeigt „Beenden“ (eigene, laufende Runde am Handy). */
  @Input() endable = false;
  @Input() busy = false;
  @Output() readonly end = new EventEmitter<Round>();

  protected describe(): string {
    return describeRound(this.round);
  }

  protected validity(): string {
    return validityText(this.round);
  }

  protected statusLabel(): string {
    return roundStatusLabel(this.round);
  }

  protected statusTone() {
    return roundStatusTone(this.round);
  }

  protected redeemedCount(): number {
    return this.round.invitees.filter((person) => person.redeemed).length;
  }

  protected money(amount: string): string {
    return formatMoney(amount, this.round.currency);
  }
}
