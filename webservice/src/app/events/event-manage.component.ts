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
  EventFood,
  EventStatus,
  Invite,
  ParticipantRole,
} from './event-manage.types';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface ManageHeader {
  event: EventDetail;
  profile: MemberProfile;
}

interface ManageSections {
  participants: EventParticipant[];
  drinks: EventDrink[];
  food: EventFood[];
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
  imports: [StateComponent, FormsModule, RouterLink, InfoPanelComponent, StatusBadgeComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="manage-title">
        <span class="eyebrow">{{ 'events.manage.eyebrow' | t }}</span>
        <a class="member-back" [routerLink]="['/events', eventId]">{{ 'events.manage.back' | t }}</a>

        @if (header.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'events.manage.loadingMessage' | t"
          />
        } @else if (header.isError()) {
          <vereint-state
            kind="error"
            [title]="'events.manage.unavailable' | t"
            [message]="header.errorMessage()"
            (retry)="reload()"
          />
        } @else if (header.data(); as head) {
          <h1 id="manage-title">{{ 'events.manage.title' | t: { title: head.event.title } }}</h1>
          <p class="manage-status">
            <vereint-status-badge
              [label]="eventStatusLabel(head.event.status)"
              [tone]="eventTone(head.event.status)"
            />
          </p>
          @if (head.event.location) {
            <vereint-info-panel icon="location" [title]="'events.manage.nextDate' | t">
              {{ head.event.location }} · {{ formatDateTime(head.event.startsAt) }}
            </vereint-info-panel>
          }

          @if (!isManager()) {
            <div class="state-card state-error" role="alert">
              <strong>{{ 'events.manage.noRights' | t }}</strong>
              <span>{{ 'events.manage.noRightsHint' | t }}</span>
            </div>
          } @else {
            @if (actionError(); as err) {
              <p class="manage-action-error" role="alert">{{ err }}</p>
            }
            @if (actionInfo(); as info) {
              <p class="manage-action-info" role="status">{{ info }}</p>
            }

            <!-- Stammdaten und Status -->
            <h2 class="member-subtitle">{{ 'events.manage.details.title' | t }}</h2>
            <form class="manage-form" (ngSubmit)="saveEvent()">
              <label class="manage-field">
                <span>{{ 'events.manage.details.name' | t }}</span>
                <input name="title" [(ngModel)]="form.title" maxlength="255" required />
              </label>
              <label class="manage-field">
                <span>{{ 'events.manage.details.location' | t }}</span>
                <input name="location" [(ngModel)]="form.location" maxlength="255" />
              </label>
              <label class="manage-field">
                <span>{{ 'events.manage.details.description' | t }}</span>
                <textarea name="description" [(ngModel)]="form.description" maxlength="4000"></textarea>
              </label>
              <label class="manage-field">
                <span>{{ 'events.manage.details.status' | t }}</span>
                <select name="status" [(ngModel)]="form.status">
                  @for (value of statusValues; track value) {
                    <option [value]="value">{{ eventStatusLabel(value) }}</option>
                  }
                </select>
              </label>
              <button type="submit" class="member-button" [disabled]="busy()">{{ 'events.manage.details.save' | t }}</button>
            </form>

            @if (sections.data(); as data) {
              <!-- Teilnehmer & Anwesenheit -->
              <h2 class="member-subtitle">{{ 'events.manage.participants.heading' | t: { count: data.participants.length } }}</h2>
              @if (data.participants.length === 0) {
                <p class="member-muted">{{ 'events.manage.participants.empty' | t }}</p>
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
                        {{ 'events.manage.remove' | t }}
                      </button>
                    </li>
                  }
                </ul>
              }
              <form class="manage-form manage-inline" (ngSubmit)="addParticipant()">
                <label class="manage-field">
                  <span>{{ 'events.manage.participants.id' | t }}</span>
                  <input name="participantId" [(ngModel)]="participantForm.userId" required />
                </label>
                <label class="manage-field">
                  <span>{{ 'events.manage.participants.role' | t }}</span>
                  <select name="participantRole" [(ngModel)]="participantForm.role">
                    <option value="participant">{{ 'events.manage.participants.roleParticipant' | t }}</option>
                    <option value="coHost">{{ 'events.manage.participants.roleCoHost' | t }}</option>
                  </select>
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">{{ 'events.manage.participants.add' | t }}</button>
              </form>

              <!-- Eventgetränke -->
              <h2 class="member-subtitle">{{ 'events.manage.drinks.heading' | t: { count: data.drinks.length } }}</h2>
              @if (data.drinks.length === 0) {
                <p class="member-muted">{{ 'events.manage.drinks.empty' | t }}</p>
              } @else {
                <ul class="member-list">
                  @for (drink of data.drinks; track drink.id) {
                    <li class="member-list-item manage-row">
                      <span class="member-list-title">{{ drink.drinkName }}</span>
                      <span class="member-list-meta">
                        {{ formatMoney(drink.price, drink.currency) }}
                        @if (drink.effectiveCostPrice) {
                          · {{ 'events.manage.costPrice' | t: { amount: formatMoney(drink.effectiveCostPrice, drink.currency) } }}
                        }
                      </span>
                      <button
                        type="button"
                        class="member-button member-button-danger"
                        [disabled]="busy()"
                        (click)="removeDrink(drink.id)"
                      >
                        {{ 'events.manage.remove' | t }}
                      </button>
                    </li>
                  }
                </ul>
              }
              <form class="manage-form manage-inline" (ngSubmit)="addDrink()">
                <label class="manage-field">
                  <span>{{ 'events.manage.drinks.id' | t }}</span>
                  <input name="drinkId" [(ngModel)]="drinkForm.drinkId" required />
                </label>
                <label class="manage-field">
                  <span>{{ 'events.manage.priceOptional' | t }}</span>
                  <input name="drinkPrice" [(ngModel)]="drinkForm.price" inputmode="decimal" [placeholder]="'events.manage.fallback' | t" />
                </label>
                <label class="manage-field">
                  <span>{{ 'events.manage.costPriceOptional' | t }}</span>
                  <input name="drinkCostPrice" [(ngModel)]="drinkForm.costPrice" inputmode="decimal" [placeholder]="'events.manage.fallback' | t" />
                </label>
                <label class="manage-field">
                  <span>{{ 'events.manage.currency' | t }}</span>
                  <input name="drinkCurrency" [(ngModel)]="drinkForm.currency" maxlength="3" />
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">{{ 'events.manage.drinks.add' | t }}</button>
              </form>
              <form class="manage-form manage-inline" (ngSubmit)="assignSublist()">
                <label class="manage-field">
                  <span>{{ 'events.manage.drinks.sublistId' | t }}</span>
                  <input name="sublistId" [(ngModel)]="sublistId" required />
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">{{ 'events.manage.drinks.assignSublist' | t }}</button>
              </form>

              <!-- Eventspeisen -->
              <h2 class="member-subtitle">{{ 'events.manage.food.heading' | t: { count: data.food.length } }}</h2>
              @if (data.food.length === 0) {
                <p class="member-muted">{{ 'events.manage.food.empty' | t }}</p>
              } @else {
                <ul class="member-list">
                  @for (item of data.food; track item.id) {
                    <li class="member-list-item manage-row">
                      <span class="member-list-title">{{ item.foodName }}</span>
                      <span class="member-list-meta">
                        {{ formatMoney(item.effectivePrice, item.currency) }}
                        @if (item.price === null) { <small>{{ 'events.manage.food.default' | t }}</small> }
                        · {{ 'events.manage.costPrice' | t: { amount: formatMoney(item.effectiveCostPrice, item.currency) } }}
                        @if (item.costPrice === null) { <small>{{ 'events.manage.food.default' | t }}</small> }
                      </span>
                      <button
                        type="button"
                        class="member-button member-button-danger"
                        [disabled]="busy()"
                        (click)="removeFood(item.id)"
                      >
                        {{ 'events.manage.remove' | t }}
                      </button>
                    </li>
                  }
                </ul>
              }
              <form class="manage-form manage-inline" (ngSubmit)="addFood()">
                <label class="manage-field">
                  <span>{{ 'events.manage.food.id' | t }}</span>
                  <input name="foodId" [(ngModel)]="foodForm.foodId" required />
                </label>
                <label class="manage-field">
                  <span>{{ 'events.manage.priceOptional' | t }}</span>
                  <input name="foodPrice" [(ngModel)]="foodForm.price" inputmode="decimal" [placeholder]="'events.manage.fallback' | t" />
                </label>
                <label class="manage-field">
                  <span>{{ 'events.manage.costPriceOptional' | t }}</span>
                  <input name="foodCostPrice" [(ngModel)]="foodForm.costPrice" inputmode="decimal" [placeholder]="'events.manage.fallback' | t" />
                </label>
                <label class="manage-field">
                  <span>{{ 'events.manage.currency' | t }}</span>
                  <input name="foodCurrency" [(ngModel)]="foodForm.currency" maxlength="3" />
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">{{ 'events.manage.food.add' | t }}</button>
              </form>

              <!-- Einladungen -->
              <h2 class="member-subtitle">{{ 'events.manage.invites.heading' | t: { count: data.invites.length } }}</h2>
              @if (createdInvite(); as created) {
                <div class="state-card manage-invite-token" role="status">
                  <strong>{{ 'events.manage.invites.createdTitle' | t }}</strong>
                  <span>{{ 'events.manage.invites.createdHint' | t }}</span>
                  <code class="manage-token">{{ created.acceptPath }}</code>
                </div>
              }
              @if (data.invites.length === 0) {
                <p class="member-muted">{{ 'events.manage.invites.empty' | t }}</p>
              } @else {
                <ul class="member-list">
                  @for (invite of data.invites; track invite.id) {
                    <li class="member-list-item manage-row">
                      <span class="member-list-title">{{ invite.role }}</span>
                      <span class="member-list-meta">
                        {{ (invite.active ? 'events.manage.invites.active' : 'events.manage.invites.inactive') | t }} · {{ invite.usesCount }}
                        @if (invite.maxUses) { / {{ invite.maxUses }} }
                      </span>
                      <button
                        type="button"
                        class="member-button member-button-danger"
                        [disabled]="busy() || invite.revoked"
                        (click)="revokeInvite(invite.id)"
                      >
                        {{ 'events.manage.invites.revoke' | t }}
                      </button>
                    </li>
                  }
                </ul>
              }
              <form class="manage-form manage-inline" (ngSubmit)="createInvite()">
                <label class="manage-field">
                  <span>{{ 'events.manage.invites.validMinutes' | t }}</span>
                  <input name="expiresInMinutes" [(ngModel)]="inviteForm.expiresInMinutes" inputmode="numeric" />
                </label>
                <label class="manage-field">
                  <span>{{ 'events.manage.invites.maxUses' | t }}</span>
                  <input name="maxUses" [(ngModel)]="inviteForm.maxUses" inputmode="numeric" />
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">{{ 'events.manage.invites.create' | t }}</button>
              </form>

              <!-- Event-Chat -->
              <h2 class="member-subtitle">{{ 'events.manage.chat.heading' | t: { count: data.messages.length } }}</h2>
              @if (data.messages.length === 0) {
                <p class="member-muted">{{ 'events.manage.chat.empty' | t }}</p>
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
                  <span>{{ 'events.manage.chat.message' | t }}</span>
                  <input name="chatMessage" [(ngModel)]="chatMessage" maxlength="4000" required />
                </label>
                <button type="submit" class="member-button" [disabled]="busy()">{{ 'events.manage.chat.send' | t }}</button>
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
  protected drinkForm = { drinkId: '', price: '', costPrice: '', currency: '' };
  protected foodForm = { foodId: '', price: '', costPrice: '', currency: '' };
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

  /** Klartext der Teilnehmerrolle für die Anwesenheits-Chips in der aktiven Sprache. */
  protected participantRoleLabel(role: string): string {
    return translate(
      role === 'coHost' ? 'events.manage.participants.roleCoHost' : 'events.manage.participants.roleParticipant',
    );
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
        food: this.service.listEventFood(this.eventId),
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

  protected saveEvent(): void {
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
          this.actionInfo.set(translate('events.manage.info.detailsSaved'));
          this.header.data.set({ event: updated, profile: this.header.data()!.profile });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.actionError.set(describeApiError(error));
        },
      });
  }

  protected addParticipant(): void {
    const userId = this.participantForm.userId.trim();
    if (!userId) return;
    this.runAction(
      this.service.addParticipant(this.eventId, { userId, role: this.participantForm.role }),
      translate('events.manage.info.participantAdded'),
    );
    this.participantForm = { userId: '', role: 'participant' };
  }

  protected removeParticipant(userId: string): void {
    this.runAction(this.service.removeParticipant(this.eventId, userId), translate('events.manage.info.participantRemoved'));
  }

  protected addDrink(): void {
    const drinkId = this.drinkForm.drinkId.trim();
    if (!drinkId) return;
    const price = this.drinkForm.price.trim();
    const costPrice = this.drinkForm.costPrice.trim();
    const currency = this.drinkForm.currency.trim();
    this.runAction(
      this.service.addDrink(this.eventId, {
        drinkId,
        price: price || undefined,
        costPrice: costPrice || undefined,
        currency: currency || undefined,
      }),
      translate('events.manage.info.drinkAdded'),
    );
    this.drinkForm = { drinkId: '', price: '', costPrice: '', currency: '' };
  }

  protected removeDrink(eventDrinkId: string): void {
    this.runAction(this.service.removeDrink(this.eventId, eventDrinkId), translate('events.manage.info.drinkRemoved'));
  }

  protected addFood(): void {
    const foodId = this.foodForm.foodId.trim();
    if (!foodId) return;
    const price = this.foodForm.price.trim();
    const costPrice = this.foodForm.costPrice.trim();
    const currency = this.foodForm.currency.trim();
    this.runAction(
      this.service.addFood(this.eventId, {
        foodId,
        price: price || undefined,
        costPrice: costPrice || undefined,
        currency: currency || undefined,
      }),
      translate('events.manage.info.foodAdded'),
    );
    this.foodForm = { foodId: '', price: '', costPrice: '', currency: '' };
  }

  protected removeFood(eventFoodId: string): void {
    this.runAction(this.service.removeFood(this.eventId, eventFoodId), translate('events.manage.info.foodRemoved'));
  }

  protected assignSublist(): void {
    const sublistId = this.sublistId.trim();
    if (!sublistId) return;
    this.runAction(this.service.assignSublist(this.eventId, { sublistId }), translate('events.manage.info.sublistAssigned'));
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
          this.actionInfo.set(translate('events.manage.info.inviteCreated'));
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
    this.runAction(this.service.revokeInvite(this.eventId, inviteId), translate('events.manage.info.inviteRevoked'));
  }

  protected sendMessage(): void {
    const message = this.chatMessage.trim();
    if (!message) return;
    this.runAction(this.service.sendMessage(this.eventId, { message }), translate('events.manage.info.messageSent'));
    this.chatMessage = '';
  }
}
