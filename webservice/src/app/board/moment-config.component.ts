import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError } from '../api/api-client.service';
import type { MomentConfigDto, MomentReactionDto, MomentTypeDto } from '../api/api.types';
import { TranslatePipe, translate } from '../i18n';
import { AsyncState } from '../member/async-state';
import { MemberApiService } from '../member/member-api.service';
import { ModalComponent } from '../ui';
import { StateComponent } from '../ui/state.component';

/**
 * Moment-Typen und Reaktionen verwalten (Vorstand und Administration).
 *
 * Der Vorstand legt fest, welche Arten von Moments Mitglieder starten können
 * und mit welchen Reaktionen sie antworten. Je Typ sind entweder alle aktiven
 * Reaktionen erlaubt oder eine Auswahl. Gelöscht wird nichts: Ausmustern
 * blendet einen Eintrag für neue Moments aus, alte Moments behalten ihn.
 */
@Component({
  selector: 'app-board-moment-config',
  imports: [FormsModule, RouterLink, ModalComponent, StateComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="moment-config-title">
        <a class="member-back" routerLink="/board">{{ 'board.momentConfig.back' | t }}</a>
        <span class="eyebrow">{{ 'board.overview.eyebrow' | t }}</span>
        <h1 id="moment-config-title">{{ 'board.momentConfig.title' | t }}</h1>
        <p>{{ 'board.momentConfig.intro' | t }}</p>

        @if (load.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'board.momentConfig.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (config(); as cfg) {
          <div class="config-section-head">
            <h2 class="member-subtitle">{{ 'board.momentConfig.typesTitle' | t }}</h2>
            <button type="button" class="member-button" (click)="editType(null)">
              {{ 'board.momentConfig.newType' | t }}
            </button>
          </div>
          <ul class="member-list">
            @for (type of cfg.types; track type.id) {
              <li class="member-list-item config-row" [class.is-retired]="!type.active">
                <span class="config-emoji" aria-hidden="true">{{ type.emoji }}</span>
                <span class="config-meta">
                  <span class="member-list-title">
                    {{ type.name }}
                    @if (!type.active) {
                      <span class="config-badge">{{ 'board.momentConfig.retired' | t }}</span>
                    }
                  </span>
                  @if (type.description) {
                    <span class="member-list-meta">{{ type.description }}</span>
                  }
                  <span class="member-list-meta">{{ reactionSummary(type) }}</span>
                </span>
                <button type="button" class="member-button btn-subtle" (click)="editType(type)">
                  {{ 'board.momentConfig.edit' | t }}
                </button>
              </li>
            }
          </ul>

          <div class="config-section-head">
            <h2 class="member-subtitle">{{ 'board.momentConfig.reactionsTitle' | t }}</h2>
            <button type="button" class="member-button" (click)="editReaction(null)">
              {{ 'board.momentConfig.newReaction' | t }}
            </button>
          </div>
          <ul class="member-list">
            @for (reaction of cfg.reactions; track reaction.id) {
              <li class="member-list-item config-row" [class.is-retired]="!reaction.active">
                <span class="config-emoji" aria-hidden="true">{{ reaction.emoji }}</span>
                <span class="config-meta">
                  <span class="member-list-title">
                    {{ reaction.name }}
                    @if (!reaction.active) {
                      <span class="config-badge">{{ 'board.momentConfig.retired' | t }}</span>
                    }
                  </span>
                </span>
                <button type="button" class="member-button btn-subtle" (click)="editReaction(reaction)">
                  {{ 'board.momentConfig.edit' | t }}
                </button>
              </li>
            }
          </ul>
        }
      </section>

      <!-- Typ anlegen/bearbeiten -->
      <vereint-modal
        [open]="typeFormOpen()"
        [title]="(editingTypeId() ? 'board.momentConfig.editType' : 'board.momentConfig.newType') | t"
        (closed)="typeFormOpen.set(false)"
      >
        <form class="member-form" (ngSubmit)="saveType()">
          <div class="config-name-row">
            <label class="config-emoji-field">
              <span class="form-label">{{ 'board.momentConfig.emoji' | t }}</span>
              <input class="member-input" name="typeEmoji" [(ngModel)]="typeEmoji" maxlength="16" required />
            </label>
            <label class="config-name-field">
              <span class="form-label">{{ 'board.momentConfig.name' | t }}</span>
              <input class="member-input" name="typeName" [(ngModel)]="typeName" maxlength="64" required />
            </label>
          </div>
          <label>
            <span class="form-label">{{ 'board.momentConfig.description' | t }}</span>
            <input class="member-input" name="typeDescription" [(ngModel)]="typeDescription" maxlength="255" />
          </label>

          <fieldset class="config-fieldset">
            <legend class="form-label">{{ 'board.momentConfig.allowedReactions' | t }}</legend>
            <label class="checkbox-label">
              <input type="checkbox" name="typeAllReactions" [(ngModel)]="typeAllReactions" />
              <span>{{ 'board.momentConfig.allReactions' | t }}</span>
            </label>
            @if (!typeAllReactions) {
              <div class="config-reaction-grid">
                @for (reaction of activeReactions(); track reaction.id) {
                  <label class="config-reaction-choice" [class.is-selected]="typeReactionIds.has(reaction.id)">
                    <input
                      type="checkbox"
                      [checked]="typeReactionIds.has(reaction.id)"
                      (change)="toggleTypeReaction(reaction.id)"
                    />
                    <span>{{ reaction.emoji }} {{ reaction.name }}</span>
                  </label>
                }
              </div>
            }
          </fieldset>

          <label class="checkbox-label">
            <input type="checkbox" name="typeActive" [(ngModel)]="typeActive" />
            <span>{{ 'board.momentConfig.activeType' | t }}</span>
          </label>
          @if (editingTypeId() && !typeActive) {
            <p class="member-hint">{{ 'board.momentConfig.retireTypeHint' | t }}</p>
          }

          @if (formError(); as message) {
            <p class="form-error-msg" role="alert">{{ message }}</p>
          }
          <div class="modal-buttons">
            <button type="button" class="member-button btn-subtle" (click)="typeFormOpen.set(false)">
              {{ 'common.cancel' | t }}
            </button>
            <button type="submit" class="member-button btn-primary" [disabled]="saving() || !canSaveType()">
              {{ 'common.save' | t }}
            </button>
          </div>
        </form>
      </vereint-modal>

      <!-- Reaktion anlegen/bearbeiten -->
      <vereint-modal
        [open]="reactionFormOpen()"
        [title]="(editingReactionId() ? 'board.momentConfig.editReaction' : 'board.momentConfig.newReaction') | t"
        (closed)="reactionFormOpen.set(false)"
      >
        <form class="member-form" (ngSubmit)="saveReaction()">
          <div class="config-name-row">
            <label class="config-emoji-field">
              <span class="form-label">{{ 'board.momentConfig.emoji' | t }}</span>
              <input class="member-input" name="reactionEmoji" [(ngModel)]="reactionEmoji" maxlength="16" required />
            </label>
            <label class="config-name-field">
              <span class="form-label">{{ 'board.momentConfig.name' | t }}</span>
              <input class="member-input" name="reactionName" [(ngModel)]="reactionName" maxlength="64" required />
            </label>
          </div>
          <label class="checkbox-label">
            <input type="checkbox" name="reactionActive" [(ngModel)]="reactionActive" />
            <span>{{ 'board.momentConfig.activeReaction' | t }}</span>
          </label>
          @if (editingReactionId() && !reactionActive) {
            <p class="member-hint">{{ 'board.momentConfig.retireReactionHint' | t }}</p>
          }

          @if (formError(); as message) {
            <p class="form-error-msg" role="alert">{{ message }}</p>
          }
          <div class="modal-buttons">
            <button type="button" class="member-button btn-subtle" (click)="reactionFormOpen.set(false)">
              {{ 'common.cancel' | t }}
            </button>
            <button
              type="submit"
              class="member-button btn-primary"
              [disabled]="saving() || !reactionName.trim() || !reactionEmoji.trim()"
            >
              {{ 'common.save' | t }}
            </button>
          </div>
        </form>
      </vereint-modal>
    </main>
  `,
  styles: [
    `
      .config-section-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-top: var(--space-3);
      }
      .config-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .config-row.is-retired {
        opacity: 0.6;
      }
      .config-emoji {
        flex: none;
        font-size: 1.6rem;
        width: 2.2rem;
        text-align: center;
      }
      .config-meta {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .config-badge {
        display: inline-block;
        margin-left: 0.4rem;
        padding: 0.05rem 0.45rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 700;
        border: 1px solid var(--color-border);
        color: var(--color-text-muted);
      }
      .config-name-row {
        display: grid;
        grid-template-columns: 5rem minmax(0, 1fr);
        gap: 0.75rem;
      }
      .config-name-row label,
      .member-form > label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .config-emoji-field input {
        text-align: center;
        font-size: 1.3rem;
      }
      .config-fieldset {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 0.75rem;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .config-reaction-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
        gap: 0.4rem;
      }
      .config-reaction-choice {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.4rem 0.55rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        cursor: pointer;
      }
      .config-reaction-choice.is-selected {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
      }
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-direction: row;
      }
      .modal-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .form-error-msg {
        color: var(--color-danger, #dc2626);
        margin: 0;
      }
    `,
  ],
})
export class MomentConfigComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);

  protected readonly load = new AsyncState<MomentConfigDto>();
  protected readonly config = signal<MomentConfigDto | null>(null);
  protected readonly activeReactions = computed(() => this.config()?.reactions.filter((r) => r.active) ?? []);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly typeFormOpen = signal(false);
  protected readonly editingTypeId = signal<string | null>(null);
  protected typeName = '';
  protected typeEmoji = '';
  protected typeDescription = '';
  protected typeActive = true;
  protected typeAllReactions = true;
  protected typeReactionIds = new Set<string>();

  protected readonly reactionFormOpen = signal(false);
  protected readonly editingReactionId = signal<string | null>(null);
  protected reactionName = '';
  protected reactionEmoji = '';
  protected reactionActive = true;

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.api.getMomentConfig(), (config) => this.config.set(config));
  }

  /** „Alle Reaktionen“ oder die Namen der erlaubten Reaktionen. */
  protected reactionSummary(type: MomentTypeDto): string {
    if (type.allReactions) return translate('board.momentConfig.allReactionsShort');
    const names = (this.config()?.reactions ?? [])
      .filter((r) => type.reactionIds.includes(r.id))
      .map((r) => `${r.emoji} ${r.name}`);
    return translate('board.momentConfig.someReactions', { list: names.join(', ') });
  }

  protected editType(type: MomentTypeDto | null): void {
    this.formError.set(null);
    this.editingTypeId.set(type?.id ?? null);
    this.typeName = type?.name ?? '';
    this.typeEmoji = type?.emoji ?? '';
    this.typeDescription = type?.description ?? '';
    this.typeActive = type?.active ?? true;
    this.typeAllReactions = type?.allReactions ?? true;
    this.typeReactionIds = new Set(type?.reactionIds ?? []);
    this.typeFormOpen.set(true);
  }

  protected toggleTypeReaction(id: string): void {
    const next = new Set(this.typeReactionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.typeReactionIds = next;
  }

  protected canSaveType(): boolean {
    if (!this.typeName.trim() || !this.typeEmoji.trim()) return false;
    if (this.typeAllReactions) return true;
    return this.activeReactions().some((r) => this.typeReactionIds.has(r.id));
  }

  protected saveType(): void {
    if (!this.canSaveType()) return;
    this.saving.set(true);
    this.formError.set(null);
    this.api
      .saveMomentType(this.editingTypeId(), {
        name: this.typeName.trim(),
        emoji: this.typeEmoji.trim(),
        description: this.typeDescription.trim() || undefined,
        active: this.typeActive,
        allReactions: this.typeAllReactions,
        reactionIds: this.typeAllReactions ? [] : [...this.typeReactionIds],
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.typeFormOpen.set(false);
          this.reload();
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  protected editReaction(reaction: MomentReactionDto | null): void {
    this.formError.set(null);
    this.editingReactionId.set(reaction?.id ?? null);
    this.reactionName = reaction?.name ?? '';
    this.reactionEmoji = reaction?.emoji ?? '';
    this.reactionActive = reaction?.active ?? true;
    this.reactionFormOpen.set(true);
  }

  protected saveReaction(): void {
    if (!this.reactionName.trim() || !this.reactionEmoji.trim()) return;
    this.saving.set(true);
    this.formError.set(null);
    this.api
      .saveMomentReaction(this.editingReactionId(), {
        name: this.reactionName.trim(),
        emoji: this.reactionEmoji.trim(),
        active: this.reactionActive,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.reactionFormOpen.set(false);
          this.reload();
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  private fail(error: unknown): void {
    this.saving.set(false);
    this.formError.set(
      error instanceof ApiError && error.message ? error.message : translate('board.momentConfig.saveFailed'),
    );
  }
}
