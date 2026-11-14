import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import type { CalendarEntry, CalendarResponse } from '../api/api.types';
import { AuthService } from '../auth/auth.service';
import { activeLocale, translate, TranslatePipe } from '../i18n';
import { AsyncState } from '../member/async-state';
import { eventStatusLabel, formatDateTime } from '../member/member-format';
import { rsvpLabelKey } from '../member/member-api.service';
import type { EventStatus } from '../api/api.types';
import { IconComponent, StatusBadgeComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import {
  addMonths,
  buildMonth,
  dayKey,
  monthRange,
  startOfMonth,
  type CalendarDay,
} from './calendar-month';
import { PersonalApiService } from './personal-api.service';

/**
 * Persönlicher Kalender (`/kalender`) über alle eigenen Gruppen.
 *
 * Zeigt je Monat die sichtbaren Events (vergangene und künftige) und die
 * Moments aller Gruppen, in denen man Mitglied ist. Events und Moments bleiben
 * Teil ihrer Gruppe: Jeder Eintrag nennt seine Gruppe, und ein Klick auf einen
 * Eintrag einer anderen Gruppe wechselt zuerst in diese Gruppe und öffnet ihn
 * dann dort.
 *
 * Lädt nur im Browser; im SSR-HTML stehen keine persönlichen Termine.
 */
@Component({
  selector: 'app-calendar',
  imports: [StateComponent, IconComponent, StatusBadgeComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="calendar-title">
        <span class="eyebrow">{{ 'calendar.eyebrow' | t }}</span>
        <h1 id="calendar-title">{{ 'calendar.title' | t }}</h1>
        @if (groups().length > 1) {
          <label class="cal-filter">
            <span>{{ 'calendar.groupFilter' | t }}</span>
            <select [value]="groupFilter()" (change)="groupFilter.set($any($event.target).value)">
              <option value="">{{ 'calendar.allGroups' | t }}</option>
              @for (group of groups(); track group.id) {
                <option [value]="group.id">{{ group.name }}</option>
              }
            </select>
          </label>
        }

        @if (openError()) {
          <p class="manage-action-error" role="alert">{{ openError() }}</p>
        }

        @if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'calendar.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else {
          <div class="cal-panel">
          <div class="cal-toolbar">
            <div class="cal-nav" role="group" [attr.aria-label]="'calendar.navLabel' | t">
              <button
                type="button"
                class="cal-icon"
                [attr.aria-label]="'calendar.previous' | t"
                (click)="shift(-1)"
              >
                <vereint-icon name="chevron-left" />
              </button>
              <h2 class="cal-month" aria-live="polite">{{ monthLabel() }}</h2>
              <button
                type="button"
                class="cal-icon"
                [attr.aria-label]="'calendar.next' | t"
                (click)="shift(1)"
              >
                <vereint-icon name="chevron-right" />
              </button>
            </div>
          </div>
          <div
            class="cal-grid"
            role="grid"
            [attr.aria-label]="monthLabel()"
            [class.is-loading]="load.isLoading()"
          >
            <div class="cal-row cal-weekdays" role="row">
              @for (name of weekdays(); track name) {
                <span class="cal-weekday" role="columnheader">{{ name }}</span>
              }
            </div>
            @for (week of weeks(); track week[0].key) {
              <div class="cal-row" role="row">
                @for (day of week; track day.key) {
                  <button
                    type="button"
                    role="gridcell"
                    class="cal-day"
                    [class.is-outside]="!day.inMonth"
                    [class.is-today]="day.isToday"
                    [class.is-selected]="day.key === selectedDay()"
                    [attr.aria-selected]="day.key === selectedDay()"
                    [attr.aria-label]="dayLabel(day)"
                    (click)="toggleDay(day.key)"
                  >
                    <span class="cal-day-number">{{ day.date.getDate() }}</span>
                    @if (visible(day.entries).length > 0) {
                      <span class="cal-marks" aria-hidden="true">
                        @for (
                          entry of visible(day.entries).slice(0, 3);
                          track entry.kind + entry.id
                        ) {
                          <span
                            class="cal-mark"
                            [class.is-moment]="entry.kind === 'moment'"
                            [class.is-past]="isPast(entry)"
                          ></span>
                        }
                        @if (visible(day.entries).length > 3) {
                          <span class="cal-more">+{{ visible(day.entries).length - 3 }}</span>
                        }
                      </span>
                    }
                  </button>
                }
              </div>
            }
          </div>

          </div>
          <div class="cal-agenda-head">
            <h2>{{ agendaTitle() }}</h2>
            <button type="button" class="cal-today" (click)="goToday()">
              {{ 'calendar.today' | t }}
            </button>
            @if (selectedDay()) {
              <button
                type="button"
                class="member-back cal-show-month"
                (click)="selectedDay.set(null)"
              >
                {{ 'calendar.showMonth' | t }}
              </button>
            }
          </div>
          @if (load.isLoading() && !load.data()) {
            <vereint-state
              kind="loading"
              [title]="'common.loading' | t"
              [message]="'calendar.loadingMessage' | t"
            />
          } @else if (agenda().length === 0) {
            <vereint-state
              kind="empty"
              [title]="'calendar.emptyTitle' | t"
              [message]="(selectedDay() ? 'calendar.emptyDay' : 'calendar.emptyMonth') | t"
            />
          } @else {
            <ul class="cal-agenda">
              @for (entry of agenda(); track entry.kind + entry.id) {
                <li>
                  <button
                    type="button"
                    class="cal-entry"
                    [class.is-past]="isPast(entry)"
                    [disabled]="opening() !== null"
                    (click)="open(entry)"
                  >
                    <span class="cal-entry-icon" aria-hidden="true">
                      @if (entry.kind === 'moment') {
                        {{ entry.emoji || '✨' }}
                      } @else {
                        <vereint-icon name="events" />
                      }
                    </span>
                    <span class="cal-entry-body">
                      <span class="cal-entry-kind">
                        {{
                          (entry.kind === 'moment' ? 'calendar.kindMoment' : 'calendar.kindEvent')
                            | t
                        }}
                        · {{ formatDateTime(entry.startsAt) }}
                      </span>
                      <span class="cal-entry-title">{{ entry.title }}</span>
                      @if (entry.location) {
                        <span class="cal-entry-meta">
                          {{
                            (entry.kind === 'moment' ? 'calendar.atEvent' : 'calendar.location')
                              | t: { name: entry.location }
                          }}
                        </span>
                      }
                      <span class="cal-entry-group">
                        <vereint-icon name="users" /> {{ entry.stammtischName }}
                      </span>
                    </span>
                    <span class="cal-entry-badges">
                      @if (entry.kind === 'event' && entry.status === 'cancelled') {
                        <vereint-status-badge
                          [label]="eventStatusLabel($any(entry.status))"
                          tone="danger"
                        />
                      } @else if (entry.kind === 'event' && entry.myRsvp) {
                        <vereint-status-badge
                          [label]="rsvpLabelKey($any(entry.myRsvp)) | t"
                          tone="neutral"
                        />
                      } @else if (entry.kind === 'moment' && entry.active) {
                        <vereint-status-badge
                          [label]="'calendar.momentActive' | t"
                          tone="success"
                        />
                      }
                      @if (opening() === entry.kind + entry.id) {
                        <span class="cal-entry-hint">{{ 'calendar.opening' | t }}</span>
                      }
                    </span>
                  </button>
                </li>
              }
            </ul>
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
      .cal-panel {
        margin-top: var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-surface-raised);
      }
      .cal-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-2);
      }
      .cal-nav {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .cal-month {
        margin: 0;
        flex: 1;
        text-align: center;
        font-size: 1.1rem;
        text-transform: capitalize;
      }
      .cal-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        cursor: pointer;
      }
      .cal-today {
        min-height: 2.25rem;
        padding: 0 0.85rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background-color: transparent;
        color: inherit;
        font: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
      }
      .cal-filter {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-weight: 600;
      }
      .cal-filter select {
        min-height: 2.75rem;
        padding: 0 0.75rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
      }
      .cal-grid {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .cal-grid.is-loading {
        opacity: 0.6;
      }
      .cal-row {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 2px;
      }
      .cal-weekday {
        text-align: center;
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--color-text-muted);
        padding: 0.25rem 0;
      }
      .cal-day {
        min-height: 2.75rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.15rem;
        padding: 0.25rem 0.1rem;
        border: 0;
        border-radius: var(--radius-md);
        background-color: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      .cal-day.is-outside {
        opacity: 0.45;
      }
      .cal-day:hover {
        background-color: var(--color-surface-subtle);
      }
      .cal-day.is-today .cal-day-number {
        color: var(--color-brand);
        font-weight: 800;
      }
      .cal-day.is-selected,
      .cal-day.is-selected:hover {
        background-color: var(--color-brand);
        color: var(--color-on-brand);
      }
      .cal-day.is-selected .cal-day-number {
        color: var(--color-on-brand);
      }
      .cal-day.is-selected .cal-mark {
        background-color: var(--color-on-brand);
      }
      .cal-day-number {
        font-weight: 500;
        font-size: 0.95rem;
      }
      .cal-marks {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .cal-mark {
        width: 0.3rem;
        height: 0.3rem;
        border-radius: 999px;
        background-color: var(--color-brand);
      }
      .cal-mark.is-moment {
        background-color: var(--color-accent, var(--color-warning));
      }
      .cal-mark.is-past {
        opacity: 0.55;
      }
      .cal-more {
        font-size: 0.7rem;
        color: var(--color-text-muted);
      }
      .cal-agenda-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
        margin-top: var(--space-4);
      }
      .cal-agenda-head h2 {
        flex: 1;
        margin: 0;
        font-size: 1.05rem;
      }
      .cal-show-month {
        background: none;
        border: none;
        cursor: pointer;
        font: inherit;
      }
      .cal-agenda {
        list-style: none;
        margin: var(--space-2) 0 0;
        padding: 0;
        display: grid;
        gap: var(--space-2);
      }
      .cal-entry {
        width: 100%;
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .cal-entry.is-past {
        opacity: 0.8;
      }
      .cal-entry-icon {
        flex: none;
        width: 2rem;
        font-size: 1.3rem;
        display: inline-flex;
        justify-content: center;
        color: var(--color-brand);
      }
      .cal-entry-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .cal-entry-kind,
      .cal-entry-meta {
        color: var(--color-text-muted);
        font-size: 0.85rem;
      }
      .cal-entry-title {
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .cal-entry-group {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.85rem;
        font-weight: 600;
      }
      .cal-entry-badges {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.25rem;
      }
      .cal-entry-hint {
        color: var(--color-text-muted);
        font-size: 0.8rem;
      }
    `,
  ],
})
export class CalendarComponent implements OnInit, OnDestroy {
  private readonly api = inject(PersonalApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly load = new AsyncState<CalendarResponse>();
  protected readonly month = signal(startOfMonth(new Date()));
  protected readonly selectedDay = signal<string | null>(null);
  protected readonly groupFilter = signal('');
  protected readonly opening = signal<string | null>(null);
  protected readonly openError = signal<string | null>(null);
  protected readonly formatDateTime = formatDateTime;
  protected readonly rsvpLabelKey = rsvpLabelKey;
  protected readonly eventStatusLabel = (status: EventStatus) => eventStatusLabel(status);

  private readonly entries = computed<CalendarEntry[]>(() => this.load.data()?.entries ?? []);

  /** Gruppen, die im geladenen Zeitraum vorkommen (für den Filter). */
  protected readonly groups = computed(() => {
    const seen = new Map<string, string>();
    for (const entry of this.entries()) seen.set(entry.stammtischId, entry.stammtischName);
    return [...seen]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, activeLocale()));
  });

  protected readonly weeks = computed<CalendarDay[][]>(() => {
    const days = buildMonth(this.month(), this.entries());
    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return weeks;
  });

  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat(activeLocale(), { month: 'long', year: 'numeric' }).format(
      this.month(),
    ),
  );

  /** Kurze Wochentagsnamen ab Montag in der aktiven Sprache. */
  protected readonly weekdays = computed(() => {
    const format = new Intl.DateTimeFormat(activeLocale(), { weekday: 'short' });
    // 5. Januar 2026 ist ein Montag.
    return Array.from({ length: 7 }, (_, i) => format.format(new Date(2026, 0, 5 + i)));
  });

  /** Einträge des gewählten Tags bzw. des ganzen Monats. */
  protected readonly agenda = computed<CalendarEntry[]>(() => {
    const day = this.selectedDay();
    const days = this.weeks().flat();
    const source = day
      ? (days.find((entry) => entry.key === day)?.entries ?? [])
      : days.filter((entry) => entry.inMonth).flatMap((entry) => entry.entries);
    const unique = new Map<string, CalendarEntry>();
    for (const entry of source) unique.set(entry.kind + entry.id, entry);
    return this.visible([...unique.values()]).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  });

  protected readonly agendaTitle = computed(() => {
    const day = this.selectedDay();
    if (!day) return translate('calendar.monthAgenda', { month: this.monthLabel() });
    const [year, month, date] = day.split('-').map(Number);
    return new Intl.DateTimeFormat(activeLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(year, month - 1, date));
  });

  ngOnInit(): void {
    if (!this.browser) return;
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    const { from, to } = monthRange(this.month());
    this.load.run(this.api.calendar(from, to));
  }

  protected shift(months: number): void {
    this.month.set(addMonths(this.month(), months));
    this.selectedDay.set(null);
    this.reload();
  }

  protected goToday(): void {
    const today = new Date();
    this.month.set(startOfMonth(today));
    this.selectedDay.set(dayKey(today));
    this.reload();
  }

  protected toggleDay(key: string): void {
    this.selectedDay.update((current) => (current === key ? null : key));
  }

  protected visible(entries: CalendarEntry[]): CalendarEntry[] {
    const group = this.groupFilter();
    return group ? entries.filter((entry) => entry.stammtischId === group) : entries;
  }

  protected isPast(entry: CalendarEntry): boolean {
    return new Date(entry.endsAt ?? entry.startsAt).getTime() < Date.now();
  }

  protected dayLabel(day: CalendarDay): string {
    const date = new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'full' }).format(day.date);
    const count = this.visible(day.entries).length;
    return count > 0 ? `${date}, ${translate('calendar.entries', { count })}` : date;
  }

  /** Öffnet den Eintrag in seiner Gruppe; wechselt dafür bei Bedarf die Gruppe. */
  protected async open(entry: CalendarEntry): Promise<void> {
    if (this.opening()) return;
    this.opening.set(entry.kind + entry.id);
    this.openError.set(null);
    const target =
      entry.kind === 'moment' ? ['/events', entry.eventId, 'moments'] : ['/events', entry.eventId];
    try {
      const session = await this.auth.getSession();
      if (session?.stammtisch?.id !== entry.stammtischId) {
        const ok = await this.auth.selectStammtisch(entry.stammtischId);
        if (!ok) {
          this.openError.set(translate('calendar.switchFailed', { name: entry.stammtischName }));
          return;
        }
        await this.auth.getSession(true);
      }
      await this.router.navigate(target);
    } finally {
      this.opening.set(null);
    }
  }
}
