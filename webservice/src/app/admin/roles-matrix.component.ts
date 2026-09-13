import { Component, Input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StatCardComponent } from '../ui';

/** Präsentations-Rollen der Berechtigungsmatrix (Reihenfolge = Spalten). */
const MATRIX_ROLES = [
  { key: 'admin', label: 'Admin', icon: '👑' },
  { key: 'treasurer', label: 'Kassenwart', icon: '💰' },
  { key: 'secretary', label: 'Schriftwart', icon: '✉️' },
  { key: 'host', label: 'Gastgeber', icon: '🍺' },
  { key: 'member', label: 'Mitglied', icon: '🐗' },
] as const;

type MatrixRoleKey = (typeof MATRIX_ROLES)[number]['key'];

/** Eine Berechtigungszeile mit dem Zustand je Rolle. */
interface PermissionRow {
  key: string;
  label: string;
  roles: Record<MatrixRoleKey, boolean>;
}

/** Ausgangsmatrix gemäß Mockup `web-rollen-rechte`. */
function defaultRows(): PermissionRow[] {
  const row = (
    key: string,
    label: string,
    admin: boolean,
    treasurer: boolean,
    secretary: boolean,
    host: boolean,
    member: boolean,
  ): PermissionRow => ({
    key,
    label,
    roles: { admin, treasurer, secretary, host, member },
  });
  return [
    row('credit', 'Guthaben verwalten (Aufladen / Buchen)', true, true, false, false, false),
    row('events', 'Events & Stammtische erstellen / planen', true, false, false, true, false),
    row('notify', 'Gruppen-Benachrichtigungen senden', true, false, true, false, false),
    row('attendance', 'Anwesenheitsabfrage starten', true, false, false, true, false),
    row('invite', 'Neue Mitglieder einladen', true, false, true, false, false),
    row('tally', 'Strichliste aller Mitglieder editieren', true, true, false, false, false),
    row('stats', 'Statistiken und Eber-Analytik einsehen', true, true, true, true, true),
    row('moderate', 'Chat-Beiträge löschen / moderieren', true, false, true, false, false),
    row('pin', 'Info Panels an Pinnwand heften', true, false, true, false, false),
  ];
}

/**
 * Rollen-&-Berechtigungsmatrix der Administration (TICKET-038).
 *
 * Reine Präsentation: Die Matrix wird clientseitig bearbeitet (Checkboxen mit
 * Änderungsindikator sowie „Änderungen speichern“/„Verwerfen“). Es existiert
 * kein serverseitiger Endpunkt für rollenweite Berechtigungen; verbindliche
 * Autorisierung verbleibt im Fachservice (`deny by default`). Die Ansicht wird
 * nur im Browser bearbeitet und gibt keine privaten Daten in SSR-HTML aus.
 */
@Component({
  selector: 'app-admin-roles-matrix',
  imports: [FormsModule, StatCardComponent],
  template: `
    <section class="roles-matrix" aria-labelledby="roles-matrix-title">
      <h2 class="member-subtitle" id="roles-matrix-title">Rollen &amp; Berechtigungen</h2>

      <div class="roles-cards">
        @for (role of roles; track role.key) {
          <vereint-stat-card
            [icon]="role.icon"
            [label]="role.label"
            [value]="memberCount(role.key)"
            hint="Mitglied"
          />
        }
      </div>

      @if (savedInfo()) {
        <p class="manage-action-info" role="status">Berechtigungen gespeichert.</p>
      }

      <table class="ui-table roles-table">
        <thead>
          <tr>
            <th scope="col">Berechtigung</th>
            @for (role of roles; track role.key) {
              <th scope="col">{{ role.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (perm of rows(); track perm.key) {
            <tr>
              <th scope="row">{{ perm.label }}</th>
              @for (role of roles; track role.key) {
                <td [attr.data-label]="role.label">
                  <input
                    type="checkbox"
                    [name]="perm.key + '-' + role.key"
                    [attr.aria-label]="perm.label + ' – ' + role.label"
                    [(ngModel)]="perm.roles[role.key]"
                    (ngModelChange)="onToggle()"
                  />
                </td>
              }
            </tr>
          }
        </tbody>
      </table>

      <footer class="roles-footer">
        <span class="roles-hint">
          Systemrechte sind global für „Die Durstigen Eber“ geschützt.
        </span>
        <span class="roles-actions">
          <button
            type="button"
            class="member-button member-button-ghost"
            [disabled]="!dirty()"
            (click)="discard()"
          >
            Verwerfen
          </button>
          <button type="button" class="member-button" [disabled]="!dirty()" (click)="save()">
            Änderungen speichern
          </button>
        </span>
      </footer>
    </section>
  `,
  styles: [
    `
      .roles-cards {
        display: grid;
        gap: var(--space-2);
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        margin: 0.5rem 0 1rem;
      }
      .roles-table th[scope='row'] {
        text-align: left;
        font-weight: 600;
      }
      .roles-table td {
        text-align: center;
      }
      .roles-footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-top: 1rem;
      }
      .roles-hint {
        color: var(--color-text-muted);
        font-size: 0.85rem;
      }
      .roles-actions {
        display: inline-flex;
        gap: 0.5rem;
      }
    `,
  ],
})
export class RolesMatrixComponent {
  /** Mitgliederzahl je Präsentationsrolle (nur Anzeige der Karten). */
  @Input() roleCounts: Partial<Record<MatrixRoleKey, number>> = {};

  protected readonly roles = MATRIX_ROLES;
  protected readonly rows = signal<PermissionRow[]>(defaultRows());
  protected readonly dirty = signal(false);
  protected readonly savedInfo = signal(false);

  private baseline = this.serialize(defaultRows());

  protected memberCount(role: MatrixRoleKey): number {
    return this.roleCounts[role] ?? 0;
  }

  protected onToggle(): void {
    this.savedInfo.set(false);
    this.dirty.set(this.serialize(this.rows()) !== this.baseline);
  }

  protected save(): void {
    this.baseline = this.serialize(this.rows());
    this.dirty.set(false);
    this.savedInfo.set(true);
  }

  protected discard(): void {
    // Rekonstruiert die zuletzt gespeicherte Matrix aus der Baseline.
    const restored = JSON.parse(this.baseline) as PermissionRow[];
    this.rows.set(restored);
    this.dirty.set(false);
    this.savedInfo.set(false);
  }

  private serialize(rows: PermissionRow[]): string {
    return JSON.stringify(rows);
  }
}
