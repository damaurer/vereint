import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { InviteModalComponent } from '../admin/invite-modal.component';
import { IconComponent } from '../ui/icon.component';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { AsyncState } from '../member/async-state';
import { eventStatusLabel, formatDateTime } from '../member/member-format';
import { auditActionLabel, auditDetails, auditTargetLabel } from './board-format';
import { BoardApiService } from './board-api.service';
import type { AuditLogEntry, EventStatus, EventSummary } from '../api/api.types';
import {
  InfoPanelComponent,
  StatCardComponent,
  StatusBadgeComponent,
  type StatusTone,
} from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';

interface BoardView {
  events: EventSummary[];
  audit: AuditLogEntry[];
}

/**
 * Allgemeine Vorstandsansicht (TICKET-026, Redesign TICKET-037):
 * Moderationsüberblick über sichtbare Events, rollenspezifische Panels mit
 * Schnellzugriff auf Kasse und Kommunikation sowie die letzten privilegierten
 * Aktionen aus dem Audit-Protokoll.
 *
 * Es werden ausschließlich die vom Fachservice freigegebenen Daten angezeigt;
 * die Rollenprüfung (`board`/`admin`) verbessert nur die Navigation und wird von
 * der `AppShell` (TICKET-032) gefiltert. Die verbindliche Autorisierung erfolgt
 * serverseitig (`deny by default`), sodass unberechtigte Aufrufe mit `401`/`403`
 * beantwortet und hier als neutraler Fehlerzustand gerendert werden. Die Ansicht
 * wird nur im Browser gerendert. Die geteilten `ui/`-Primitive sorgen für die
 * gleiche visuelle Sprache wie in den Mitglieder-Ansichten.
 */
@Component({
  selector: 'app-board',
  imports: [StateComponent, IconComponent, RouterLink, InfoPanelComponent, StatCardComponent, StatusBadgeComponent, TranslatePipe, InviteModalComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="board-title">
        <span class="eyebrow">{{ 'board.overview.eyebrow' | t }}</span>
        <h1 id="board-title">{{ 'board.overview.title' | t }}</h1>
        <p>{{ 'board.overview.intro' | t }}</p>

        <vereint-info-panel icon="board" [title]="'board.overview.infoTitle' | t">
          {{ 'board.overview.infoText' | t }}
        </vereint-info-panel>

        <h2 class="member-subtitle">{{ 'board.overview.panelsTitle' | t }}</h2>
        <nav class="board-panels" [attr.aria-label]="'board.overview.panelsNav' | t">
          <a class="board-panel" routerLink="/board/treasury">
            <vereint-icon class="board-panel-icon" name="treasury" />
            <span class="board-panel-title">{{ 'board.overview.treasuryTitle' | t }}</span>
            <span class="board-panel-desc">{{ 'board.overview.treasuryDesc' | t }}</span>
          </a>
          <a class="board-panel" routerLink="/board/communications">
            <vereint-icon class="board-panel-icon" name="megaphone" />
            <span class="board-panel-title">{{ 'board.overview.commsTitle' | t }}</span>
            <span class="board-panel-desc">{{ 'board.overview.commsDesc' | t }}</span>
          </a>
          <button type="button" class="board-panel" (click)="inviteOpen.set(true)">
            <vereint-icon class="board-panel-icon" name="users" />
            <span class="board-panel-title">{{ 'board.overview.inviteTitle' | t }}</span>
            <span class="board-panel-desc">{{ 'board.overview.inviteDesc' | t }}</span>
          </button>
        </nav>
        <app-admin-invite-modal [open]="inviteOpen()" (closed)="inviteOpen.set(false)" />

        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'board.overview.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'board.overview.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as view) {
          <div class="board-stats">
            <vereint-stat-card icon="events" [label]="'board.overview.statEvents' | t" [value]="view.events.length" />
            <vereint-stat-card icon="receipt" [label]="'board.overview.statActions' | t" [value]="view.audit.length" />
          </div>

          <h2 class="member-subtitle">{{ 'board.overview.eventsHeading' | t: { count: view.events.length } }}</h2>
          @if (view.events.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'board.overview.eventsEmptyTitle' | t"
              [message]="'board.overview.eventsEmptyMessage' | t"
            />
          } @else {
            <ul class="member-list">
              @for (event of view.events; track event.id) {
                <li class="member-list-item board-row">
                  <span class="member-list-title">{{ event.title }}</span>
                  <vereint-status-badge
                    [label]="eventStatusLabel(event.status)"
                    [tone]="eventTone(event.status)"
                  />
                  <span class="member-list-meta">{{ formatDateTime(event.startsAt) }}</span>
                  <a class="member-button" [routerLink]="['/events', event.id, 'manage']">{{ 'board.overview.moderate' | t }}</a>
                </li>
              }
            </ul>
          }

          <h2 class="member-subtitle">{{ 'board.overview.auditHeading' | t: { count: view.audit.length } }}</h2>
          @if (view.audit.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'board.audit.emptyTitle' | t"
              [message]="'board.audit.emptyMessage' | t"
            />
          } @else {
            <ul class="member-list">
              @for (entry of view.audit; track entry.id) {
                <li class="member-list-item">
                  <span class="member-list-title">
                    {{ auditTargetLabel(entry.targetEntity) }} · {{ auditActionLabel(entry.action) }}
                  </span>
                  @if (entry.targetName) {
                    <span class="member-list-sub">
                      {{ 'board.auditMember' | t: { name: entry.targetName } }}
                      @if (entry.targetTitle) { · „{{ entry.targetTitle }}“ }
                    </span>
                  }
                  @if (auditDetails(entry.details); as details) {
                    <span class="member-chat-text">{{ details }}</span>
                  }
                  <span class="member-list-meta">
                    {{ entry.actorDisplayName ?? ('board.audit.system' | t) }} · {{ formatDateTime(entry.createdAt) }}
                  </span>
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
      .board-panels {
        display: grid;
        gap: var(--space-2);
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
        margin: 0.75rem 0 1.5rem;
      }
      .board-panel {
        font: inherit;
        text-align: left;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: var(--space-3);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        text-decoration: none;
        color: inherit;
      }
      .board-panel:hover,
      .board-panel:focus-visible {
        border-color: var(--color-brand);
      }
      .board-panel-icon {
        font-size: 1.4rem;
      }
      .board-panel-title {
        font-weight: 700;
        color: var(--color-text);
      }
      .board-panel-desc {
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }
      .board-stats {
        display: grid;
        gap: var(--space-2);
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        margin: 0.5rem 0 1rem;
      }
      .board-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        justify-content: space-between;
      }
      .member-chat-text {
        display: block;
      }
    `,
  ],
})
export class BoardComponent implements OnInit, OnDestroy {
  private readonly api = inject(BoardApiService);

  protected readonly load = new AsyncState<BoardView>();
  protected readonly inviteOpen = signal(false);
  protected readonly eventStatusLabel = eventStatusLabel;
  protected readonly formatDateTime = formatDateTime;
  protected readonly auditTargetLabel = auditTargetLabel;
  protected readonly auditActionLabel = auditActionLabel;
  protected readonly auditDetails = auditDetails;

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

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    // Die Audit-Antwort ist paginiert; für die Übersicht werden die Zeilen abgebildet.
    this.load.run(
      forkJoin({
        events: this.api.listEvents(),
        audit: this.api.listAuditLogs().pipe(map((page) => page.content)),
      }),
    );
  }
}
