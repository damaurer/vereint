import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  signal,
} from '@angular/core';
import type { CreateReportPayload, ReportReason } from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { ModalComponent } from '../ui/modal.component';

/** Ergebnis des Dialogs: eine Meldung, eine Blockierung oder beides. */
export interface ReportDialogResult {
  report: CreateReportPayload | null;
  block: boolean;
}

export const REPORT_REASONS: readonly ReportReason[] = [
  'spam',
  'harassment',
  'inappropriate',
  'other',
];

/**
 * „Melden oder blockieren“ (#153) für Chatnachrichten, Moments und Antworten.
 *
 * Die Person wählt einen Grund und kann eine Notiz anhängen. Mit dem Haken
 * „Person blockieren“ (oder „Nur blockieren“) blendet die App die Inhalte der
 * Person zusätzlich aus. Die aufrufende Komponente schickt die Anfragen ab und
 * meldet über [busy] und [error] den Stand zurück.
 */
@Component({
  selector: 'app-report-dialog',
  imports: [ModalComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <vereint-modal
      [open]="open"
      [title]="'moderation.dialog.title' | t"
      [dismissible]="!busy"
      (closed)="closed.emit()"
    >
      <div class="report-body">
        @if (personName) {
          <p class="member-hint">{{ 'moderation.dialog.about' | t: { name: personName } }}</p>
        }
        <fieldset class="report-reasons">
          <legend>{{ 'moderation.dialog.reason' | t }}</legend>
          @for (option of reasons; track option) {
            <label class="report-reason">
              <input
                type="radio"
                name="report-reason"
                [value]="option"
                [checked]="reason() === option"
                (change)="reason.set(option)"
              />
              <span>{{ 'moderation.reason.' + option | t }}</span>
            </label>
          }
        </fieldset>
        <label class="member-field">
          <span>{{ 'moderation.dialog.note' | t }}</span>
          <textarea
            name="report-note"
            rows="3"
            maxlength="1000"
            [value]="note()"
            (input)="note.set($any($event.target).value)"
          ></textarea>
        </label>
        @if (blockable) {
          <label class="report-reason">
            <input
              type="checkbox"
              name="report-block"
              [checked]="block()"
              (change)="block.set(!block())"
            />
            <span>{{
              'moderation.dialog.alsoBlock'
                | t: { name: personName || ('moderation.dialog.person' | t) }
            }}</span>
          </label>
          <p class="member-hint">{{ 'moderation.dialog.blockHint' | t }}</p>
        }
        <p class="member-hint">
          {{
            (handledBy === 'platform'
              ? 'moderation.dialog.toPlatform'
              : 'moderation.dialog.toGroup'
            ) | t
          }}
        </p>
        @if (error) {
          <p class="member-hint member-hint-error" role="alert">{{ error }}</p>
        }
        <div class="report-actions">
          <button
            type="button"
            class="member-button member-button-ghost"
            [disabled]="busy"
            (click)="closed.emit()"
          >
            {{ 'common.cancel' | t }}
          </button>
          @if (blockable) {
            <button
              type="button"
              class="member-button member-button-ghost"
              [disabled]="busy"
              (click)="onlyBlock()"
            >
              {{ 'moderation.dialog.onlyBlock' | t }}
            </button>
          }
          <button
            type="button"
            class="member-button"
            [disabled]="busy || !reason()"
            (click)="submit()"
          >
            {{ (busy ? 'moderation.dialog.sending' : 'moderation.dialog.send') | t }}
          </button>
        </div>
      </div>
    </vereint-modal>
  `,
  styles: [
    `
      .report-body {
        display: grid;
        gap: var(--space-3);
      }
      .report-reasons {
        display: grid;
        gap: var(--space-2);
        border: 0;
        margin: 0;
        padding: 0;
      }
      .report-reasons legend {
        font-weight: 600;
        margin-bottom: var(--space-2);
      }
      .report-reason {
        display: flex;
        gap: var(--space-2);
        align-items: center;
      }
      .member-field textarea {
        font: inherit;
        padding: 0.6rem 0.75rem;
        border-radius: var(--radius-md, 0.5rem);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text);
        resize: vertical;
      }
      .report-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--space-2);
      }
    `,
  ],
})
export class ReportDialogComponent implements OnChanges {
  @Input() open = false;
  /** Name der Person, um die es geht (für Texte). */
  @Input() personName: string | null = null;
  /** Ob die Person blockiert werden kann (nicht bei eigenen Inhalten). */
  @Input() blockable = true;
  /** Wer die Meldung bekommt: Verwaltung der Gruppe oder Anwendungs-Administration. */
  @Input() handledBy: 'group' | 'platform' = 'group';
  @Input() busy = false;
  @Input() error: string | null = null;

  @Output() readonly submitted = new EventEmitter<ReportDialogResult>();
  @Output() readonly closed = new EventEmitter<void>();

  protected readonly reasons = REPORT_REASONS;
  protected readonly reason = signal<ReportReason | null>(null);
  protected readonly note = signal('');
  protected readonly block = signal(false);

  ngOnChanges(): void {
    if (!this.open) {
      this.reason.set(null);
      this.note.set('');
      this.block.set(false);
    }
  }

  protected submit(): void {
    const reason = this.reason();
    if (!reason) return;
    const note = this.note().trim();
    this.submitted.emit({
      report: note ? { reason, note } : { reason },
      block: this.blockable && this.block(),
    });
  }

  protected onlyBlock(): void {
    this.submitted.emit({ report: null, block: true });
  }
}
