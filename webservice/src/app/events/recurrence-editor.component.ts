import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs';
import type { RecurrencePreview, WeekdayCode } from '../api/api.types';
import { MemberApiService } from '../member/member-api.service';
import { IconComponent } from '../ui';
import { TranslatePipe } from '../i18n';
import { activeLocale, translate } from '../i18n/i18n.service';
import { localInputToIso } from './event-datetime';
import {
  LEAD_DAY_OPTIONS,
  MONTHS,
  POSITIONS,
  WEEKDAYS,
  applyPreset,
  describeRecurrence,
  localDateOf,
  monthName,
  positionName,
  presetLabel,
  presetsFor,
  toRecurrencePayload,
  weekdayName,
  type RecurrenceForm,
  type RecurrencePreset,
} from './recurrence';

/**
 * Wiederholung eines Events: Vorlagen für die üblichen Rhythmen, darunter
 * frei einstellbar (alle N Tage/Wochen/Monate/Jahre, Wochentage, n-ter bzw.
 * letzter Wochentag, Tag im Monat, Monate), Ende nach Anzahl oder Datum,
 * zusätzliche und ausgelassene Termine, Einladungsvorlauf und eine Vorschau
 * der nächsten Termine aus dem Fachservice.
 *
 * Das Formularobjekt gehört dem Elternteil; Änderungen werden direkt daran
 * vorgenommen und über `changed` gemeldet.
 */
