import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, type Observable } from 'rxjs';
import { AsyncState } from '../member/async-state';
import { eventStatusLabel, formatDateTime, formatMoney } from '../member/member-format';
import { describeApiError } from '../api/api-client.service';
import type { EventDetail, EventParticipant, MemberProfile } from '../api/api.types';
import {
  InfoPanelComponent,
  StatusBadgeComponent,
  type StatusTone,
} from '../ui';
import { EventManageService } from './event-manage.service';
import type {
  ChatMessage,
  CreatedInvite,
  EventDrink,
  EventStatus,
  Invite,
  ParticipantRole,
} from './event-manage.types';

interface ManageHeader {
  event: EventDetail;
  profile: MemberProfile;
}

interface ManageSections {
  participants: EventParticipant[];
  drinks: EventDrink[];
  invites: Invite[];
  messages: ChatMessage[];
}

/** Auswählbare Eventstatuswerte für das Stammdatenformular. */
const EVENT_STATUS_VALUES: readonly EventStatus[] = [
  'draft',
  'published',
  'active',
  'cancelled',
  'completed',
  'archived',
];

/**
 * Owner-Verwaltung eines Events (TICKET-025).
 *
 * Bietet dem Gastgeber (sowie moderierend Vorstand/Admin) Stammdaten, Status,
 * Teilnehmer, Eventgetränke, Einladungen und den Event-Chat. Die Owner-Grenze
 * wird in der Oberfläche sichtbar durchgesetzt (Steuerelemente nur für
 * Berechtigte); die verbindliche Prüfung erfolgt serverseitig im Fachservice,
 * der unberechtigte Aufrufe mit `403` beantwortet (`deny by default`). Die
 * Ansicht wird ausschließlich im Browser gerendert.
 */
