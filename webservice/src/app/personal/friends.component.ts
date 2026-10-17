import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, type Observable } from 'rxjs';
import type { FriendContact, FriendsOverview } from '../api/api.types';
import { describeApiError } from '../api/api-client.service';
import { ChatApiService } from '../chat/chat-api.service';
import { activeLocale, TranslatePipe } from '../i18n';
import { AsyncState } from '../member/async-state';
import { AvatarBadgeComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import { PersonalApiService } from './personal-api.service';

interface FriendsPage {
  overview: FriendsOverview;
  contacts: FriendContact[];
}

/**
 * Freundesliste (`/freunde`) über alle Gruppen.
 *
 * Oben stehen offene Anfragen an mich, dann die Freunde, darunter die
 * Personen aus den eigenen Gruppen, die man hinzufügen kann. Freunde bleiben,
 * auch wenn man keine Gruppe mehr teilt; ihnen kann man weiter Direktnachrichten
 * schreiben. Eine freie Suche über alle Konten gibt es bewusst nicht.
 */
@Component({
  selector: 'app-friends',
  imports: [StateComponent, FormsModule, RouterLink, AvatarBadgeComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="friends-title">
        <span class="eyebrow">{{ 'friends.eyebrow' | t }}</span>
        <div class="fr-head">
          <h1 id="friends-title">{{ 'friends.title' | t }}</h1>
          <a class="member-back" routerLink="/direktnachrichten">{{ 'friends.toDirect' | t }}</a>
        </div>
        <p>{{ 'friends.intro' | t }}</p>

        @if (actionError()) {
          <p class="manage-action-error" role="alert">{{ actionError() }}</p>
        }

        @if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'friends.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (!load.data()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'friends.loadingMessage' | t"
          />
        } @else if (load.data(); as page) {
          @if (page.overview.incoming.length > 0) {
            <h2 class="fr-section">
              {{ 'friends.incoming' | t: { count: page.overview.incoming.length } }}
            </h2>
            <ul class="fr-list">
              @for (person of page.overview.incoming; track person.userId) {
                <li class="fr-row">
                  <vereint-avatar-badge [name]="person.displayName" />
                  <span class="fr-text">
                    <span class="fr-name">{{ person.displayName }}</span>
                    <span class="fr-meta">{{ groupsText(person) }}</span>
                  </span>
                  <span class="fr-actions">
                    <button
                      type="button"
                      class="member-button"
                      [disabled]="busy() !== null"
                      (click)="accept(person)"
                    >
                      {{ 'friends.accept' | t }}
                    </button>
                    <button
                      type="button"
                      class="fr-secondary"
                      [disabled]="busy() !== null"
                      (click)="remove(person)"
                    >
                      {{ 'friends.decline' | t }}
                    </button>
                  </span>
                </li>
              }
            </ul>
          }

          <h2 class="fr-section">
            {{ 'friends.friends' | t: { count: page.overview.friends.length } }}
          </h2>
          @if (page.overview.friends.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'friends.emptyTitle' | t"
              [message]="'friends.emptyMessage' | t"
            />
          } @else {
            <ul class="fr-list">
              @for (person of page.overview.friends; track person.userId) {
                <li class="fr-row">
                  <vereint-avatar-badge [name]="person.displayName" />
                  <span class="fr-text">
                    <span class="fr-name">{{ person.displayName }}</span>
                    <span class="fr-meta">{{
                      groupsText(person) || ('friends.noSharedGroup' | t)
                    }}</span>
                  </span>
                  <span class="fr-actions">
                    <button
                      type="button"
                      class="member-button"
                      [disabled]="busy() !== null"
                      (click)="message(person)"
                    >
                      {{ 'friends.message' | t }}
                    </button>
                    @if (confirmRemove() === person.userId) {
                      <button
                        type="button"
                        class="fr-danger"
                        [disabled]="busy() !== null"
                        (click)="remove(person)"
                      >
                        {{ 'friends.confirmRemove' | t }}
                      </button>
                    } @else {
                      <button
                        type="button"
                        class="fr-secondary"
                        [disabled]="busy() !== null"
                        (click)="confirmRemove.set(person.userId)"
                      >
                        {{ 'friends.remove' | t }}
                      </button>
                    }
                  </span>
                </li>
              }
            </ul>
          }

          @if (page.overview.outgoing.length > 0) {
            <h2 class="fr-section">
              {{ 'friends.outgoing' | t: { count: page.overview.outgoing.length } }}
            </h2>
            <ul class="fr-list">
              @for (person of page.overview.outgoing; track person.userId) {
                <li class="fr-row">
                  <vereint-avatar-badge [name]="person.displayName" />
                  <span class="fr-text">
                    <span class="fr-name">{{ person.displayName }}</span>
                    <span class="fr-meta">{{ 'friends.waiting' | t }}</span>
                  </span>
                  <span class="fr-actions">
                    <button
                      type="button"
                      class="fr-secondary"
                      [disabled]="busy() !== null"
                      (click)="remove(person)"
                    >
                      {{ 'friends.withdraw' | t }}
                    </button>
                  </span>
                </li>
              }
            </ul>
          }

          <h2 class="fr-section">{{ 'friends.addTitle' | t }}</h2>
          <p class="fr-hint">{{ 'friends.addHint' | t }}</p>
          <label class="fr-search">
            <span>{{ 'friends.searchLabel' | t }}</span>
            <input
              name="friendSearch"
              type="search"
              autocomplete="off"
              [placeholder]="'friends.searchPlaceholder' | t"
              [ngModel]="term()"
              (ngModelChange)="term.set($event)"
            />
          </label>
          @if (candidates().length === 0) {
            <vereint-state
              kind="empty"
              [title]="'friends.noCandidatesTitle' | t"
              [message]="'friends.noCandidatesMessage' | t"
            />
          } @else {
            <ul class="fr-list">
              @for (person of candidates(); track person.userId) {
                <li class="fr-row">
                  <vereint-avatar-badge [name]="person.displayName" />
                  <span class="fr-text">
                    <span class="fr-name">{{ person.displayName }}</span>
                    <span class="fr-meta">{{ groupsText(person) }}</span>
                  </span>
                  <span class="fr-actions">
                    <button
                      type="button"
                      class="member-button"
                      [disabled]="busy() !== null"
                      (click)="add(person)"
                    >
                      {{ 'friends.add' | t }}
                    </button>
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
      .fr-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem 1rem;
      }
      .fr-head h1 {
        margin: 0;
      }
      .fr-section {
        margin: var(--space-4) 0 var(--space-2);
        font-size: 1.05rem;
      }
      .fr-hint {
        margin: 0 0 var(--space-2);
        color: var(--color-text-muted);
      }
      .fr-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--space-2);
      }
      .fr-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2);
        padding: var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
      }
      .fr-text {
        flex: 1;
        min-width: 10rem;
        display: flex;
        flex-direction: column;
      }
      .fr-name {
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .fr-meta {
        color: var(--color-text-muted);
        font-size: 0.85rem;
        overflow-wrap: anywhere;
      }
      .fr-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .fr-secondary,
      .fr-danger {
        min-height: 2.75rem;
        padding: 0 1rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: transparent;
        color: inherit;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .fr-danger {
        border-color: var(--color-danger);
        color: var(--color-danger);
      }
      .fr-search {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-weight: 600;
        margin-bottom: var(--space-2);
      }
      .fr-search input {
        width: 100%;
        padding: 0.7rem 0.9rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
        font-weight: 400;
      }
    `,
  ],
})
export class FriendsComponent implements OnInit, OnDestroy {
  private readonly api = inject(PersonalApiService);
  private readonly chat = inject(ChatApiService);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly load = new AsyncState<FriendsPage>();
  protected readonly term = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly confirmRemove = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  /** Personen aus den eigenen Gruppen ohne Freundschaft oder offene Anfrage. */
  protected readonly candidates = computed<FriendContact[]>(() => {
    const needle = this.term().trim().toLowerCase();
    return (this.load.data()?.contacts ?? [])
      .filter((person) => person.friendStatus === 'none')
      .filter((person) => !needle || person.displayName.toLowerCase().includes(needle));
  });

  ngOnInit(): void {
    if (!this.browser) return;
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(forkJoin({ overview: this.api.friends(), contacts: this.api.contacts() }));
  }

  protected groupsText(person: FriendContact): string {
    return person.sharedGroups
      .map((group) => group.name)
      .sort((a, b) => a.localeCompare(b, activeLocale()))
      .join(', ');
  }

  protected add(person: FriendContact): void {
    this.run(person, this.api.request(person.userId));
  }

  protected accept(person: FriendContact): void {
    this.run(person, this.api.accept(person.userId));
  }

  /** Ablehnen, zurückziehen oder (nach Bestätigung) Freundschaft beenden. */
  protected remove(person: FriendContact): void {
    this.confirmRemove.set(null);
    this.run(person, this.api.remove(person.userId));
  }

  /** Öffnet bzw. beginnt das Direktgespräch mit diesem Freund. */
  protected message(person: FriendContact): void {
    if (this.busy()) return;
    this.busy.set(person.userId);
    this.actionError.set(null);
    this.chat.startDirect(person.userId).subscribe({
      next: (conversation) => {
        this.busy.set(null);
        void this.router.navigate(['/direktnachrichten'], { queryParams: { id: conversation.id } });
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.actionError.set(describeApiError(error));
      },
    });
  }

  private run(person: FriendContact, action: Observable<unknown>): void {
    if (this.busy()) return;
    this.busy.set(person.userId);
    this.actionError.set(null);
    action.subscribe({
      next: () => {
        this.busy.set(null);
        this.reload();
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.actionError.set(describeApiError(error));
      },
    });
  }
}
