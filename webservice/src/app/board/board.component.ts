import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { AsyncState } from '../member/async-state';
import { eventStatusLabel, formatDateTime } from '../member/member-format';
import { auditTargetLabel } from './board-format';
import { BoardApiService } from './board-api.service';
import type { AuditLogEntry, EventStatus, EventSummary } from '../api/api.types';
import {
  InfoPanelComponent,
  StatCardComponent,
  StatusBadgeComponent,
  type StatusTone,
} from '../ui';

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
  imports: [RouterLink, InfoPanelComponent, StatCardComponent, StatusBadgeComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="board-title">
        <span class="eyebrow">Vorstand</span>
        <h1 id="board-title">Eber-Führungsstab</h1>
        <p>Moderation, Finanzübersichten und vorbereitete Mitteilungen.</p>

        <vereint-info-panel icon="🛡" title="Vorstandsbereich">
          Verwalte hier die Bierkasse, versende wichtige Ankündigungen oder plane
          die nächsten Stammtisch-Sitzungen.
        </vereint-info-panel>

        <h2 class="member-subtitle">Rollenspezifische Verwaltung</h2>
        <nav class="board-panels" aria-label="Vorstandsbereiche">
          <a class="board-panel" routerLink="/board/treasury">
            <span class="board-panel-icon" aria-hidden="true">💰</span>
            <span class="board-panel-title">Kassenwart · Kasse &amp; Finanzen</span>
            <span class="board-panel-desc">Bierkasse, Guthaben und Buchungen</span>
          </a>
          <a class="board-panel" routerLink="/board/communications">
            <span class="board-panel-icon" aria-hidden="true">✉️</span>
            <span class="board-panel-title">Schriftwart · Kommunikation</span>
            <span class="board-panel-desc">Ankündigungen und Pinnwand</span>
          </a>
        </nav>

        @if (load.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Events und Protokoll werden abgerufen.</span>
          </div>
        } @else if (load.isError()) {
          <div class="state-card state-error" role="alert">
            <strong>Vorstandsbereich nicht verfügbar</strong>
            <span>{{ load.errorMessage() }}</span>
            <button type="button" class="member-button" (click)="reload()">Erneut versuchen</button>
          </div>
        } @else if (load.data(); as view) {
          <div class="board-stats">
            <vereint-stat-card icon="📅" label="Sichtbare Events" [value]="view.events.length" />
            <vereint-stat-card icon="🧾" label="Letzte Aktionen" [value]="view.audit.length" />
          </div>

          <h2 class="member-subtitle">Gastgeber · Events ({{ view.events.length }})</h2>
          @if (view.events.length === 0) {
            <div class="state-card" role="status">
              <strong>Keine Events</strong>
              <span>Aktuell sind keine Events zur Moderation sichtbar.</span>
            </div>
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
                  <a class="member-button" [routerLink]="['/events', event.id, 'manage']">Moderieren</a>
                </li>
              }
            </ul>
          }

          <h2 class="member-subtitle">Letzte Aktionen ({{ view.audit.length }})</h2>
          @if (view.audit.length === 0) {
            <div class="state-card" role="status">
              <strong>Keine Einträge</strong>
              <span>Für die erlaubten Bereiche liegen keine Protokolleinträge vor.</span>
            </div>
          } @else {
            <ul class="member-list">
              @for (entry of view.audit; track entry.id) {
                <li class="member-list-item">
                  <span class="member-list-title">
                    {{ auditTargetLabel(entry.targetEntity) }} · {{ entry.action }}
                  </span>
                  @if (entry.details) {
                    <span class="member-chat-text">{{ entry.details }}</span>
                  }
                  <span class="member-list-meta">
                    {{ entry.actorDisplayName ?? 'System' }} · {{ formatDateTime(entry.createdAt) }}
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
  protected readonly eventStatusLabel = eventStatusLabel;
  protected readonly formatDateTime = formatDateTime;
  protected readonly auditTargetLabel = auditTargetLabel;

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