@Component({
  selector: 'app-event-manage',
  imports: [FormsModule, RouterLink, InfoPanelComponent, StatusBadgeComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="manage-title">
        <span class="eyebrow">Gastgeber</span>
        <a class="member-back" [routerLink]="['/events', eventId]">← Zum Event</a>

        @if (header.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Die Eventverwaltung wird vorbereitet.</span>
          </div>
        } @else if (header.isError()) {
          <div class="state-card state-error" role="alert">
            <strong>Verwaltung nicht verfügbar</strong>
            <span>{{ header.errorMessage() }}</span>
            <button type="button" class="member-button" (click)="reload()">Erneut versuchen</button>
          </div>
        } @else if (header.data(); as head) {
          <h1 id="manage-title">{{ head.event.title }} verwalten</h1>
          <p class="manage-status">
            <vereint-status-badge
              [label]="eventStatusLabel(head.event.status)"
              [tone]="eventTone(head.event.status)"
            />
          </p>
          @if (head.event.location) {
            <vereint-info-panel icon="📍" title="Nächster Termin">
              {{ head.event.location }} · {{ formatDateTime(head.event.startsAt) }}
            </vereint-info-panel>
          }

          @if (!isManager()) {
            <div class="state-card state-error" role="alert">
              <strong>Keine Verwaltungsrechte</strong>
              <span>Nur der Gastgeber dieses Events (oder der Vorstand) kann es verwalten.</span>
            </div>
          } @else {
            @if (actionError(); as err) {
              <p class="manage-action-error" role="alert">{{ err }}</p>
            }
            @if (actionInfo(); as info) {
              <p class="manage-action-info" role="status">{{ info }}</p>
            }

            <!-- Stammdaten und Status -->
            <h2 class="member-subtitle">Stammdaten</h2>
            <form class="manage-form" (ngSubmit)="saveEvent(head.event)">
              <label class="manage-field">
                <span>Titel</span>
                <input name="title" [(ngModel)]="form.title" maxlength="255" required />
              </label>
              <label class="manage-field">
                <span>Ort</span>
                <input name="location" [(ngModel)]="form.location" maxlength="255" />
              </label>
              <label class="manage-field">
                <span>Beschreibung</span>
                <textarea name="description" [(ngModel)]="form.description" maxlength="4000"></textarea>
              </label>
              <label class="manage-field">
                <span>Status</span>
                <select name="status" [(ngModel)]="form.status">
                  @for (value of statusValues; track value) {
                    <option [value]="value">{{ eventStatusLabel(value) }}</option>
                  }
                </select>
              </label>
              <button type="submit" class="member-button" [disabled]="busy()">Stammdaten speichern</button>
            </form>

            @if (sections.data(); as data) {
              <!-- Teilnehmer & Anwesenheit -->
              <h2 class="member-subtitle">Teilnehmer &amp; Anwesenheit ({{ data.participants.length }})</h2>
              @if (data.participants.length === 0) {
                <p class="member-muted">Noch keine Teilnehmer.</p>
              } @else {
                <ul class="member-list">
                  @for (participant of data.participants; track participant.userId) {
                    <li class="member-list-item manage-row">
                      <span class="member-list-title">{{ participant.displayName }}</span>
                      <vereint-status-badge
                        [label]="participantRoleLabel(participant.role)"
                        [tone]="participantTone(participant.role)"
                      />
                      <button
                        type="button"
                        class="member-button member-button-danger"
                        [disabled]="busy()"
                        (click)="removeParticipant(participant.userId)"
                      >
                        Entfernen
                      </button>
                    </li>
                  }
                </ul>
              }
              <form class="manage-form manage-inline" (ngSubmit)="addParticipant()">
                <label class="manage-field">
                  <span>Teilnehmer-ID</span>
                  <input name="participantId" [(ngModel)]="participantForm.userId" required />
                </label>
                <label class="manage-field">
                  <span>Rolle</span>
                  <select name="participantRole" [(ngModel)]="participantForm.role">
                    <option value="participant">Teilnehmer</option>
                    <option value="coHost">Co-Gastgeber</option>
                  </select>
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">Hinzufügen</button>
              </form>

              <!-- Eventgetränke -->
              <h2 class="member-subtitle">Getränke ({{ data.drinks.length }})</h2>
              @if (data.drinks.length === 0) {
                <p class="member-muted">Noch keine Getränke zugewiesen.</p>
              } @else {
                <ul class="member-list">
                  @for (drink of data.drinks; track drink.id) {
                    <li class="member-list-item manage-row">
                      <span class="member-list-title">{{ drink.drinkName }}</span>
                      <span class="member-list-meta">{{ formatMoney(drink.price, drink.currency) }}</span>
                      <button
                        type="button"
                        class="member-button member-button-danger"
                        [disabled]="busy()"
                        (click)="removeDrink(drink.id)"
                      >
                        Entfernen
                      </button>
                    </li>
                  }
                </ul>
              }
              <form class="manage-form manage-inline" (ngSubmit)="addDrink()">
                <label class="manage-field">
                  <span>Getränke-ID</span>
                  <input name="drinkId" [(ngModel)]="drinkForm.drinkId" required />
                </label>
                <label class="manage-field">
                  <span>Preis</span>
                  <input name="drinkPrice" [(ngModel)]="drinkForm.price" inputmode="decimal" />
                </label>
                <label class="manage-field">
                  <span>Währung</span>
                  <input name="drinkCurrency" [(ngModel)]="drinkForm.currency" maxlength="3" />
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">Getränk hinzufügen</button>
              </form>
              <form class="manage-form manage-inline" (ngSubmit)="assignSublist()">
                <label class="manage-field">
                  <span>Sublist-ID</span>
                  <input name="sublistId" [(ngModel)]="sublistId" required />
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">Sublist zuweisen</button>
              </form>

              <!-- Einladungen -->
              <h2 class="member-subtitle">Einladungen ({{ data.invites.length }})</h2>
              @if (createdInvite(); as created) {
                <div class="state-card manage-invite-token" role="status">
                  <strong>Einladung erstellt</strong>
                  <span>Dieser Link wird nur einmal angezeigt:</span>
                  <code class="manage-token">{{ created.acceptPath }}</code>
                </div>
              }
              @if (data.invites.length === 0) {
                <p class="member-muted">Keine aktiven Einladungen.</p>
              } @else {
                <ul class="member-list">
                  @for (invite of data.invites; track invite.id) {
                    <li class="member-list-item manage-row">
                      <span class="member-list-title">{{ invite.role }}</span>
                      <span class="member-list-meta">
                        {{ invite.active ? 'aktiv' : 'inaktiv' }} · {{ invite.usesCount }}
                        @if (invite.maxUses) { / {{ invite.maxUses }} }
                      </span>
                      <button
                        type="button"
                        class="member-button member-button-danger"
                        [disabled]="busy() || invite.revoked"
                        (click)="revokeInvite(invite.id)"
                      >
                        Widerrufen
                      </button>
                    </li>
                  }
                </ul>
              }
              <form class="manage-form manage-inline" (ngSubmit)="createInvite()">
                <label class="manage-field">
                  <span>Gültig (Minuten)</span>
                  <input name="expiresInMinutes" [(ngModel)]="inviteForm.expiresInMinutes" inputmode="numeric" />
                </label>
                <label class="manage-field">
                  <span>Max. Nutzungen</span>
                  <input name="maxUses" [(ngModel)]="inviteForm.maxUses" inputmode="numeric" />
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">Gasteinladung erzeugen</button>
              </form>

              <!-- Event-Chat -->
              <h2 class="member-subtitle">Event-Chat ({{ data.messages.length }})</h2>
              @if (data.messages.length === 0) {
                <p class="member-muted">Noch keine Nachrichten.</p>
              } @else {
                <ul class="member-list manage-chat">
                  @for (message of data.messages; track message.id) {
                    <li class="member-list-item">
                      <span class="member-list-title">{{ message.senderName }}</span>
                      <span class="member-chat-text">{{ message.message }}</span>
                      <span class="member-list-meta">{{ formatDateTime(message.createdAt) }}</span>
                    </li>
                  }
                </ul>
              }
              <form class="manage-form manage-inline" (ngSubmit)="sendMessage()">
                <label class="manage-field manage-field-grow">
                  <span>Nachricht</span>
                  <input name="chatMessage" [(ngModel)]="chatMessage" maxlength="4000" required />
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">Senden</button>
              </form>
            } @else if (sections.isError()) {
              <p class="manage-action-error" role="alert">{{ sections.errorMessage() }}</p>
            }
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
      .manage-form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: end;
        margin: 0.75rem 0 1.5rem;
      }
      .manage-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 12rem;
      }
      .manage-field-grow {
        flex: 1 1 18rem;
      }
      .manage-field input,
      .manage-field select,
      .manage-field textarea {
        padding: 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        font: inherit;
      }
      .manage-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        justify-content: space-between;
      }
      .member-button-danger {
        background: #b91c1c;
      }
      .manage-action-error {
        color: #b91c1c;
        font-weight: 600;
      }
      .manage-action-info {
        color: #15803d;
        font-weight: 600;
      }
      .manage-token {
        word-break: break-all;
      }
      .manage-chat .member-chat-text {
        display: block;
      }
    `,
  ],
})
export class EventManageComponent implements OnInit, OnDestroy {
  private readonly service = inject(EventManageService);
  private readonly route = inject(ActivatedRoute);

  protected readonly eventId = this.route.snapshot.paramMap.get('eventId') ?? '';
  protected readonly statusValues = EVENT_STATUS_VALUES;

  protected readonly header = new AsyncState<ManageHeader>();
  protected readonly sections = new AsyncState<ManageSections>();

  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionInfo = signal<string | null>(null);
  protected readonly createdInvite = signal<CreatedInvite | null>(null);

  /** Owner bzw. Vorstand/Admin darf verwalten. */
  protected readonly isManager = computed(() => {
    const head = this.header.data();
    if (!head) return false;
    const isOwner = head.event.ownerId === head.profile.id;
    const isBoard = head.profile.roles.includes('board') || head.profile.roles.includes('admin');
    return isOwner || isBoard;
  });

  protected readonly form = { title: '', description: '', location: '', status: 'draft' as EventStatus };
  protected participantForm: { userId: string; role: ParticipantRole } = { userId: '', role: 'participant' };
  protected drinkForm = { drinkId: '', price: '', currency: '' };
  protected sublistId = '';
  protected inviteForm = { expiresInMinutes: '', maxUses: '' };
  protected chatMessage = '';

  protected readonly eventStatusLabel = eventStatusLabel;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatMoney = formatMoney;

  /** Ordnet den Eventstatus einer Badge-Farbe der geteilten Primitive zu. */
  protected eventTone(status: EventStatus): StatusTone {
    switch (status) {
      case 'active':
      case 'published':
        return 'success';
      case 'cancelled':
        return 'danger';
      case 'draft':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  /** Deutscher Klartext der Teilnehmerrolle für die Anwesenheits-Chips. */
  protected participantRoleLabel(role: string): string {
    return role === 'coHost' ? 'Co-Gastgeber' : 'Teilnehmer';
  }

  /** Farbe der Anwesenheits-/RSVP-Chips je Teilnehmerrolle. */
  protected participantTone(role: string): StatusTone {
    return role === 'coHost' ? 'success' : 'neutral';
  }

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.header.destroy();
    this.sections.destroy();
  }

  protected reload(): void {
    this.header.run(
      forkJoin({ event: this.service.getEvent(this.eventId), profile: this.service.loadProfile() }),
      (head) => {
        this.form.title = head.event.title;
        this.form.description = head.event.description ?? '';
        this.form.location = head.event.location ?? '';
        this.form.status = head.event.status;
        if (this.isManager()) {
          this.loadSections();
        }
      },
    );
  }

  private loadSections(): void {
    this.sections.run(
      forkJoin({
        participants: this.service.listParticipants(this.eventId),
        drinks: this.service.listDrinks(this.eventId),
        invites: this.service.listInvites(this.eventId),
        messages: this.service.listMessages(this.eventId),
      }),
    );
  }

  /** Führt eine schreibende Aktion aus und aktualisiert danach die Abschnitte. */
  private runAction<T>(source: Observable<T>, successInfo: string): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    source.subscribe({
      next: () => {
        this.busy.set(false);
        this.actionInfo.set(successInfo);
        this.loadSections();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(describeApiError(error));
      },
    });
  }

  protected saveEvent(current: EventDetail): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    this.service
      .updateEvent(this.eventId, {
        title: this.form.title.trim(),
        description: this.form.description.trim() || null,
        location: this.form.location.trim() || null,
        status: this.form.status,
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.actionInfo.set('Stammdaten gespeichert.');
          this.header.data.set({ event: updated, profile: this.header.data()!.profile });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.actionError.set(describeApiError(error));
          void current;
        },
      });
  }

  protected addParticipant(): void {
    const userId = this.participantForm.userId.trim();
    if (!userId) return;
    this.runAction(
      this.service.addParticipant(this.eventId, { userId, role: this.participantForm.role }),
      'Teilnehmer hinzugefügt.',
    );
    this.participantForm = { userId: '', role: 'participant' };
  }

  protected removeParticipant(userId: string): void {
    this.runAction(this.service.removeParticipant(this.eventId, userId), 'Teilnehmer entfernt.');
  }

  protected addDrink(): void {
    const drinkId = this.drinkForm.drinkId.trim();
    if (!drinkId) return;
    const price = this.drinkForm.price.trim();
    const currency = this.drinkForm.currency.trim();
    this.runAction(
      this.service.addDrink(this.eventId, {
        drinkId,
        price: price || undefined,
        currency: currency || undefined,
      }),
      'Getränk hinzugefügt.',
    );
    this.drinkForm = { drinkId: '', price: '', currency: '' };
  }

  protected removeDrink(eventDrinkId: string): void {
    this.runAction(this.service.removeDrink(this.eventId, eventDrinkId), 'Getränk entfernt.');
  }

  protected assignSublist(): void {
    const sublistId = this.sublistId.trim();
    if (!sublistId) return;
    this.runAction(this.service.assignSublist(this.eventId, { sublistId }), 'Sublist zugewiesen.');
    this.sublistId = '';
  }

  protected createInvite(): void {
    const expiresInMinutes = Number(this.inviteForm.expiresInMinutes.trim());
    const maxUses = Number(this.inviteForm.maxUses.trim());
    this.busy.set(true);
    this.actionError.set(null);
    this.actionInfo.set(null);
    this.service
      .createInvite(this.eventId, {
        role: 'guest',
        expiresInMinutes: Number.isFinite(expiresInMinutes) && expiresInMinutes > 0 ? expiresInMinutes : undefined,
        maxUses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : undefined,
      })
      .subscribe({
        next: (created) => {
          this.busy.set(false);
          this.createdInvite.set(created);
          this.actionInfo.set('Einladung erstellt.');
          this.inviteForm = { expiresInMinutes: '', maxUses: '' };
          this.loadSections();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.actionError.set(describeApiError(error));
        },
      });
  }

  protected revokeInvite(inviteId: string): void {
    this.runAction(this.service.revokeInvite(this.eventId, inviteId), 'Einladung widerrufen.');
  }

  protected sendMessage(): void {
    const message = this.chatMessage.trim();
    if (!message) return;
    this.runAction(this.service.sendMessage(this.eventId, { message }), 'Nachricht gesendet.');
    this.chatMessage = '';
  }
}
