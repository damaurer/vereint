import {
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../api/api-client.service';
import type {
  EventSummary,
  MomentDetailDto,
  MomentSessionDto,
  MomentSummaryDto,
  StartMomentRequest,
  SubmitMomentResponseRequest,
} from '../api/api.types';
import { AsyncState } from '../member/async-state';
import { MemberApiService } from '../member/member-api.service';
import { formatDateTime } from '../member/member-format';
import { ModalComponent } from '../ui';
import { MomentMapComponent } from './moment-map.component';
import { MomentTimelineComponent } from './moment-timeline.component';
import { StateComponent } from '../ui/state.component';

export interface TopicOption {
  value: string;
  label: string;
  emoji: string;
  description: string;
}

export interface QuickReaction {
  value: string;
  label: string;
  emoji: string;
}

/**
 * Gemeinschaftsmomente & Rituale (Moments) Screen (TICKET-036).
 *
 * Ermöglicht gemeinsame Aktionen (Anstoßen, Gebete, Jubeln, Spontane Check-ins),
 * chronologische Multi-Status-Feeds, interaktive GeoJSON-Karten, Verknüpfung
 * zum 24-Stunden-Event-Chat und automatisches Kalender-Archiv.
 */
@Component({
  selector: 'app-moments',
  imports: [StateComponent, 
    IconComponent,
    FormsModule,
    RouterLink,
    ModalComponent,
    MomentTimelineComponent,
    MomentMapComponent,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card moments-card" aria-labelledby="moments-title">
        <!-- Kopfbereich -->
        <header class="moments-header">
          <div>
            <span class="eyebrow">Gemeinschaftsmomente & Rituale</span>
            <h1 id="moments-title">Moments</h1>
          </div>
          <div class="header-actions">
            @if (eventId()) {
              <a class="member-back" [routerLink]="['/events', eventId()]">← Zum Event</a>
            } @else {
              <a class="member-back" routerLink="/events">← Alle Events</a>
            }
          </div>
        </header>

        <!-- Event-Auswahl (wenn nicht direkt über Event-Route geöffnet) -->
        @if (!routeEventId()) {
          <div class="event-picker-section">
            <label for="event-select" class="picker-label">Aktives Event auswählen:</label>
            <select
              id="event-select"
              class="member-select"
              [ngModel]="selectedEventId()"
              (ngModelChange)="onSelectEvent($event)"
            >
              <option value="" disabled>-- Bitte Event wählen --</option>
              @for (ev of events(); track ev.id) {
                <option [value]="ev.id">{{ ev.title }} ({{ formatEventDate(ev.startsAt) }})</option>
              }
            </select>
          </div>
        }

        <!-- Push-Notification Banner / Schnell-Beitreten -->
        @if (pushJoinBanner(); as banner) {
          <div class="push-alert-banner" role="alert">
            <div class="push-alert-body">
              <vereint-icon class="push-alert-icon" name="bell" />
              <div>
                <strong>Neuer Moment gestartet: „{{ banner.title }}“</strong>
                <p>Möchtest du beitreten und eine Reaktion oder einen Status teilen?</p>
              </div>
            </div>
            <div class="push-alert-actions">
              <button
                type="button"
                class="member-button btn-sm"
                (click)="openRespondModal(banner.id)"
              >
                Jetzt Beitreten
              </button>
              <button
                type="button"
                class="member-button btn-subtle btn-sm"
                (click)="dismissPushBanner()"
              >
                Ausblenden
              </button>
            </div>
          </div>
        }

        <!-- Status / Fehler / Ladezustand -->
        @if (isBusy()) {
          <vereint-state
            kind="loading"
            title="Wird geladen …"
            message="Moments und Ritual-Feeds werden abgerufen."
          />
        } @else if (loadError()) {
          <vereint-state
            kind="error"
            title="Nicht verfügbar"
            [message]="loadError()"
            (retry)="reload()"
          />
        } @else if (eventId()) {
          <!-- Hauptaktionsbereich -->
          <div class="action-bar">
            <button
              type="button"
              class="member-button btn-primary"
              (click)="openStartModal()"
            >
              + Neuen Moment starten
            </button>

            @if (activeSessions().length > 0) {
              <div class="active-count-badge">
                <span class="pulse-dot"></span>
                <span>{{ activeSessions().length }} aktiver Moment</span>
              </div>
            }
          </div>

          <!-- Aktive Moments Liste -->
          @if (activeSessions().length === 0) {
            <div class="empty-moments-card">
              <vereint-icon class="empty-icon" name="moments" />
              <h3>Kein aktiver Moment</h3>
              <p>
                Aktuell läuft kein Ritual oder Gemeinschaftsmoment für dieses Event.
                Starte jetzt ein gemeinsames Anstoßen, ein Gebet oder einen Fan-Jubel!
              </p>
              <button
                type="button"
                class="member-button"
                (click)="openStartModal()"
              >
                Moment initiieren
              </button>
            </div>
          } @else {
            <div class="sessions-grid">
              @for (session of activeSessions(); track session.id) {
                <article
                  class="session-card"
                  [class.is-selected]="selectedSessionId() === session.id"
                  (click)="selectSession(session.id)"
                >
                  <div class="session-card-header">
                    <span class="topic-chip" [attr.data-topic]="session.topicType">
                      {{ getTopicLabel(session.topicType) }}
                    </span>
                    <span class="session-time-remaining">
                      {{ formatRemainingTime(session.expiresAt) }}
                    </span>
                  </div>

                  <h3 class="session-title">{{ session.title }}</h3>

                  @if (session.message) {
                    <p class="session-message">„{{ session.message }}“</p>
                  }

                  <div class="session-meta">
                    <span class="session-creator">Von {{ session.creatorName }}</span>
                    <span class="session-responses-count">
                      <vereint-icon name="chat" /> {{ session.responsesCount }} Antworten
                    </span>
                  </div>

                  <div class="session-card-actions" (click)="$event.stopPropagation()">
                    <button
                      type="button"
                      class="member-button btn-sm"
                      (click)="openRespondModal(session.id)"
                    >
                      + Reagieren
                    </button>

                    @if (session.conversationId) {
                      <a
                        class="member-button btn-sm btn-subtle"
                        [routerLink]="['/chat']"
                        [queryParams]="{ conversationId: session.conversationId }"
                      >
                        <vereint-icon name="chat" /> 24h-Chat
                      </a>
                    }

                    <button
                      type="button"
                      class="member-button btn-sm btn-subtle"
                      (click)="completeMoment(session.id)"
                      title="Moment abschließen und im Event-Verlauf archivieren"
                    >
                      Abschließen
                    </button>
                  </div>
                </article>
              }
            </div>
          }

          <!-- Detailbereich des ausgewählten Moments -->
          @if (selectedDetail(); as detail) {
            <section class="selected-detail-section" aria-labelledby="detail-title">
              <div class="detail-header">
                <div>
                  <span class="eyebrow">Ausgewählter Moment</span>
                  <h2 id="detail-title">{{ detail.session.title }}</h2>
                </div>

                <!-- Tabs für Ansicht -->
                <div class="view-toggles" role="tablist">
                  <button
                    type="button"
                    class="toggle-btn"
                    [class.is-active]="activeTab() === 'timeline'"
                    (click)="activeTab.set('timeline')"
                    role="tab"
                    [attr.aria-selected]="activeTab() === 'timeline'"
                  >
                    Timeline ({{ detail.responses.length }})
                  </button>
                  <button
                    type="button"
                    class="toggle-btn"
                    [class.is-active]="activeTab() === 'map'"
                    (click)="activeTab.set('map')"
                    role="tab"
                    [attr.aria-selected]="activeTab() === 'map'"
                  >
                    Weltkarte ({{ detail.mapGeoJson.features.length }})
                  </button>
                </div>
              </div>

              <!-- Schnelle Reaktionsleiste -->
              <div class="quick-reaction-bar">
                <span class="quick-label">Schnell reagieren:</span>
                <div class="quick-buttons">
                  @for (q of quickReactions; track q.value) {
                    <button
                      type="button"
                      class="quick-btn"
                      (click)="submitQuickReaction(detail.session.id, q.value)"
                      [title]="q.label"
                    >
                      {{ q.emoji }} {{ q.label }}
                    </button>
                  }
                  <button
                    type="button"
                    class="quick-btn btn-custom"
                    (click)="openRespondModal(detail.session.id)"
                  >
                    + Status & Text
                  </button>
                </div>
              </div>

              <!-- Ansichten: Timeline oder Map -->
              @if (activeTab() === 'timeline') {
                <app-moment-timeline [responses]="detail.responses" />
              } @else {
                <app-moment-map
                  [mapData]="detail.mapGeoJson"
                  [sessionTitle]="detail.session.title"
                />
              }
            </section>
          }

          <!-- Historie / Abgeschlossene Moments -->
          @if (history().length > 0) {
            <section class="history-section" aria-labelledby="history-title">
              <h3 id="history-title" class="history-heading">Archivierte Moments & Rituale</h3>
              <ul class="history-list">
                @for (item of history(); track item.momentId) {
                  <li class="history-item">
                    <div class="history-item-top">
                      <span class="topic-chip" [attr.data-topic]="item.topicType">
                        {{ getTopicLabel(item.topicType) }}
                      </span>
                      <strong class="history-item-title">{{ item.title }}</strong>
                      <time class="history-time">{{ formatTime(item.completedAt) }}</time>
                    </div>
                    <p class="history-summary">{{ item.summary }}</p>
                    <div class="history-stats">
                      <span><vereint-icon name="users" /> {{ item.uniqueParticipants }} Teilnehmer</span>
                      <span><vereint-icon name="chat" /> {{ item.totalResponses }} Beiträge</span>
                    </div>
                  </li>
                }
              </ul>
            </section>
          }
        }
      </section>

      <!-- Modal: Neuen Moment starten -->
      <vereint-modal
        [open]="startModalOpen()"
        title="Neuen Moment initiieren"
        (close)="closeStartModal()"
      >
        <form class="member-form" (ngSubmit)="submitStartMoment()">
          <div class="form-group">
            <label for="moment-title-input" class="form-label">Titel des Rituals / Moments *</label>
            <input
              id="moment-title-input"
              type="text"
              class="member-input"
              [(ngModel)]="newTitle"
              name="title"
              placeholder="z. B. Gemeinsames Anstoßen, Abendgebet, Jubelwelle"
              required
              maxlength="255"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Thema / Ritualtyp *</label>
            <div class="topic-grid">
              @for (opt of topicOptions; track opt.value) {
                <label
                  class="topic-option"
                  [class.is-selected]="newTopicType === opt.value"
                >
                  <input
                    type="radio"
                    name="topicType"
                    [value]="opt.value"
                    [(ngModel)]="newTopicType"
                  />
                  <span class="topic-option-emoji">{{ opt.emoji }}</span>
                  <span class="topic-option-info">
                    <strong>{{ opt.label }}</strong>
                    <small>{{ opt.description }}</small>
                  </span>
                </label>
              }
            </div>
          </div>

          <div class="form-group">
            <label for="moment-message-input" class="form-label">Nachricht / Impuls (optional)</label>
            <textarea
              id="moment-message-input"
              class="member-textarea"
              [(ngModel)]="newMessage"
              name="message"
              placeholder="z. B. Ein Hoch auf unseren Verein! Wer stößt aus der Ferne mit an?"
              maxlength="500"
              rows="3"
            ></textarea>
          </div>

          <div class="form-group">
            <label for="moment-duration-select" class="form-label">Dauer des Moments</label>
            <select
              id="moment-duration-select"
              class="member-select"
              [(ngModel)]="newDurationMinutes"
              name="durationMinutes"
            >
              <option [ngValue]="15">15 Minuten (Kurzer Impuls)</option>
              <option [ngValue]="30">30 Minuten</option>
              <option [ngValue]="60">1 Stunde (Standard)</option>
              <option [ngValue]="120">2 Stunden</option>
              <option [ngValue]="1440">24 Stunden (Tagesritual)</option>
            </select>
          </div>

          <div class="form-group consent-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                [(ngModel)]="newConsent"
                name="consent"
                (change)="onConsentToggle($event)"
              />
              <span><vereint-icon name="location" /> Meinen Standort für die Weltkarte freigeben (DSGVO Opt-in)</span>
            </label>
            @if (geoStatus()) {
              <small class="geo-status-text">{{ geoStatus() }}</small>
            }
          </div>

          @if (formError()) {
            <p class="form-error-msg" role="alert">{{ formError() }}</p>
          }

          <div class="modal-buttons">
            <button
              type="button"
              class="member-button btn-subtle"
              (click)="closeStartModal()"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              class="member-button btn-primary"
              [disabled]="submittingForm() || !newTitle.trim()"
            >
              {{ submittingForm() ? 'Wird gestartet …' : 'Moment jetzt starten' }}
            </button>
          </div>
        </form>
      </vereint-modal>

      <!-- Modal: Statusbeitrag / Reaktion einreichen -->
      <vereint-modal
        [open]="respondModalOpen()"
        title="Status & Reaktion teilen"
        (close)="closeRespondModal()"
      >
        <form class="member-form" (ngSubmit)="submitResponseForm()">
          <div class="form-group">
            <label class="form-label">Reaktion auswählen *</label>
            <div class="reaction-picker-grid">
              @for (q of quickReactions; track q.value) {
                <button
                  type="button"
                  class="reaction-choice-btn"
                  [class.is-selected]="respondReaction === q.value"
                  (click)="respondReaction = q.value"
                >
                  <span class="reaction-emoji">{{ q.emoji }}</span>
                  <span class="reaction-name">{{ q.label }}</span>
                </button>
              }
            </div>
          </div>

          <div class="form-group">
            <label for="status-text-input" class="form-label">Persönlicher Status (optional)</label>
            <input
              id="status-text-input"
              type="text"
              class="member-input"
              [(ngModel)]="respondStatusText"
              name="statusText"
              placeholder="z. B. Schöne Grüße aus Hamburg! 🍺"
              maxlength="255"
            />
          </div>

          <div class="form-group consent-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                [(ngModel)]="respondConsent"
                name="respondConsent"
                (change)="onRespondConsentToggle($event)"
              />
              <span><vereint-icon name="location" /> Aktuellen Standort für diesen Beitrag auf der Weltkarte teilen</span>
            </label>
            @if (respondGeoStatus()) {
              <small class="geo-status-text">{{ respondGeoStatus() }}</small>
            }
          </div>

          @if (respondError()) {
            <p class="form-error-msg" role="alert">{{ respondError() }}</p>
          }

          <div class="modal-buttons">
            <button
              type="button"
              class="member-button btn-subtle"
              (click)="closeRespondModal()"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              class="member-button btn-primary"
              [disabled]="submittingResponse() || !respondReaction"
            >
              {{ submittingResponse() ? 'Wird gesendet …' : 'Beitrag absenden' }}
            </button>
          </div>
        </form>
      </vereint-modal>
    </main>
  `,
  styles: [
    `
      .moments-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .moments-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .event-picker-section {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.75rem;
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .picker-label {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text-muted);
      }
      .push-alert-banner {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border-radius: var(--radius-md);
        background-color: var(--color-brand-soft);
        border: 1px solid var(--color-brand);
      }
      .push-alert-body {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .push-alert-icon {
        font-size: 1.5rem;
      }
      .push-alert-body strong {
        display: block;
        color: var(--color-text);
        font-size: 0.95rem;
      }
      .push-alert-body p {
        margin: 0.15rem 0 0;
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }
      .push-alert-actions {
        display: flex;
        gap: 0.5rem;
      }
      .action-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .active-count-badge {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-brand-strong);
      }
      .pulse-dot {
        width: 0.65rem;
        height: 0.65rem;
        border-radius: 50%;
        background-color: #22c55e;
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
        animation: pulse-ring 1.8s infinite;
      }
      @keyframes pulse-ring {
        0% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
        }
        70% {
          transform: scale(1);
          box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
        }
        100% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
        }
      }
      .empty-moments-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 1.5rem;
        text-align: center;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px dashed var(--color-border);
        gap: 0.75rem;
      }
      .empty-icon {
        font-size: 3rem;
      }
      .empty-moments-card h3 {
        margin: 0;
        font-size: 1.2rem;
        color: var(--color-text);
      }
      .empty-moments-card p {
        margin: 0;
        max-width: 28rem;
        font-size: 0.9rem;
      }
      .sessions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
        gap: 1rem;
      }
      .session-card {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding: 1rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
        cursor: pointer;
        transition: border-color 0.2s ease, transform 0.15s ease;
      }
      .session-card:hover {
        border-color: var(--color-brand);
        transform: translateY(-2px);
      }
      .session-card.is-selected {
        border-color: var(--color-brand-strong);
        background-color: rgba(242, 182, 0, 0.05);
      }
      .session-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .topic-chip {
        display: inline-flex;
        align-items: center;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 700;
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
        border: 1px solid var(--color-brand);
      }
      .topic-chip[data-topic='toast'] {
        background-color: #3b2a08;
        color: #f2b600;
      }
      .topic-chip[data-topic='prayer'] {
        background-color: #1a2936;
        color: #60a5fa;
        border-color: #3b82f6;
      }
      .topic-chip[data-topic='cheer'] {
        background-color: #2b1d3a;
        color: #c084fc;
        border-color: #a855f7;
      }
      .topic-chip[data-topic='checkin'] {
        background-color: #123326;
        color: #4ade80;
        border-color: #22c55e;
      }
      .session-time-remaining {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .session-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .session-message {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-muted);
        font-style: italic;
      }
      .session-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.8rem;
        color: var(--color-text-muted);
        margin-top: auto;
      }
      .session-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid var(--color-border);
      }
      .selected-detail-section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.25rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
        border: 1px solid var(--color-border);
      }
      .detail-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1rem;
      }
      .detail-header h2 {
        margin: 0.2rem 0 0;
        font-size: 1.3rem;
      }
      .view-toggles {
        display: flex;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
        padding: 0.2rem;
        gap: 0.2rem;
      }
      .toggle-btn {
        border: none;
        background: transparent;
        color: var(--color-text-muted);
        padding: 0.4rem 0.8rem;
        font-size: 0.85rem;
        font-weight: 600;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .toggle-btn.is-active {
        background-color: var(--color-brand);
        color: #1a1206;
      }
      .quick-reaction-bar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0.75rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
      }
      .quick-label {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .quick-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .quick-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface);
        color: var(--color-text);
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .quick-btn:hover {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
        color: var(--color-brand-strong);
      }
      .btn-custom {
        border-style: dashed;
      }
      .history-section {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border);
      }
      .history-heading {
        margin: 0;
        font-size: 1.1rem;
        color: var(--color-text);
      }
      .history-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .history-item {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.75rem 1rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
      }
      .history-item-top {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .history-item-title {
        color: var(--color-text);
        font-size: 0.95rem;
      }
      .history-time {
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--color-text-muted);
      }
      .history-summary {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text);
      }
      .history-stats {
        display: flex;
        gap: 1rem;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .topic-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.5rem;
      }
      @media (min-width: 500px) {
        topic-grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      .topic-option {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 0.8rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        cursor: pointer;
        transition: border-color 0.2s ease;
      }
      .topic-option input {
        display: none;
      }
      .topic-option.is-selected {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
      }
      .topic-option-emoji {
        font-size: 1.5rem;
      }
      .topic-option-info {
        display: flex;
        flex-direction: column;
      }
      .topic-option-info strong {
        font-size: 0.85rem;
        color: var(--color-text);
      }
      .topic-option-info small {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .reaction-picker-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5rem;
      }
      .reaction-choice-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        padding: 0.75rem 0.5rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: var(--color-text);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .reaction-choice-btn:hover,
      .reaction-choice-btn.is-selected {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
      }
      .reaction-emoji {
        font-size: 1.6rem;
      }
      .reaction-name {
        font-size: 0.75rem;
        font-weight: 600;
      }
      .consent-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: var(--color-text);
        cursor: pointer;
      }
      .geo-status-text {
        color: var(--color-brand);
        font-size: 0.75rem;
        margin-left: 1.5rem;
      }
      .form-error-msg {
        color: #ef4444;
        font-size: 0.85rem;
        margin: 0;
      }
      .modal-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
      }
      .btn-sm {
        padding: 0.35rem 0.75rem;
        font-size: 0.8rem;
      }
      .btn-primary {
        background-color: var(--color-brand);
        color: #1a1206;
      }
      .btn-subtle {
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
        color: var(--color-text);
      }
    `,
  ],
})
export class MomentsComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly topicOptions: TopicOption[] = [
    { value: 'toast', label: 'Gemeinsames Anstoßen', emoji: '🍻', description: 'Für Stammtische & Feste' },
    { value: 'prayer', label: 'Gebet & Fürbitte', emoji: '🙏', description: 'Für Kirchen- & Glaubensgemeinschaften' },
    { value: 'cheer', label: 'Jubeln & Anfeuern', emoji: '📣', description: 'Für Sport- & Fan-Clubs' },
    { value: 'checkin', label: 'Spontaner Check-in', emoji: '📍', description: 'Präsenz & Standort teilen' },
    { value: 'other', label: 'Sonstiger Impuls', emoji: '✨', description: 'Freie Gemeinschaftsaktion' },
  ];

  protected readonly quickReactions: QuickReaction[] = [
    { value: 'TOAST', label: 'Anstoßen', emoji: '🍻' },
    { value: 'PRAYER', label: 'Gebet', emoji: '🙏' },
    { value: 'CHEER', label: 'Jubel', emoji: '📣' },
    { value: 'THUMBS_UP', label: 'Daumen hoch', emoji: '👍' },
    { value: 'CELEBRATE', label: 'Feiern', emoji: '🎉' },
    { value: 'HEART', label: 'Herz', emoji: '❤️' },
  ];

  // Async States
  protected readonly loadEventsState = new AsyncState<EventSummary[]>();
  protected readonly loadSessionsState = new AsyncState<MomentSessionDto[]>();
  protected readonly loadDetailState = new AsyncState<MomentDetailDto>();
  protected readonly loadHistoryState = new AsyncState<MomentSummaryDto[]>();

  // Signals
  protected readonly events = signal<EventSummary[]>([]);
  protected readonly routeEventId = signal<string | null>(null);
  protected readonly selectedEventId = signal<string | null>(null);
  protected readonly activeSessions = signal<MomentSessionDto[]>([]);
  protected readonly selectedSessionId = signal<string | null>(null);
  protected readonly selectedDetail = signal<MomentDetailDto | null>(null);
  protected readonly history = signal<MomentSummaryDto[]>([]);
  protected readonly activeTab = signal<'timeline' | 'map'>('timeline');

  // Push alert banner
  protected readonly pushJoinBanner = signal<{ id: string; title: string } | null>(null);

  // Modals & Form Signals
  protected readonly startModalOpen = signal(false);
  protected readonly submittingForm = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected newTitle = '';
  protected newTopicType = 'toast';
  protected newMessage = '';
  protected newDurationMinutes = 60;
  protected newConsent = false;
  protected newLatitude: number | null = null;
  protected newLongitude: number | null = null;
  protected readonly geoStatus = signal<string | null>(null);

  protected readonly respondModalOpen = signal(false);
  protected readonly respondingSessionId = signal<string | null>(null);
  protected readonly submittingResponse = signal(false);
  protected readonly respondError = signal<string | null>(null);
  protected respondReaction = 'TOAST';
  protected respondStatusText = '';
  protected respondConsent = false;
  protected respondLatitude: number | null = null;
  protected respondLongitude: number | null = null;
  protected readonly respondGeoStatus = signal<string | null>(null);

  // Computed Event ID
  readonly eventId = computed(() => this.routeEventId() || this.selectedEventId());

  // Busy & Error
  readonly isBusy = computed(
    () =>
      this.loadEventsState.isLoading() ||
      this.loadSessionsState.isLoading() ||
      this.loadDetailState.isLoading(),
  );

  readonly loadError = computed(() => {
    const err =
      this.loadSessionsState.errorMessage() ||
      this.loadEventsState.errorMessage() ||
      this.loadDetailState.errorMessage();
    return err || null;
  });

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Route Parameter prüfen (z.B. /events/:eventId/moments)
    const paramEventId = this.route.snapshot.paramMap.get('eventId');
    if (paramEventId) {
      this.routeEventId.set(paramEventId);
      this.loadEventMoments(paramEventId);
    } else {
      // Wenn ohne EventId aufgerufen, lade alle Events des Nutzers
      this.loadEvents();
    }

    // Query-Parameter prüfen (z.B. ?momentId=... von Push-Benachrichtigungen)
    const qMomentId = this.route.snapshot.queryParamMap.get('momentId');
    if (qMomentId) {
      this.selectedSessionId.set(qMomentId);
    }
  }

  ngOnDestroy(): void {
    this.loadEventsState.destroy();
    this.loadSessionsState.destroy();
    this.loadDetailState.destroy();
    this.loadHistoryState.destroy();
  }

  protected reload(): void {
    const id = this.eventId();
    if (id) {
      this.loadEventMoments(id);
    } else {
      this.loadEvents();
    }
  }

  private loadEvents(): void {
    this.loadEventsState.run(this.api.listEvents(), (eventsList) => {
      this.events.set(eventsList);
      if (eventsList.length > 0 && !this.selectedEventId()) {
        const first = eventsList[0].id;
        this.selectedEventId.set(first);
        this.loadEventMoments(first);
      }
    });
  }

  protected onSelectEvent(eventId: string): void {
    this.selectedEventId.set(eventId);
    this.loadEventMoments(eventId);
  }

  private loadEventMoments(eventId: string): void {
    this.loadSessionsState.run(this.api.listMoments(eventId), (sessions) => {
      this.activeSessions.set(sessions);

      // Check for deep-linked push moment
      const targetMomentId = this.selectedSessionId() || this.route.snapshot.queryParamMap.get('momentId');
      if (targetMomentId) {
        const found = sessions.find((s) => s.id === targetMomentId);
        if (found) {
          this.pushJoinBanner.set({ id: found.id, title: found.title });
          this.selectSession(found.id);
        } else if (sessions.length > 0) {
          this.selectSession(sessions[0].id);
        }
      } else if (sessions.length > 0) {
        this.selectSession(sessions[0].id);
      } else {
        this.selectedDetail.set(null);
      }

      // Lade auch Historie
      this.loadHistory(eventId);
    });
  }

  private loadHistory(eventId: string): void {
    this.loadHistoryState.run(this.api.listMomentHistory(eventId), (hist) => {
      this.history.set(hist);
    });
  }

  protected selectSession(sessionId: string): void {
    const eId = this.eventId();
    if (!eId) return;

    this.selectedSessionId.set(sessionId);
    this.loadDetailState.run(this.api.getMomentDetail(eId, sessionId), (detail) => {
      this.selectedDetail.set(detail);
    });
  }

  protected dismissPushBanner(): void {
    this.pushJoinBanner.set(null);
  }

  // --- Start Moment Modal & Geolocation ---
  protected openStartModal(): void {
    this.newTitle = '';
    this.newTopicType = 'toast';
    this.newMessage = '';
    this.newDurationMinutes = 60;
    this.newConsent = false;
    this.newLatitude = null;
    this.newLongitude = null;
    this.geoStatus.set(null);
    this.formError.set(null);
    this.startModalOpen.set(true);
  }

  protected closeStartModal(): void {
    this.startModalOpen.set(false);
  }

  protected onConsentToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.newConsent = checked;
    if (checked && isPlatformBrowser(this.platformId) && navigator.geolocation) {
      this.geoStatus.set('Ermittle GPS-Standort …');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.newLatitude = pos.coords.latitude;
          this.newLongitude = pos.coords.longitude;
          this.geoStatus.set(
            `Standort erfasst: ${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
          );
        },
        () => {
          this.geoStatus.set('Standortermittlung fehlgeschlagen oder im Browser verweigert.');
          this.newLatitude = null;
          this.newLongitude = null;
        },
      );
    } else {
      this.newLatitude = null;
      this.newLongitude = null;
      this.geoStatus.set(null);
    }
  }

  protected submitStartMoment(): void {
    const eId = this.eventId();
    if (!eId || !this.newTitle.trim()) return;

    this.submittingForm.set(true);
    this.formError.set(null);

    const payload: StartMomentRequest = {
      title: this.newTitle.trim(),
      topicType: this.newTopicType,
      message: this.newMessage.trim() || undefined,
      durationMinutes: this.newDurationMinutes,
      consent: this.newConsent,
      latitude: this.newLatitude ?? undefined,
      longitude: this.newLongitude ?? undefined,
    };

    this.api.startMoment(eId, payload).subscribe({
      next: (session) => {
        this.submittingForm.set(false);
        this.closeStartModal();
        this.loadEventMoments(eId);
        this.selectSession(session.id);
      },
      error: (err: unknown) => {
        this.submittingForm.set(false);
        if (err instanceof ApiError) {
          this.formError.set(err.message || 'Fehler beim Starten des Moments.');
        } else {
          this.formError.set('Moment konnte nicht gestartet werden.');
        }
      },
    });
  }

  // --- Respond Modal & Quick Reactions ---
  protected openRespondModal(sessionId: string): void {
    this.respondingSessionId.set(sessionId);
    this.respondReaction = 'TOAST';
    this.respondStatusText = '';
    this.respondConsent = false;
    this.respondLatitude = null;
    this.respondLongitude = null;
    this.respondGeoStatus.set(null);
    this.respondError.set(null);
    this.respondModalOpen.set(true);
  }

  protected closeRespondModal(): void {
    this.respondModalOpen.set(false);
  }

  protected onRespondConsentToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.respondConsent = checked;
    if (checked && isPlatformBrowser(this.platformId) && navigator.geolocation) {
      this.respondGeoStatus.set('Ermittle GPS-Standort …');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.respondLatitude = pos.coords.latitude;
          this.respondLongitude = pos.coords.longitude;
          this.respondGeoStatus.set(
            `Standort erfasst: ${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
          );
        },
        () => {
          this.respondGeoStatus.set('Standortermittlung fehlgeschlagen.');
          this.respondLatitude = null;
          this.respondLongitude = null;
        },
      );
    } else {
      this.respondLatitude = null;
      this.respondLongitude = null;
      this.respondGeoStatus.set(null);
    }
  }

  protected submitResponseForm(): void {
    const eId = this.eventId();
    const sId = this.respondingSessionId();
    if (!eId || !sId || !this.respondReaction) return;

    this.submittingResponse.set(true);
    this.respondError.set(null);

    const payload: SubmitMomentResponseRequest = {
      reaction: this.respondReaction,
      statusText: this.respondStatusText.trim() || undefined,
      consent: this.respondConsent,
      latitude: this.respondLatitude ?? undefined,
      longitude: this.respondLongitude ?? undefined,
    };

    this.api.submitMomentResponse(eId, sId, payload).subscribe({
      next: () => {
        this.submittingResponse.set(false);
        this.closeRespondModal();
        this.selectSession(sId);
      },
      error: (err: unknown) => {
        this.submittingResponse.set(false);
        if (err instanceof ApiError) {
          this.respondError.set(err.message || 'Fehler beim Absenden.');
        } else {
          this.respondError.set('Status konnte nicht gesendet werden.');
        }
      },
    });
  }

  protected submitQuickReaction(sessionId: string, reaction: string): void {
    const eId = this.eventId();
    if (!eId) return;

    const payload: SubmitMomentResponseRequest = {
      reaction,
      consent: false,
    };

    this.api.submitMomentResponse(eId, sessionId, payload).subscribe({
      next: () => {
        this.selectSession(sessionId);
      },
    });
  }

  protected completeMoment(sessionId: string): void {
    const eId = this.eventId();
    if (!eId) return;

    this.api.completeMoment(eId, sessionId).subscribe({
      next: () => {
        this.loadEventMoments(eId);
      },
    });
  }

  // --- Formatters & Helpers ---
  protected getTopicLabel(topic: string): string {
    const found = this.topicOptions.find((t) => t.value === topic);
    return found ? `${found.emoji} ${found.label}` : topic;
  }

  protected formatTime(iso: string): string {
    return formatDateTime(iso);
  }

  protected formatEventDate(iso: string): string {
    return formatDateTime(iso);
  }

  protected formatRemainingTime(expiresAt: string): string {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Abgelaufen';
    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 60) return `noch ${minutes} Min aktiv`;
    const hours = Math.floor(minutes / 60);
    return `noch ${hours} Std aktiv`;
  }
}
