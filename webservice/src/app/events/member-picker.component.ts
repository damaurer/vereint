import { Component, computed, input, model, signal } from '@angular/core';
import type { DirectoryMember } from '../api/api.types';
import { TranslatePipe } from '../i18n';

/**
 * Auswahl von Mitgliedern per Name (Event anlegen, Event verwalten).
 *
 * Zeigt das Mitgliederverzeichnis als Checkbox-Liste mit Namenssuche und der
 * Option „Alle Mitglieder einladen“. Kennungen bleiben unsichtbar; gearbeitet
 * wird ausschließlich mit Namen.
 */
@Component({
  selector: 'app-member-picker',
  imports: [TranslatePipe],
  template: `
    <fieldset class="picker">
      <legend>{{ legend() }}</legend>
      <label class="picker-all">
        <input
          type="checkbox"
          name="pickerAll"
          [checked]="allMembers()"
          (change)="allMembers.set($any($event.target).checked)"
        />
        {{ 'events.picker.allMembers' | t }}
      </label>
      @if (!allMembers()) {
        <label class="picker-search">
          <span>{{ 'events.picker.search' | t }}</span>
          <input
            type="search"
            name="pickerSearch"
            autocomplete="off"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            [placeholder]="'events.picker.searchPlaceholder' | t"
          />
        </label>
        @if (available().length === 0) {
          <p class="picker-empty">{{ 'events.picker.empty' | t }}</p>
        } @else {
          @if (filtered().length === 0) {
            <p class="picker-empty">{{ 'events.picker.noMatch' | t }}</p>
          } @else {
            <ul class="picker-list">
              @for (member of filtered(); track member.id) {
                <li>
                  <label class="picker-item">
                    <input
                      type="checkbox"
                      [checked]="isSelected(member.id)"
                      (change)="toggle(member.id, $any($event.target).checked)"
                    />
                    <span>{{ member.displayName }}</span>
                  </label>
                </li>
              }
            </ul>
          }
          <p class="picker-count" aria-live="polite">
            {{ 'events.picker.selected' | t: { count: selected().length } }}
          </p>
        }
      }
    </fieldset>
  `,
  styles: [
    `
      .picker {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0;
        padding: 0.75rem;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 0.75rem);
        min-width: 0;
      }
      .picker legend {
        padding: 0 0.25rem;
        font-weight: 600;
      }
      .picker-all,
      .picker-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.5rem;
        cursor: pointer;
      }
      .picker-search {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .picker-search input {
        padding: 0.5rem;
        border: 1px solid var(--color-border-dark, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
      }
      .picker-list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 16rem;
        overflow-y: auto;
      }
      .picker-empty,
      .picker-count {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-muted, #64748b);
      }
    `,
  ],
})
export class MemberPickerComponent {
  /** Mitgliederverzeichnis. */
  readonly members = input<DirectoryMember[]>([]);
  /** Bereits eingeladene oder auszublendende Mitglieder. */
  readonly excludeIds = input<readonly string[]>([]);
  readonly legend = input('');
  /** Gewählte Kennungen. */
  readonly selected = model<string[]>([]);
  /** „Alle Mitglieder einladen“. */
  readonly allMembers = model(false);

  protected readonly query = signal('');

  protected readonly available = computed(() => {
    const excluded = new Set(this.excludeIds());
    return this.members()
      .filter((m) => !excluded.has(m.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'));
  });

  protected readonly filtered = computed(() => {
    const needle = this.query().trim().toLocaleLowerCase('de');
    const list = this.available();
    return needle ? list.filter((m) => m.displayName.toLocaleLowerCase('de').includes(needle)) : list;
  });

  protected isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  protected toggle(id: string, checked: boolean): void {
    this.selected.update((ids) =>
      checked ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((x) => x !== id),
    );
  }
}