@Component({
  selector: 'app-recurrence-editor',
  imports: [FormsModule, IconComponent, TranslatePipe],
  template: `
    <fieldset class="rec" data-testid="recurrence-editor">
      <legend><vereint-icon name="repeat" /> {{ 'events.recurrence.title' | t }}</legend>
      <label class="rec-field">
        <span>{{ 'events.recurrence.repeat' | t }}</span>
        <select
          name="recurrencePreset"
          data-testid="recurrence-preset"
          [ngModel]="form.preset"
          (ngModelChange)="choosePreset($event)"
          [disabled]="disabled"
        >
          @for (preset of presets(); track preset) {
            <option [value]="preset">{{ label(preset) }}</option>
          }
        </select>
      </label>

      @if (form.preset !== 'none') {
        <p class="rec-hint">{{ 'events.recurrence.hint' | t }}</p>

        @if (form.preset === 'custom') {
          <div class="rec-row">
            <label class="rec-field rec-interval">
              <span>{{ 'events.recurrence.intervalLabel' | t }}</span>
              <span class="rec-inline">
                {{ 'events.recurrence.every' | t }}
                <input
                  type="number"
                  name="recurrenceInterval"
                  min="1"
                  max="99"
                  inputmode="numeric"
                  [(ngModel)]="form.interval"
                  (ngModelChange)="touch()"
                />
              </span>
            </label>
            <label class="rec-field">
              <span>{{ 'events.recurrence.unitLabel' | t }}</span>
              <select
                name="recurrenceUnit"
                [(ngModel)]="form.frequency"
                (ngModelChange)="frequencyChanged()"
              >
                <option value="DAILY">{{ 'events.recurrence.unit.DAILY' | t }}</option>
                <option value="WEEKLY">{{ 'events.recurrence.unit.WEEKLY' | t }}</option>
                <option value="MONTHLY">{{ 'events.recurrence.unit.MONTHLY' | t }}</option>
                <option value="YEARLY">{{ 'events.recurrence.unit.YEARLY' | t }}</option>
              </select>
            </label>
          </div>

          @if (form.frequency === 'YEARLY') {
            <div class="rec-group" role="group" [attr.aria-label]="'events.recurrence.months' | t">
              <span class="rec-label">{{ 'events.recurrence.months' | t }}</span>
              <div class="rec-chips rec-chips-months">
                @for (month of months; track month) {
                  <button
                    type="button"
                    class="rec-chip"
                    [attr.aria-pressed]="form.months.includes(month)"
                    (click)="toggleMonth(month)"
                  >
                    {{ monthShort(month) }}
                  </button>
                }
              </div>
            </div>
          }

          @if (form.frequency === 'MONTHLY' || form.frequency === 'YEARLY') {
            <div
              class="rec-group"
              role="radiogroup"
              [attr.aria-label]="'events.recurrence.monthlyMode' | t"
            >
              <span class="rec-label">{{ 'events.recurrence.monthlyMode' | t }}</span>
              <label class="rec-radio">
                <input
                  type="radio"
                  name="recurrenceMode"
                  value="day"
                  [(ngModel)]="form.monthlyMode"
                  (ngModelChange)="touch()"
                />
                {{ 'events.recurrence.modeDay' | t }}
              </label>
              @if (form.monthlyMode === 'day') {
                <label class="rec-field rec-indent">
                  <span>{{ 'events.recurrence.monthDay' | t }}</span>
                  <select
                    name="recurrenceMonthDay"
                    [(ngModel)]="form.monthDay"
                    (ngModelChange)="touch()"
                  >
                    @for (day of monthDays; track day) {
                      <option [ngValue]="day">{{ day }}.</option>
                    }
                    <option [ngValue]="-1">{{ 'events.recurrence.lastDay' | t }}</option>
                  </select>
                </label>
              }
              <label class="rec-radio">
                <input
                  type="radio"
                  name="recurrenceMode"
                  value="weekday"
                  [(ngModel)]="form.monthlyMode"
                  (ngModelChange)="modeChanged()"
                />
                {{ 'events.recurrence.modeWeekday' | t }}
              </label>
              @if (form.monthlyMode === 'weekday') {
                <div class="rec-indent rec-group">
                  <span class="rec-label">{{ 'events.recurrence.positions' | t }}</span>
                  <div class="rec-chips">
                    @for (position of positions; track position) {
                      <button
                        type="button"
                        class="rec-chip"
                        [attr.aria-pressed]="form.positions.includes(position)"
                        (click)="togglePosition(position)"
                      >
                        {{ positionLabel(position) }}
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          }

          @if (
            form.frequency === 'WEEKLY' ||
            (form.frequency !== 'DAILY' && form.monthlyMode === 'weekday')
          ) {
            <div
              class="rec-group"
              role="group"
              [attr.aria-label]="'events.recurrence.weekdays' | t"
            >
              <span class="rec-label">{{ 'events.recurrence.weekdays' | t }}</span>
              <div class="rec-chips rec-chips-days">
                @for (day of weekdays; track day) {
                  <button
                    type="button"
                    class="rec-chip"
                    [attr.aria-pressed]="form.weekdays.includes(day)"
                    [attr.aria-label]="dayLong(day)"
                    (click)="toggleWeekday(day)"
                  >
                    {{ dayShort(day) }}
                  </button>
                }
              </div>
            </div>
          }
        }

        @if (form.frequency !== 'NONE') {
          <div class="rec-group" role="radiogroup" [attr.aria-label]="'events.recurrence.end' | t">
            <span class="rec-label">{{ 'events.recurrence.end' | t }}</span>
            <label class="rec-radio">
              <input
                type="radio"
                name="recurrenceEnd"
                value="never"
                [(ngModel)]="form.endMode"
                (ngModelChange)="touch()"
              />
              {{ 'events.recurrence.endNever' | t }}
            </label>
            <label class="rec-radio">
              <input
                type="radio"
                name="recurrenceEnd"
                value="count"
                [(ngModel)]="form.endMode"
                (ngModelChange)="touch()"
              />
              {{ 'events.recurrence.endCount' | t }}
            </label>
            @if (form.endMode === 'count') {
              <label class="rec-field rec-indent">
                <span>{{ 'events.recurrence.count' | t }}</span>
                <input
                  type="number"
                  name="recurrenceCount"
                  min="1"
                  max="500"
                  inputmode="numeric"
                  [(ngModel)]="form.count"
                  (ngModelChange)="touch()"
                />
              </label>
            }
            <label class="rec-radio">
              <input
                type="radio"
                name="recurrenceEnd"
                value="until"
                [(ngModel)]="form.endMode"
                (ngModelChange)="touch()"
              />
              {{ 'events.recurrence.endUntil' | t }}
            </label>
            @if (form.endMode === 'until') {
              <label class="rec-field rec-indent">
                <span>{{ 'events.recurrence.until' | t }}</span>
                <input
                  type="date"
                  name="recurrenceUntil"
                  [(ngModel)]="form.until"
                  (ngModelChange)="touch()"
                />
              </label>
            }
          </div>
        }

        <div class="rec-group">
          <span class="rec-label">{{
            (form.frequency === 'NONE'
              ? 'events.recurrence.extraIrregular'
              : 'events.recurrence.extra'
            ) | t
          }}</span>
          @if (form.frequency !== 'NONE') {
            <small class="rec-hint">{{ 'events.recurrence.extraHint' | t }}</small>
          }
          <div class="rec-add">
            <input
              type="date"
              name="recurrenceExtra"
              data-testid="recurrence-extra-input"
              [(ngModel)]="extraInput"
              [attr.aria-label]="'events.recurrence.extra' | t"
            />
            <button
              type="button"
              class="rec-add-button"
              data-testid="recurrence-extra-add"
              (click)="addDate('extra')"
            >
              <vereint-icon name="plus" /> {{ 'events.recurrence.add' | t }}
            </button>
          </div>
          @if (form.extraDates.length) {
            <ul class="rec-dates">
              @for (date of form.extraDates; track date) {
                <li>
                  {{ formatDate(date) }}
                  <button
                    type="button"
                    class="ui-icon-button"
                    [attr.aria-label]="
                      'events.recurrence.removeDate' | t: { date: formatDate(date) }
                    "
                    (click)="removeDate('extra', date)"
                  >
                    <vereint-icon name="close" />
                  </button>
                </li>
              }
            </ul>
          }
        </div>

        @if (form.frequency !== 'NONE') {
          <div class="rec-group">
            <span class="rec-label">{{ 'events.recurrence.excluded' | t }}</span>
            <small class="rec-hint">{{ 'events.recurrence.excludedHint' | t }}</small>
            <div class="rec-add">
              <input
                type="date"
                name="recurrenceExcluded"
                data-testid="recurrence-excluded-input"
                [(ngModel)]="excludedInput"
                [attr.aria-label]="'events.recurrence.excluded' | t"
              />
              <button
                type="button"
                class="rec-add-button"
                data-testid="recurrence-excluded-add"
                (click)="addDate('excluded')"
              >
                <vereint-icon name="plus" /> {{ 'events.recurrence.add' | t }}
              </button>
            </div>
            @if (form.excludedDates.length) {
              <ul class="rec-dates rec-dates-excluded">
                @for (date of form.excludedDates; track date) {
                  <li>
                    <s>{{ formatDate(date) }}</s>
                    <button
                      type="button"
                      class="ui-icon-button"
                      [attr.aria-label]="
                        'events.recurrence.removeDate' | t: { date: formatDate(date) }
                      "
                      (click)="removeDate('excluded', date)"
                    >
                      <vereint-icon name="close" />
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        }

        <label class="rec-field">
          <span>{{ 'events.recurrence.lead' | t }}</span>
          <select
            name="recurrenceLead"
            data-testid="recurrence-lead"
            [(ngModel)]="form.inviteLeadDays"
            (ngModelChange)="touch()"
          >
            @for (option of leadOptions; track option) {
              <option [ngValue]="option">{{ leadLabel(option) }}</option>
            }
          </select>
        </label>

        <section class="rec-preview" aria-live="polite" data-testid="recurrence-preview">
          <strong>{{ summary() }}</strong>
          <span class="rec-label">{{ 'events.recurrence.preview' | t }}</span>
          @if (error(); as message) {
            <p class="rec-error" role="alert">{{ message }}</p>
          } @else if (preview(); as result) {
            @if (result.dates.length === 0) {
              <p class="rec-hint">{{ 'events.recurrence.previewEmpty' | t }}</p>
            } @else {
              <ol class="rec-preview-list">
                @for (date of result.dates; track date) {
                  <li>{{ formatDateTime(date) }}</li>
                }
              </ol>
              @if (result.more) {
                <p class="rec-hint">{{ 'events.recurrence.previewMore' | t }}</p>
              }
            }
          } @else {
            <p class="rec-hint">{{ 'events.recurrence.previewLoading' | t }}</p>
          }
        </section>
      }
    </fieldset>
  `,
  styles: [
    `
      .rec {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin: 0;
        padding: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 0.75rem);
        min-width: 0;
      }
      .rec legend {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0 0.25rem;
        font-weight: 600;
      }
      .rec-row {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      }
      .rec-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
      }
      .rec-field input,
      .rec-field select,
      .rec-add input {
        padding: 0.5rem;
        border: 1px solid var(--color-border-dark);
        border-radius: 0.5rem;
        background-color: var(--color-surface);
        color: var(--color-text);
        font: inherit;
        min-height: 2.75rem;
        min-width: 0;
      }
      .rec-inline {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .rec-inline input {
        width: 5rem;
      }
      .rec-group {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        min-width: 0;
      }
      .rec-label {
        font-weight: 600;
        font-size: 0.9rem;
      }
      .rec-hint {
        margin: 0;
        color: var(--color-text-muted);
        font-size: 0.85rem;
      }
      .rec-indent {
        margin-left: 1.75rem;
      }
      .rec-radio {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.5rem;
      }
      .rec-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .rec-chips-days {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
      }
      .rec-chips-months {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }
      .rec-chip {
        min-height: 2.5rem;
        min-width: 2.5rem;
        padding: 0 0.6rem;
        border: 1px solid var(--color-border-dark);
        border-radius: 999px;
        background-color: var(--color-surface);
        color: var(--color-text);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
      }
      .rec-chip[aria-pressed='true'] {
        border-color: var(--color-brand);
        background-color: var(--color-brand);
        color: var(--color-on-brand);
      }
      .rec-add {
        display: flex;
        gap: 0.5rem;
      }
      .rec-add input {
        flex: 1;
      }
      .rec-add-button {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        min-height: 2.75rem;
        padding: 0 0.9rem;
        border: 1px solid var(--color-border-dark);
        border-radius: 0.5rem;
        background-color: var(--color-surface);
        color: var(--color-text);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .rec-dates {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .rec-dates li {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        padding-left: 0.65rem;
        border-radius: 999px;
        background-color: var(--color-surface-muted);
        font-size: 0.875rem;
      }
      .rec-dates-excluded li {
        color: var(--color-text-muted);
      }
      .rec-preview {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.75rem;
        border-radius: var(--radius-sm, 0.5rem);
        background-color: var(--color-brand-soft);
      }
      .rec-preview-list {
        margin: 0;
        padding-left: 1.25rem;
        display: grid;
        gap: 0.15rem;
        font-size: 0.9rem;
      }
      .rec-error {
        margin: 0;
        color: var(--color-danger);
        font-weight: 600;
      }
    `,
  ],
})
export class RecurrenceEditorComponent implements OnInit, OnChanges {
  private readonly api = inject(MemberApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Formularobjekt des Elternteils (wird direkt bearbeitet). */
  @Input({ required: true }) form!: RecurrenceForm;
  /** Beginn aus dem Formular (`YYYY-MM-DDTHH:mm`). */
  @Input() start = '';
  @Input() disabled = false;
  @Output() changed = new EventEmitter<RecurrenceForm>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly positions = POSITIONS;
  protected readonly months = MONTHS;
  protected readonly monthDays = Array.from({ length: 31 }, (_, i) => i + 1);
  protected readonly leadOptions = LEAD_DAY_OPTIONS;

  protected readonly presets = signal(presetsFor(null));
  protected readonly preview = signal<RecurrencePreview | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly summary = signal('');
  protected extraInput = '';
  protected excludedInput = '';

  private readonly requests = new Subject<void>();

  ngOnInit(): void {
    const sub = this.requests
      .pipe(
        debounceTime(250),
        switchMap(() => {
          const startsAt = localInputToIso(this.start);
          const payload = toRecurrencePayload(this.form);
          if (!startsAt || payload === null) return of(null);
          if (typeof payload === 'string') {
            this.error.set(payload);
            return of(null);
          }
          return this.api.previewRecurrence(startsAt, payload, 8).pipe(
            catchError(() => {
              this.error.set(translate('events.recurrence.previewEmpty'));
              return of(null);
            }),
          );
        }),
      )
      .subscribe((result) => {
        if (result) {
          this.error.set(null);
          this.preview.set(result);
        }
      });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
    this.refresh();
  }

  ngOnChanges(): void {
    this.presets.set(presetsFor(this.startDate()));
    if (!this.form) return;
    // Vorlagen hängen am Beginn („wöchentlich am Dienstag“): mit ihm mitziehen.
    if (!['none', 'custom', 'irregular'].includes(this.form.preset) && this.startDate()) {
      const keep = { endMode: this.form.endMode, count: this.form.count, until: this.form.until };
      Object.assign(this.form, applyPreset(this.form, this.form.preset, this.startDate()), keep);
    }
    this.refresh();
  }

  private startDate(): Date | null {
    return localDateOf(this.start);
  }

  protected label(preset: RecurrencePreset): string {
    return presetLabel(preset, this.startDate());
  }

  protected choosePreset(preset: RecurrencePreset): void {
    Object.assign(this.form, applyPreset(this.form, preset, this.startDate()));
    this.touch();
  }

  protected frequencyChanged(): void {
    const start = this.startDate() ?? new Date();
    if (this.form.frequency === 'YEARLY' && this.form.months.length === 0)
      this.form.months = [start.getMonth() + 1];
    if (this.form.weekdays.length === 0 && this.form.frequency !== 'DAILY') {
      this.form.weekdays = [WEEKDAYS[(start.getDay() + 6) % 7]];
    }
    this.touch();
  }

  protected modeChanged(): void {
    if (this.form.positions.length === 0)
      this.form.positions = [Math.floor(((this.startDate() ?? new Date()).getDate() - 1) / 7) + 1];
    this.frequencyChanged();
  }

  protected toggleWeekday(day: WeekdayCode): void {
    this.form.weekdays = toggle(this.form.weekdays, day);
    this.touch();
  }

  protected togglePosition(position: number): void {
    this.form.positions = toggle(this.form.positions, position);
    this.touch();
  }

  protected toggleMonth(month: number): void {
    this.form.months = toggle(this.form.months, month);
    this.touch();
  }

  protected addDate(kind: 'extra' | 'excluded'): void {
    const value = kind === 'extra' ? this.extraInput : this.excludedInput;
    if (!localDateOf(value)) return;
    const key = kind === 'extra' ? 'extraDates' : 'excludedDates';
    if (!this.form[key].includes(value)) this.form[key] = [...this.form[key], value].sort();
    if (kind === 'extra') this.extraInput = '';
    else this.excludedInput = '';
    this.touch();
  }

  protected removeDate(kind: 'extra' | 'excluded', date: string): void {
    const key = kind === 'extra' ? 'extraDates' : 'excludedDates';
    this.form[key] = this.form[key].filter((d) => d !== date);
    this.touch();
  }

  /** Formular geändert: Vorschau neu holen und Elternteil informieren. */
  protected touch(): void {
    this.refresh();
    this.changed.emit(this.form);
  }

  private refresh(): void {
    const payload = toRecurrencePayload(this.form);
    if (payload === null) {
      this.preview.set(null);
      this.error.set(null);
      this.summary.set('');
      return;
    }
    if (typeof payload === 'string') {
      this.error.set(payload);
      this.summary.set('');
      return;
    }
    this.error.set(null);
    this.summary.set(describeRecurrence(payload, this.startDate()));
    this.requests.next();
  }

  protected dayShort(day: WeekdayCode): string {
    return weekdayName(day, 'short');
  }

  protected dayLong(day: WeekdayCode): string {
    return weekdayName(day, 'long');
  }

  protected monthShort(month: number): string {
    return monthName(month, 'short');
  }

  protected positionLabel(position: number): string {
    return position < 0 ? translate('events.recurrence.chipLast') : positionName(position);
  }

  protected leadLabel(days: number | null): string {
    return days === null
      ? translate('events.recurrence.leadNow')
      : translate('events.recurrence.leadDays', { count: days });
  }

  protected formatDate(value: string): string {
    const date = localDateOf(value);
    if (!date) return value;
    return new Intl.DateTimeFormat(activeLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  protected formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat(activeLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }
}

function toggle<T>(items: T[], value: T): T[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}
