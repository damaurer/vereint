import {
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError } from '../api/api-client.service';
import type {
  EventSummary,
  MomentSessionDto,
  MomentTypeDto,
  MomentVisibility,
  StartMomentRequest,
} from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';
import { MemberApiService } from '../member/member-api.service';
import { formatDateTime } from '../member/member-format';
import { ModalComponent } from '../ui';
import { IconComponent } from '../ui/icon.component';

/** Wählbare Laufzeiten eines Moments (Minuten) samt Übersetzungsschlüssel. */
export const MOMENT_DURATIONS: readonly { minutes: number; key: string }[] = [
  { minutes: 15, key: 'moments.start.duration.m15' },
  { minutes: 30, key: 'moments.start.duration.m30' },
  { minutes: 60, key: 'moments.start.duration.h1' },
  { minutes: 120, key: 'moments.start.duration.h2' },
  { minutes: 1440, key: 'moments.start.duration.h24' },
];

/** Events, an die sich ein neuer Moment noch knüpfen lässt. */
const LINKABLE_EVENT_STATUS = new Set(['draft', 'published', 'active']);

/**
 * Dialog „Neuer Moment“: Thema (vom Vorstand gepflegt) ist Pflicht; Titel,
 * Nachricht, Event, Sichtbarkeit, Dauer und Standort sind optional.
 */
