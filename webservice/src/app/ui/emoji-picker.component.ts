import { Component, EventEmitter, OnInit, Output, computed, signal } from '@angular/core';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

/** Ein Emoji mit englischem Namen (für die Suche). */
export interface EmojiEntry {
  emoji: string;
  name: string;
}

/** Eine Gruppe der Unicode-Liste (Smileys, Menschen, Tiere, …). */
export interface EmojiGroup {
  slug: string;
  /** Erstes Emoji der Gruppe als Symbol für den Reiter. */
  icon: string;
  emojis: EmojiEntry[];
}

/**
 * Neuere Emojis zeigen viele Handys noch als leere Kästchen; die Auswahl
 * endet deshalb bei dieser Unicode-Emoji-Version.
 */
export const MAX_EMOJI_VERSION = 15.0;

/** Höchstens so viele zuletzt genutzte Emojis merkt sich die App (nur auf diesem Gerät). */
export const RECENT_EMOJI_LIMIT = 24;

const RECENT_STORAGE_KEY = 'vereint.recentEmojis';

/** Vorbelegung von „Zuletzt verwendet“, solange noch nichts gewählt wurde. */
export const DEFAULT_RECENT_EMOJIS = ['🍺', '👍', '❤️', '😂', '🎉', '🍻', '😮', '😢', '🙏', '🔥'];

interface RawGroup {
  slug: string;
  emojis: { emoji: string; name: string; emoji_version: string }[];
}

let groupsPromise: Promise<EmojiGroup[]> | null = null;

/**
 * Lädt die vollständige Emoji-Liste (Unicode, Paket `unicode-emoji-json`)
 * erst beim ersten Öffnen als eigenen Baustein nach.
 */
export function loadEmojiGroups(): Promise<EmojiGroup[]> {
  groupsPromise ??= import('unicode-emoji-json/data-by-group.json')
    .then((module) => {
      const raw = ((module as { default?: unknown }).default ?? module) as RawGroup[];
      return raw
        .map((group) => {
          const emojis = group.emojis
            .filter((entry) => Number(entry.emoji_version) <= MAX_EMOJI_VERSION)
            .map((entry) => ({ emoji: entry.emoji, name: entry.name }));
          return { slug: group.slug, icon: emojis[0]?.emoji ?? '', emojis };
        })
        .filter((group) => group.emojis.length > 0);
    })
    .catch((error: unknown) => {
      groupsPromise = null;
      throw error;
    });
  return groupsPromise;
}

function readRecent(): string[] {
  try {
    const stored = globalThis.localStorage?.getItem(RECENT_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as unknown) : null;
    if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
      return parsed.slice(0, RECENT_EMOJI_LIMIT);
    }
  } catch {
    // Kein Speicher (privates Fenster): Vorbelegung nutzen.
  }
  return [...DEFAULT_RECENT_EMOJIS];
}

