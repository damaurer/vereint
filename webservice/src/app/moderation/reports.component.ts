import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import type { ContentReport } from '../api/api.types';
import { describeApiError } from '../api/api-client.service';
import { TranslatePipe } from '../i18n';
import { formatDateTime } from '../member/member-format';
import { StateComponent } from '../ui/state.component';
import { ModerationApiService } from './moderation-api.service';

/** `group`: Meldungen der gewählten Gruppe; `platform`: Meldungen zu Direktnachrichten. */
export type ReportScope = 'group' | 'platform';

/**
 * Meldungen bearbeiten (#153).
 *
 * `/meldungen` zeigt Personen mit `chat.moderate` oder `members.manage` die
 * Meldungen ihrer Gruppe, `/plattform/meldungen` der Anwendungs-Administration
 * die Meldungen zu Direktnachrichten. „Inhalt entfernen“ löscht den gemeldeten
 * Inhalt, „Ohne Folgen schließen“ schließt die Meldung nur.
 */
@Component({
  selector: 'app-reports',
  imports: [RouterLink, TranslatePipe, StateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="reports-title">
        <a class="member-back" [routerLink]="scope === 'platform' ? '/plattform' : '/board'">
          {{ 'moderation.reports.back' | t }}
        </a>
        <span class="eyebrow">{{ 'moderation.reports.eyebrow' | t }}</span>
        <h1 id="reports-title">{{ 'moderation.reports.title.' + scope | t }}</h1>
        <p>{{ 'moderation.reports.intro.' + scope | t }}</p>

        <label class="reports-toggle">
          <input type="checkbox" [checked]="showAll()" (change)="toggleAll()" />
          <span>{{ 'moderation.reports.showResolved' | t }}</span>
        </label>

        @if (error(); as message) {
          <p class="member-hint member-hint-error" role="alert">{{ message }}</p>
        }

        @if (reports(); as list) {
          @if (list.length === 0) {
            <vereint-state kind="empty" [title]="'moderation.reports.empty' | t" />
          } @else {
            <ul class="reports-list">
              @for (report of list; track report.id) {
                <li class="report-card" [class.is-resolved]="report.status === 'resolved'">
                  <div class="report-head">
                    <strong>{{ 'moderation.target.' + report.targetType | t }}</strong>
                    <span class="report-reason">{{
                      'moderation.reason.' + report.reason | t
                    }}</span>
                    <time class="member-hint">{{ format(report.createdAt) }}</time>
                  </div>
                  <p class="member-hint">
                    {{
                      'moderation.reports.byline'
                        | t
                          : {
                              reporter: report.reporterName,
                              author: report.targetUserName ?? ('moderation.reports.unknown' | t),
                            }
                    }}
                  </p>
                  @if (report.excerpt) {
                    <blockquote class="report-excerpt">{{ report.excerpt }}</blockquote>
                  } @else if (!report.contentAvailable) {
                    <p class="member-hint">{{ 'moderation.reports.contentGone' | t }}</p>
                  }
                  @if (report.note) {
                    <p class="report-note">
                      {{ 'moderation.reports.note' | t: { note: report.note } }}
                    </p>
                  }
                  @if (report.status === 'open') {
                    <div class="report-actions">
                      <button
                        type="button"
                        class="member-button member-button-ghost"
                        [disabled]="busy() === report.id"
                        (click)="resolve(report, 'dismissed')"
                      >
                        {{ 'moderation.reports.dismiss' | t }}
                      </button>
                      <button
                        type="button"
                        class="member-button report-remove"
                        [disabled]="busy() === report.id || !report.contentAvailable"
                        (click)="resolve(report, 'removed')"
                      >
                        {{ 'moderation.reports.remove' | t }}
                      </button>
                    </div>
                  } @else {
                    <p class="member-hint">
                      {{
                        'moderation.reports.resolved.' + (report.resolution ?? 'dismissed')
                          | t
                            : { name: report.resolvedByName ?? '', date: format(report.resolvedAt) }
                      }}
                    </p>
                  }
                </li>
              }
            </ul>
          }
        } @else if (!error()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" />
        }
      </section>
    </main>
  `,
  styles: [
    `
      .reports-toggle {
        display: flex;
        gap: var(--space-2);
        align-items: center;
        margin: var(--space-3) 0;
      }
      .reports-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--space-3);
      }
      .report-card {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg, 0.75rem);
        padding: var(--space-3);
        display: grid;
        gap: var(--space-2);
        background: var(--color-surface);
      }
      .report-card.is-resolved {
        opacity: 0.75;
      }
      .report-head {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        align-items: baseline;
      }
      .report-reason {
        font-size: 0.85rem;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        background: var(--color-surface-muted, var(--color-border));
      }
      .report-excerpt {
        margin: 0;
        padding: var(--space-2) var(--space-3);
        border-left: 3px solid var(--color-border);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .report-note {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .report-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        justify-content: flex-end;
      }
      .report-remove {
        background-color: var(--color-danger);
        border-color: var(--color-danger);
      }
    `,
  ],
})
export class ReportsComponent implements OnInit {
  private readonly api = inject(ModerationApiService);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly scope: ReportScope =
    (inject(ActivatedRoute).snapshot.data['scope'] as ReportScope | undefined) ?? 'group';

  protected readonly reports = signal<ContentReport[] | null>(null);
  protected readonly showAll = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) this.load();
  }

  protected toggleAll(): void {
    this.showAll.update((value) => !value);
    this.load();
  }

  protected format(iso: string | null): string {
    return formatDateTime(iso);
  }

  protected resolve(report: ContentReport, resolution: 'removed' | 'dismissed'): void {
    this.busy.set(report.id);
    this.error.set(null);
    const request =
      this.scope === 'platform'
        ? this.api.resolvePlatformReport(report.id, resolution)
        : this.api.resolveGroupReport(report.id, resolution);
    request.subscribe({
      next: () => {
        this.busy.set(null);
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.error.set(describeApiError(error));
      },
    });
  }

  private load(): void {
    const source: Observable<ContentReport[]> =
      this.scope === 'platform'
        ? this.api.platformReports(this.showAll())
        : this.api.groupReports(this.showAll());
    source.subscribe({
      next: (list) => {
        this.error.set(null);
        this.reports.set(list);
      },
      error: (error: unknown) => this.error.set(describeApiError(error)),
    });
  }
}
