import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { describeApiError } from '../api/api-client.service';
import type { CreateEventPayload, DirectoryMember } from '../api/api.types';
import { MemberApiService } from '../member/member-api.service';
import { IconComponent } from '../ui';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';
import { REMINDER_HOUR_OPTIONS, localInputToIso, reminderLabelKey } from './event-datetime';
import { MemberPickerComponent } from './member-picker.component';

/** Wann Eingeladene benachrichtigt werden. */
export type InvitationTiming = 'onPublish' | 'at';

/**
 * Neues Event anlegen (`/events/new`).
 *
 * Jedes Mitglied (sowie Vorstand/Admin) darf ein Event erstellen. Gäste werden
 * per Name aus dem Mitgliederverzeichnis gewählt oder es werden alle
 * Mitglieder eingeladen. „Als Entwurf speichern“ legt das Event still an;
 * „Veröffentlichen und einladen“ benachrichtigt die Eingeladenen sofort oder
 * zum gewählten Zeitpunkt. Die Berechtigung prüft der Fachservice.
 */
@Component({
  selector: 'app-event-create',
  imports: [FormsModule, RouterLink, IconComponent, MemberPickerComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="create-title">
        <span class="eyebrow">{{ 'events.create.eyebrow' | t }}</span>
        <a class="member-back" routerLink="/events">{{ 'events.create.back' | t }}</a>
        <h1 id="create-title">{{ 'events.create.title' | t }}</h1>
        <p>{{ 'events.create.intro' | t }}</p>

        <form class="create-form" (ngSubmit)="submit('published')" novalidate>
          <label class="create-field">
            <span>{{ 'events.create.name' | t }} *</span>
            <input name="title" [(ngModel)]="form.title" maxlength="255" required autocomplete="off" />
          </label>
          <label class="create-field">
            <span>{{ 'events.create.description' | t }}</span>
            <textarea name="description" [(ngModel)]="form.description" maxlength="4000" rows="3"></textarea>
          </label>
          <label class="create-field">
            <span>{{ 'events.create.location' | t }}</span>
            <input name="location" [(ngModel)]="form.location" maxlength="255" />
          </label>
          <div class="create-row">
            <label class="create-field">
              <span>{{ 'events.create.start' | t }} *</span>
              <input type="datetime-local" name="startsAt" [(ngModel)]="form.startsAt" required />
            </label>
            <label class="create-field">
              <span>{{ 'events.create.end' | t }}</span>
              <input type="datetime-local" name="endsAt" [(ngModel)]="form.endsAt" />
            </label>
          </div>

          <app-member-picker
            [legend]="'events.create.invitees' | t"
            [members]="directory()"
            [(selected)]="selectedIds"
            [(allMembers)]="inviteAll"
          />
          @if (directoryError(); as error) {
            <p class="create-error" role="alert">{{ error }}</p>
          }

          <fieldset class="create-fieldset">
            <legend>{{ 'events.create.notifyHeading' | t }}</legend>
            <label class="create-radio">
              <input type="radio" name="timing" value="onPublish" [(ngModel)]="form.timing" />
              {{ 'events.create.notifyOnPublish' | t }}
            </label>
            <label class="create-radio">
              <input type="radio" name="timing" value="at" [(ngModel)]="form.timing" />
              {{ 'events.create.notifyAt' | t }}
            </label>
            @if (form.timing === 'at') {
              <label class="create-field">
                <span>{{ 'events.create.notifyAtTime' | t }}</span>
                <input type="datetime-local" name="notifyAt" [(ngModel)]="form.notifyAt" required />
              </label>
            }
          </fieldset>

          <label class="create-field">
            <span>{{ 'events.create.reminder' | t }}</span>
            <select name="reminder" [(ngModel)]="form.reminderHours">
              @for (option of reminderOptions; track option) {
                <option [ngValue]="option">{{ reminderLabel(option) }}</option>
              }
            </select>
          </label>

          @if (error(); as message) {
            <p class="create-error" role="alert">{{ message }}</p>
          }

          <div class="create-actions">
            <button type="button" class="member-button-outline create-draft" [disabled]="busy()" (click)="submit('draft')">
              {{ 'events.create.saveDraft' | t }}
            </button>
            <button type="submit" class="member-button create-publish" [disabled]="busy()">
              <vereint-icon name="send" /> {{ 'events.create.publish' | t }}
            </button>
          </div>
        </form>
      </section>
    </main>
  `,
  styles: [
    `
      .create-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: 1rem;
      }
      .create-row {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      }
      .create-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
      }
      .create-field input,
      .create-field select,
      .create-field textarea {
        padding: 0.5rem;
        border: 1px solid var(--color-border-dark, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
        min-height: 2.75rem;
      }
      .create-fieldset {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0;
        padding: 0.75rem;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 0.75rem);
      }
      .create-fieldset legend {
        padding: 0 0.25rem;
        font-weight: 600;
      }
      .create-radio {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.5rem;
      }
      .create-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: flex-end;
      }
      .create-actions button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        min-height: 2.75rem;
      }
      .member-button-outline {
        padding: 0 1rem;
        background: transparent;
        color: var(--color-text);
        border: 1px solid var(--color-border-dark, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .create-error {
        margin: 0;
        color: var(--color-danger, #b91c1c);
        font-weight: 600;
      }
    `,
  ],
})
export class EventCreateComponent implements OnInit {
  private readonly api = inject(MemberApiService);
  private readonly router = inject(Router);

  protected readonly directory = signal<DirectoryMember[]>([]);
  protected readonly directoryError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reminderOptions = REMINDER_HOUR_OPTIONS;

  protected selectedIds: string[] = [];
  protected inviteAll = false;
  protected readonly form = {
    title: '',
    description: '',
    location: '',
    startsAt: '',
    endsAt: '',
    timing: 'onPublish' as InvitationTiming,
    notifyAt: '',
    reminderHours: null as number | null,
  };

  ngOnInit(): void {
    this.api.listDirectory().subscribe({
      next: (members) => this.directory.set(members),
      error: (error: unknown) => this.directoryError.set(describeApiError(error)),
    });
  }

  protected reminderLabel(hours: number | null): string {
    const { key, count } = reminderLabelKey(hours);
    return translate(key, { count });
  }

  /** Prüft das Formular und baut die Nutzlast; Fehler als Text, sonst die Nutzlast. */
  protected buildPayload(status: 'draft' | 'published'): CreateEventPayload | string {
    const title = this.form.title.trim();
    if (!title) return translate('events.create.errors.title');
    const startsAt = localInputToIso(this.form.startsAt);
    if (!startsAt) return translate('events.create.errors.start');
    const endsAt = localInputToIso(this.form.endsAt);
    if (endsAt && endsAt < startsAt) return translate('events.create.errors.end');
    let invitationNotifyAt: string | null = null;
    if (this.form.timing === 'at') {
      invitationNotifyAt = localInputToIso(this.form.notifyAt);
      if (!invitationNotifyAt) return translate('events.create.errors.notifyAt');
    }
    const payload: CreateEventPayload = {
      title,
      description: this.form.description.trim() || null,
      location: this.form.location.trim() || null,
      startsAt,
      endsAt,
      status,
      invitationNotifyAt,
      reminderHoursBefore: this.form.reminderHours,
    };
    if (this.inviteAll) payload.inviteAllMembers = true;
    else if (this.selectedIds.length > 0) payload.inviteUserIds = [...this.selectedIds];
    return payload;
  }

  protected submit(status: 'draft' | 'published'): void {
    if (this.busy()) return;
    const payload = this.buildPayload(status);
    if (typeof payload === 'string') {
      this.error.set(payload);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.createEvent(payload).subscribe({
      next: (event) => {
        this.busy.set(false);
        void this.router.navigate(['/events', event.id, 'manage']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(describeApiError(error));
      },
    });
  }
}