function writeRecent(list: string[]): void {
  try {
    globalThis.localStorage?.setItem(RECENT_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Nicht kritisch.
  }
}

/**
 * Auswahl aus allen Emojis wie bei bekannten Messengern: „Zuletzt verwendet“,
 * Reiter je Gruppe und Suche (englische Unicode-Namen, z. B. „beer“).
 * Meldet das gewählte Emoji über [pick]; die Liste lädt beim ersten Öffnen nach.
 */
@Component({
  selector: 'vereint-emoji-picker',
  imports: [TranslatePipe],
  template: `
    <div class="emoji-picker" role="dialog" [attr.aria-label]="'emoji.title' | t">
      <div class="emoji-search">
        <input
          type="search"
          class="emoji-search-input"
          autocomplete="off"
          [placeholder]="'emoji.search' | t"
          [attr.aria-label]="'emoji.search' | t"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
      </div>
      @if (!query().trim()) {
        <div class="emoji-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="emoji-tab"
            [class.is-active]="active() === 'recent'"
            [attr.aria-selected]="active() === 'recent'"
            [attr.aria-label]="'emoji.groups.recent' | t"
            [attr.title]="'emoji.groups.recent' | t"
            (click)="active.set('recent')"
          >
            🕘
          </button>
          @for (group of groups(); track group.slug) {
            <button
              type="button"
              role="tab"
              class="emoji-tab"
              [class.is-active]="active() === group.slug"
              [attr.aria-selected]="active() === group.slug"
              [attr.aria-label]="groupLabel(group.slug)"
              [attr.title]="groupLabel(group.slug)"
              (click)="active.set(group.slug)"
            >
              {{ group.icon }}
            </button>
          }
        </div>
      }
      <p class="emoji-heading">{{ heading() }}</p>
      <div class="emoji-grid" role="listbox" [attr.aria-label]="heading()">
        @for (entry of visible(); track entry.emoji) {
          <button
            type="button"
            role="option"
            class="emoji-option"
            [attr.aria-label]="entry.name || entry.emoji"
            [attr.title]="entry.name"
            (click)="choose(entry.emoji)"
          >
            {{ entry.emoji }}
          </button>
        } @empty {
          <p class="emoji-empty">{{ (loading() ? 'common.loading' : 'emoji.none') | t }}</p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .emoji-picker {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        width: min(100%, 22rem);
        padding: 0.5rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
        box-shadow: var(--shadow-md, 0 4px 16px rgba(15, 23, 42, 0.15));
      }
      .emoji-search-input {
        width: 100%;
        min-height: 2.25rem;
        padding: 0 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background-color: var(--color-surface-subtle);
        color: inherit;
        font: inherit;
      }
      .emoji-tabs {
        display: flex;
        gap: 0.1rem;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .emoji-tab {
        flex: none;
        width: 2.1rem;
        height: 2.1rem;
        border: none;
        border-bottom: 2px solid transparent;
        background: none;
        font-size: 1.1rem;
        cursor: pointer;
        opacity: 0.7;
      }
      .emoji-tab.is-active {
        border-bottom-color: var(--color-brand);
        opacity: 1;
      }
      .emoji-heading {
        margin: 0;
        color: var(--color-text-muted);
        font-size: 0.75rem;
        font-weight: 600;
      }
      .emoji-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(2.25rem, 1fr));
        max-height: 14rem;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .emoji-option {
        height: 2.25rem;
        border: none;
        border-radius: var(--radius-sm);
        background: none;
        font-size: 1.35rem;
        line-height: 1;
        cursor: pointer;
      }
      .emoji-option:hover,
      .emoji-option:focus-visible {
        background-color: var(--color-surface-subtle);
      }
      .emoji-empty {
        grid-column: 1 / -1;
        margin: 0.5rem 0;
        color: var(--color-text-muted);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class EmojiPickerComponent implements OnInit {
  /** Gewähltes Emoji. */
  @Output() readonly pick = new EventEmitter<string>();

  protected readonly groups = signal<EmojiGroup[]>([]);
  protected readonly loading = signal(true);
  protected readonly active = signal<string>('recent');
  protected readonly query = signal('');
  private readonly recent = signal<string[]>(readRecent());

  private readonly names = computed(() => {
    const map = new Map<string, string>();
    for (const group of this.groups()) for (const entry of group.emojis) map.set(entry.emoji, entry.name);
    return map;
  });

  protected readonly visible = computed<EmojiEntry[]>(() => {
    const query = this.query().trim().toLowerCase();
    if (query) {
      const result: EmojiEntry[] = [];
      for (const group of this.groups()) {
        for (const entry of group.emojis) {
          if (entry.name.includes(query) || entry.emoji === query) result.push(entry);
        }
      }
      return result.slice(0, 120);
    }
    if (this.active() === 'recent') {
      const names = this.names();
      return this.recent().map((emoji) => ({ emoji, name: names.get(emoji) ?? '' }));
    }
    return this.groups().find((group) => group.slug === this.active())?.emojis ?? [];
  });

  protected readonly heading = computed(() => {
    if (this.query().trim()) return translate('emoji.results');
    return this.groupLabel(this.active());
  });

  ngOnInit(): void {
    loadEmojiGroups()
      .then((groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      })
      .catch(() => this.loading.set(false));
  }

  protected groupLabel(slug: string): string {
    return translate(`emoji.groups.${slug}`);
  }

  protected choose(emoji: string): void {
    const next = [emoji, ...this.recent().filter((entry) => entry !== emoji)].slice(0, RECENT_EMOJI_LIMIT);
    this.recent.set(next);
    writeRecent(next);
    this.pick.emit(emoji);
  }
}