@Component({
  selector: 'app-moment-start-dialog',
  imports: [FormsModule, RouterLink, ModalComponent, IconComponent, TranslatePipe],
  template: `
    <vereint-modal [open]="open()" [title]="'moments.start.title' | t" (closed)="close()">
      <form class="moment-form" (ngSubmit)="submit()">
        <p class="form-intro">{{ 'moments.start.intro' | t }}</p>

        <!-- 1. Thema -->
        <fieldset class="field-block">
          <legend class="field-label">
            {{ 'moments.start.topicLabel' | t }}
            <span class="field-required" aria-hidden="true">*</span>
          </legend>
          @if (types().length > 0) {
            <div class="theme-grid" role="radiogroup">
              @for (opt of types(); track opt.code) {
                <label class="theme-tile pick-tile" [class.is-selected]="topicType === opt.code">
                  <input
                    type="radio"
                    class="visually-hidden"
                    name="topicType"
                    [value]="opt.code"
                    [(ngModel)]="topicType"
                  />
                  <span class="theme-emoji" aria-hidden="true">{{ opt.emoji }}</span>
                  <span class="theme-name">{{ opt.name }}</span>
                  @if (opt.description) {
                    <small class="theme-description">{{ opt.description }}</small>
                  }
                  <vereint-icon class="theme-check" name="check" />
                </label>
              }
            </div>
          } @else {
            <div class="theme-empty">
              <vereint-icon name="info" />
              <div>
                <p>{{ 'moments.start.noTypes' | t }}</p>
                @if (canManage()) {
                  <a routerLink="/board/moments" (click)="close()">{{
                    'moments.start.manageTypes' | t
                  }}</a>
                }
              </div>
            </div>
          }
        </fieldset>

        <!-- 2. Titel (optional) -->
        <label class="field-block">
          <span class="field-label">
            {{ 'moments.start.titleLabel' | t }}
            <span class="field-optional">{{ 'common.optional' | t }}</span>
          </span>
          <input
            type="text"
            class="text-input"
            [(ngModel)]="title"
            name="title"
            [placeholder]="selectedTypeName() || ('moments.start.titlePlaceholder' | t)"
            maxlength="255"
          />
        </label>

        <!-- 3. Nachricht -->
        <label class="field-block">
          <span class="field-label">
            {{ 'moments.start.messageLabel' | t }}
            <span class="field-optional">{{ 'common.optional' | t }}</span>
          </span>
          <textarea
            class="text-input"
            [(ngModel)]="message"
            name="message"
            [placeholder]="'moments.start.messagePlaceholder' | t"
            maxlength="500"
            rows="3"
          ></textarea>
          <small class="field-counter">{{ message.length }}/500</small>
        </label>

        <!-- 4. Event verknüpfen -->
        <div class="field-block">
          <label class="field-label" for="moment-event-select">
            {{ 'moments.start.eventLabel' | t }}
            <span class="field-optional">{{ 'common.optional' | t }}</span>
          </label>
          <select
            id="moment-event-select"
            class="text-input"
            [(ngModel)]="eventId"
            name="eventId"
            (ngModelChange)="onEventChange($event)"
          >
            <option value="">{{ 'moments.start.noEvent' | t }}</option>
            @for (ev of linkableEvents(); track ev.id) {
              <option [value]="ev.id">{{ ev.title }} · {{ formatDate(ev.startsAt) }}</option>
            }
          </select>
          @if (eventId) {
            <div
              class="segmented"
              role="radiogroup"
              [attr.aria-label]="'moments.start.visibilityLabel' | t"
            >
              <label class="segment" [class.is-selected]="visibility === 'group'">
                <input
                  type="radio"
                  class="visually-hidden"
                  name="visibility"
                  value="group"
                  [(ngModel)]="visibility"
                />
                <vereint-icon name="users" /> {{ 'moments.start.visibility.group' | t }}
              </label>
              <label class="segment" [class.is-selected]="visibility === 'event'">
                <input
                  type="radio"
                  class="visually-hidden"
                  name="visibility"
                  value="event"
                  [(ngModel)]="visibility"
                />
                <vereint-icon name="lock" /> {{ 'moments.start.visibility.event' | t }}
              </label>
            </div>
            <small class="field-hint">
              {{
                (visibility === 'event'
                  ? 'moments.start.visibility.eventHint'
                  : 'moments.start.visibility.groupHint'
                ) | t
              }}
            </small>
          } @else {
            <small class="field-hint">{{ 'moments.start.visibility.noEventHint' | t }}</small>
          }
        </div>

        <!-- 5. Dauer -->
        <fieldset class="field-block">
          <legend class="field-label">{{ 'moments.start.durationLabel' | t }}</legend>
          <div class="chip-row" role="radiogroup">
            @for (d of durations; track d.minutes) {
              <label class="choice-chip" [class.is-selected]="durationMinutes === d.minutes">
                <input
                  type="radio"
                  class="visually-hidden"
                  name="durationMinutes"
                  [value]="d.minutes"
                  [(ngModel)]="durationMinutes"
                />
                {{ d.key | t }}
              </label>
            }
          </div>
        </fieldset>

        <!-- 6. Standort -->
        <label class="toggle-row">
          <span class="toggle-icon"><vereint-icon name="location" /></span>
          <span class="toggle-text">
            <strong>{{ 'moments.start.consentTitle' | t }}</strong>
            <small>{{ geoStatus() || ('moments.start.consent' | t) }}</small>
          </span>
          <input
            type="checkbox"
            class="switch"
            role="switch"
            [(ngModel)]="consent"
            name="consent"
            (change)="onConsentToggle($event)"
          />
        </label>

        @if (error()) {
          <p class="form-error-msg" role="alert">{{ error() }}</p>
        }

        <div class="sheet-footer">
          <button type="button" class="member-button member-button-ghost" (click)="close()">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="member-button" [disabled]="submitting() || !topicType">
            {{ (submitting() ? 'moments.start.submitting' : 'moments.start.submit') | t }}
          </button>
        </div>
      </form>
    </vereint-modal>
  `,
  styleUrls: ['./moment-dialog.css'],
  styles: [
    `
      textarea.text-input {
        resize: vertical;
        min-height: 5.5rem;
      }
      .field-counter {
        align-self: flex-end;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .theme-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.6rem;
      }
      @media (min-width: 560px) {
        .theme-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      .theme-tile {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
        padding: 0.85rem;
      }
      .theme-emoji {
        font-size: 1.75rem;
        line-height: 1;
      }
      .theme-name {
        font-size: 0.9rem;
        font-weight: 700;
      }
      .theme-description {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        line-height: 1.3;
      }
      .theme-check {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        display: grid;
        place-items: center;
        width: 1.35rem;
        height: 1.35rem;
        border-radius: 50%;
        background-color: var(--color-brand);
        color: var(--color-on-brand);
        font-size: 0.8rem;
        opacity: 0;
        transform: scale(0.6);
        transition:
          opacity 0.15s ease,
          transform 0.15s ease;
      }
      .theme-tile.is-selected .theme-check {
        opacity: 1;
        transform: scale(1);
      }
      .theme-empty {
        display: flex;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border-radius: var(--radius-md);
        border: 1px dashed var(--color-border);
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }
      .theme-empty p {
        margin: 0 0 0.25rem;
      }
      .segmented {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
      }
      .segment {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        min-height: 2.5rem;
        padding: 0.4rem 0.6rem;
        border-radius: var(--radius-sm);
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text-muted);
        cursor: pointer;
      }
      .segment.is-selected {
        background-color: var(--color-surface);
        color: var(--color-text);
        box-shadow: var(--vereint-shadow);
      }
      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .choice-chip {
        display: inline-flex;
        align-items: center;
        min-height: 2.25rem;
        padding: 0.35rem 0.85rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
      }
      .choice-chip.is-selected {
        border-color: var(--color-brand);
        background-color: var(--color-brand);
        color: var(--color-on-brand);
      }
      .segment:focus-within,
      .choice-chip:focus-within {
        box-shadow: var(--vereint-focus-ring);
      }
    `,
  ],
})
export class MomentStartDialogComponent {
  private readonly api = inject(MemberApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly open = input(false);
  /** Aktive Themen des Vorstands. */
  readonly types = input<MomentTypeDto[]>([]);
  readonly events = input<EventSummary[]>([]);
  /** Vorauswahl, wenn die Seite auf ein Event gefiltert ist. */
  readonly defaultEventId = input<string | null>(null);
  readonly canManage = input(false);

  readonly closed = output<void>();
  readonly started = output<MomentSessionDto>();

  protected readonly durations = MOMENT_DURATIONS;
  protected readonly linkableEvents = computed(() =>
    this.events().filter((event) => LINKABLE_EVENT_STATUS.has(event.status)),
  );

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly geoStatus = signal<string | null>(null);
  protected title = '';
  protected topicType = '';
  protected message = '';
  protected durationMinutes = 60;
  protected eventId = '';
  protected visibility: MomentVisibility = 'group';
  protected consent = false;
  private latitude: number | null = null;
  private longitude: number | null = null;

  constructor() {
    // Bei jedem Öffnen frisch beginnen.
    effect(() => {
      if (this.open()) untracked(() => this.reset());
    });
  }

  protected selectedTypeName(): string {
    return this.types().find((type) => type.code === this.topicType)?.name ?? '';
  }

  protected close(): void {
    this.closed.emit();
  }

  /** Ohne Event gibt es nur „ganze Gruppe“. */
  protected onEventChange(eventId: string): void {
    if (!eventId) this.visibility = 'group';
  }

  protected onConsentToggle(event: Event): void {
    this.consent = (event.target as HTMLInputElement).checked;
    this.latitude = null;
    this.longitude = null;
    if (!this.consent || !this.isBrowser || !navigator.geolocation) {
      this.geoStatus.set(null);
      return;
    }
    this.geoStatus.set(translate('moments.geo.locating'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.latitude = pos.coords.latitude;
        this.longitude = pos.coords.longitude;
        this.geoStatus.set(
          translate('moments.geo.captured', {
            lat: pos.coords.latitude.toFixed(2),
            lng: pos.coords.longitude.toFixed(2),
          }),
        );
      },
      () => this.geoStatus.set(translate('moments.geo.failedOrDenied')),
    );
  }

  protected submit(): void {
    if (!this.topicType) return;
    this.submitting.set(true);
    this.error.set(null);

    const payload: StartMomentRequest = {
      title: this.title.trim() || undefined,
      topicType: this.topicType,
      message: this.message.trim() || undefined,
      durationMinutes: this.durationMinutes,
      consent: this.consent,
      latitude: this.latitude ?? undefined,
      longitude: this.longitude ?? undefined,
      eventId: this.eventId || undefined,
      visibility: this.eventId ? this.visibility : 'group',
    };

    this.api.startMoment(payload).subscribe({
      next: (session) => {
        this.submitting.set(false);
        this.started.emit(session);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(
          err instanceof ApiError
            ? err.message || translate('moments.start.error')
            : translate('moments.start.failed'),
        );
      },
    });
  }

  protected formatDate(iso: string): string {
    return formatDateTime(iso);
  }

  private reset(): void {
    this.title = '';
    this.topicType = this.types()[0]?.code ?? '';
    this.message = '';
    this.durationMinutes = 60;
    this.eventId = this.defaultEventId() ?? '';
    this.visibility = 'group';
    this.consent = false;
    this.latitude = null;
    this.longitude = null;
    this.geoStatus.set(null);
    this.error.set(null);
  }
}
