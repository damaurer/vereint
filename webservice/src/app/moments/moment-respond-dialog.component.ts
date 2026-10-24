import {
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiError } from '../api/api-client.service';
import type {
  MomentMediaLimitsDto,
  MomentReactionDto,
  SubmitMomentResponseRequest,
} from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { I18nService, translate } from '../i18n/i18n.service';
import { MemberApiService } from '../member/member-api.service';
import { ModalComponent } from '../ui';
import { IconComponent } from '../ui/icon.component';
import { MediaPrepareError, MomentMediaUploader, PreparedMedia } from './moment-media';

/** Ausgewählte Datei im Beitragsdialog samt Upload-Fortschritt. */
interface PendingMedia {
  media: PreparedMedia;
  /** 0–1 während des Uploads, `null` vorher. */
  progress: number | null;
}

/**
 * Dialog „Beitrag teilen“: Reaktion, Fotos/Videos, Status und Standort.
 *
 * Fotos und Videos lassen sich direkt mit der Kamera aufnehmen
 * (`capture="environment"` öffnet auf Handys die Systemkamera) oder aus der
 * Galerie wählen. Videos bietet der Dialog nur an, wenn der Tarif der Gruppe
 * sie erlaubt; der Server prüft das beim Upload ohnehin.
 */
@Component({
  selector: 'app-moment-respond-dialog',
  imports: [FormsModule, ModalComponent, IconComponent, TranslatePipe],
  template: `
    <vereint-modal [open]="open()" [title]="'moments.respond.title' | t" (closed)="close()">
      <form class="moment-form" (ngSubmit)="submit()">
        @if (reactions().length > 0) {
          <fieldset class="field-block">
            <legend class="field-label">
              {{ 'moments.respond.reactionLabel' | t }}
              <span class="field-optional">{{ 'common.optional' | t }}</span>
            </legend>
            <div class="reaction-grid">
              @for (q of reactions(); track q.code) {
                <button
                  type="button"
                  class="reaction-tile pick-tile"
                  [class.is-selected]="reaction === q.code"
                  [attr.aria-pressed]="reaction === q.code"
                  (click)="toggleReaction(q.code)"
                >
                  <span class="reaction-emoji">{{ q.emoji }}</span>
                  <span class="reaction-name">{{ q.name }}</span>
                </button>
              }
            </div>
          </fieldset>
        }

        <div class="field-block" #mediaSection>
          <span class="field-label">
            {{ 'moments.media.label' | t }}
            <span class="field-optional">{{ 'common.optional' | t }}</span>
          </span>
          @if (pendingMedia().length > 0) {
            <ul class="pending-media">
              @for (item of pendingMedia(); track item.media.previewUrl; let i = $index) {
                <li class="pending-item">
                  @if (item.media.kind === 'video') {
                    <video
                      [src]="item.media.previewUrl"
                      muted
                      playsinline
                      preload="metadata"
                    ></video>
                    <span class="pending-badge pending-kind"><vereint-icon name="video" /></span>
                  } @else {
                    <img [src]="item.media.previewUrl" [alt]="item.media.name" />
                  }
                  @if (item.progress !== null) {
                    <span
                      class="pending-progress"
                      role="progressbar"
                      [attr.aria-valuenow]="progressPercent(item)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <span [style.width.%]="progressPercent(item)"></span>
                    </span>
                  } @else {
                    <button
                      type="button"
                      class="pending-badge pending-remove"
                      [attr.aria-label]="'moments.media.remove' | t"
                      (click)="removePendingMedia(i)"
                    >
                      <vereint-icon name="close" />
                    </button>
                  }
                </li>
              }
            </ul>
          }
          @if (mediaLimits(); as limits) {
            @if (pendingMedia().length < limits.maxMediaPerResponse) {
              <div class="capture-grid">
                <label class="capture-btn" [class.is-disabled]="submitting()">
                  <vereint-icon name="camera" />
                  <span>{{ 'moments.media.takePhoto' | t }}</span>
                  <input
                    #photoInput
                    type="file"
                    class="visually-hidden"
                    accept="image/*"
                    capture="environment"
                    data-testid="capture-photo"
                    [disabled]="submitting()"
                    (change)="onMediaSelected($event)"
                  />
                </label>
                @if (videosAllowed()) {
                  <label class="capture-btn" [class.is-disabled]="submitting()">
                    <vereint-icon name="video" />
                    <span>{{ 'moments.media.takeVideo' | t }}</span>
                    <input
                      type="file"
                      class="visually-hidden"
                      accept="video/*"
                      capture="environment"
                      data-testid="capture-video"
                      [disabled]="submitting()"
                      (change)="onMediaSelected($event)"
                    />
                  </label>
                }
                <label class="capture-btn" [class.is-disabled]="submitting()">
                  <vereint-icon name="image" />
                  <span>{{ 'moments.media.fromGallery' | t }}</span>
                  <input
                    type="file"
                    class="visually-hidden"
                    [accept]="galleryAccept()"
                    multiple
                    data-testid="pick-gallery"
                    [disabled]="submitting()"
                    (change)="onMediaSelected($event)"
                  />
                </label>
              </div>
            }
            <small class="field-hint">
              @if (videosAllowed()) {
                {{
                  'moments.media.hint'
                    | t
                      : {
                          count: limits.maxMediaPerResponse,
                          seconds: limits.maxVideoSeconds,
                          mb: maxVideoMb(),
                        }
                }}
              } @else {
                {{ 'moments.media.hintPhotos' | t: { count: limits.maxMediaPerResponse } }}
              }
            </small>
            @if (!videosAllowed()) {
              <p class="plan-note" data-testid="videos-not-in-plan">
                <vereint-icon name="lock" /> {{ 'moments.media.videosNotInPlan' | t }}
              </p>
            }
          }
          @if (mediaError()) {
            <p class="form-error-msg" role="alert">{{ mediaError() }}</p>
          }
        </div>

        <label class="field-block">
          <span class="field-label">
            {{ 'moments.respond.statusLabel' | t }}
            <span class="field-optional">{{ 'common.optional' | t }}</span>
          </span>
          <input
            type="text"
            class="text-input"
            [(ngModel)]="statusText"
            name="statusText"
            [placeholder]="'moments.respond.statusPlaceholder' | t"
            maxlength="255"
          />
        </label>

        <label class="toggle-row">
          <span class="toggle-icon"><vereint-icon name="location" /></span>
          <span class="toggle-text">
            <strong>{{ 'moments.start.consentTitle' | t }}</strong>
            <small>{{ geoStatus() || ('moments.respond.consent' | t) }}</small>
          </span>
          <input
            type="checkbox"
            class="switch"
            role="switch"
            [(ngModel)]="consent"
            name="consent"
            (change)="onConsentToggle($event)"
          />
        </label>

        @if (error()) {
          <p class="form-error-msg" role="alert">{{ error() }}</p>
        }

        <div class="sheet-footer">
          <button type="button" class="member-button member-button-ghost" (click)="close()">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="member-button" [disabled]="submitting() || !canSubmit()">
            {{ (submitting() ? 'moments.respond.submitting' : 'moments.respond.submit') | t }}
          </button>
        </div>
      </form>
    </vereint-modal>
  `,
  styleUrls: ['./moment-dialog.css'],
  styles: [
    `
      .reaction-grid,
      .pending-media {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
        gap: 0.5rem;
      }
      .reaction-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        padding: 0.75rem 0.5rem;
      }
      .reaction-emoji {
        font-size: 1.6rem;
      }
      .reaction-name {
        font-size: 0.75rem;
        font-weight: 600;
      }
      .capture-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
        gap: 0.5rem;
      }
      .capture-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        min-height: 5rem;
        padding: 0.75rem 0.5rem;
        border-radius: var(--radius-md);
        border: 1.5px dashed var(--color-border);
        background-color: var(--color-surface-raised);
        font-size: 0.82rem;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
      }
      .capture-btn vereint-icon {
        font-size: 1.5rem;
        color: var(--color-brand);
      }
      .capture-btn:hover {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
      }
      .capture-btn:focus-within {
        box-shadow: var(--vereint-focus-ring);
      }
      .capture-btn.is-disabled {
        opacity: 0.5;
        pointer-events: none;
      }
      .plan-note {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0;
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-sm);
        background-color: var(--color-warning-light);
        font-size: 0.8rem;
      }
      .pending-media {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .pending-item {
        position: relative;
        aspect-ratio: 1;
        border-radius: var(--radius-md);
        overflow: hidden;
        border: 1px solid var(--color-border);
      }
      .pending-item img,
      .pending-item video {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .pending-badge {
        position: absolute;
        display: grid;
        place-items: center;
        width: 1.75rem;
        height: 1.75rem;
        border: 0;
        border-radius: 50%;
        background-color: color-mix(in srgb, var(--color-text) 70%, transparent);
        color: var(--color-surface);
      }
      .pending-kind {
        left: 0.3rem;
        bottom: 0.3rem;
      }
      .pending-remove {
        top: 0.3rem;
        right: 0.3rem;
        cursor: pointer;
      }
      .pending-progress {
        position: absolute;
        left: 0.4rem;
        right: 0.4rem;
        bottom: 0.4rem;
        height: 0.35rem;
        border-radius: 999px;
        background-color: color-mix(in srgb, var(--color-surface) 70%, transparent);
        overflow: hidden;
      }
      .pending-progress span {
        display: block;
        height: 100%;
        background-color: var(--color-brand);
        transition: width 0.2s ease;
      }
    `,
  ],
})
export class MomentRespondDialogComponent implements OnDestroy {
  private readonly api = inject(MemberApiService);
  private readonly i18n = inject(I18nService);
  private readonly uploader = inject(MomentMediaUploader);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly open = input(false);
  readonly momentId = input<string | null>(null);
  /** Reaktionen, die das Thema des Moments erlaubt. */
  readonly reactions = input<MomentReactionDto[]>([]);
  readonly mediaLimits = input<MomentMediaLimitsDto | null>(null);
  /** Direkt beim Medienbereich beginnen („Foto/Video teilen“). */
  readonly focusMedia = input(false);

  readonly closed = output<void>();
  readonly submitted = output<string>();

  private readonly mediaSection = viewChild<ElementRef<HTMLElement>>('mediaSection');
  private readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');

  /** Videos nur, wenn der Tarif der Gruppe sie erlaubt. */
  protected readonly videosAllowed = computed(() => this.mediaLimits()?.videosAllowed !== false);
  protected readonly galleryAccept = computed(() =>
    this.videosAllowed() ? 'image/*,video/mp4,video/quicktime' : 'image/*',
  );
  protected readonly maxVideoMb = computed(() =>
    Math.round((this.mediaLimits()?.maxVideoBytes ?? 0) / (1024 * 1024)),
  );

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mediaError = signal<string | null>(null);
  protected readonly geoStatus = signal<string | null>(null);
  protected readonly pendingMedia = signal<PendingMedia[]>([]);
  protected reaction: string | null = null;
  protected statusText = '';
  protected consent = false;
  private latitude: number | null = null;
  private longitude: number | null = null;
  private activeUpload: { abort: () => void } | null = null;

  constructor() {
    // Bei jedem Öffnen frisch beginnen.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.reset();
        if (this.focusMedia() && this.isBrowser) {
          // Sobald der Dialog steht: zum Medienbereich springen, Kamera-Button fokussieren.
          setTimeout(() => {
            this.mediaSection()?.nativeElement.scrollIntoView?.({
              block: 'start',
              behavior: 'smooth',
            });
            this.photoInput()?.nativeElement.focus();
          });
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.activeUpload?.abort();
    this.clearPendingMedia();
  }

  protected close(): void {
    if (this.submitting()) this.activeUpload?.abort();
    this.clearPendingMedia();
    this.closed.emit();
  }

  /** Eine Reaktion ist optional; ein zweiter Tipp nimmt sie wieder weg. */
  protected toggleReaction(code: string): void {
    this.reaction = this.reaction === code ? null : code;
  }

  protected canSubmit(): boolean {
    return Boolean(this.reaction || this.statusText.trim() || this.pendingMedia().length > 0);
  }

  protected async onMediaSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const limits = this.mediaLimits();
    if (!limits || files.length === 0) return;
    this.mediaError.set(null);

    for (const file of files) {
      if (this.pendingMedia().length >= limits.maxMediaPerResponse) {
        this.mediaError.set(
          translate('moments.media.errors.tooMany', { count: limits.maxMediaPerResponse }),
        );
        break;
      }
      try {
        const media = await this.uploader.prepare(file, limits);
        this.pendingMedia.update((list) => [...list, { media, progress: null }]);
      } catch (error) {
        this.mediaError.set(
          error instanceof MediaPrepareError
            ? error.message
            : translate('moments.media.errors.unsupported'),
        );
      }
    }
  }

  protected removePendingMedia(index: number): void {
    const item = this.pendingMedia()[index];
    if (item) URL.revokeObjectURL(item.media.previewUrl);
    this.pendingMedia.update((list) => list.filter((_, i) => i !== index));
  }

  protected progressPercent(item: PendingMedia): number {
    return Math.round((item.progress ?? 0) * 100);
  }

  protected onConsentToggle(event: Event): void {
    this.consent = (event.target as HTMLInputElement).checked;
    this.latitude = null;
    this.longitude = null;
    if (!this.consent || !this.isBrowser || !navigator.geolocation) {
      this.geoStatus.set(null);
      return;
    }
    this.geoStatus.set(translate('moments.geo.locating'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.latitude = pos.coords.latitude;
        this.longitude = pos.coords.longitude;
        this.geoStatus.set(
          translate('moments.geo.captured', {
            lat: pos.coords.latitude.toFixed(2),
            lng: pos.coords.longitude.toFixed(2),
          }),
        );
      },
      () => this.geoStatus.set(translate('moments.geo.failed')),
    );
  }

  protected async submit(): Promise<void> {
    const momentId = this.momentId();
    if (!momentId || !this.canSubmit()) return;

    this.submitting.set(true);
    this.error.set(null);

    let mediaIds: string[];
    try {
      mediaIds = await this.uploadPendingMedia(momentId);
    } catch (err: unknown) {
      this.submitting.set(false);
      this.resetProgress();
      this.error.set(
        err instanceof ApiError ? err.message : translate('moments.media.errors.uploadFailed'),
      );
      return;
    }

    const payload: SubmitMomentResponseRequest = {
      reaction: this.reaction ?? undefined,
      statusText: this.statusText.trim() || undefined,
      consent: this.consent,
      latitude: this.latitude ?? undefined,
      longitude: this.longitude ?? undefined,
      mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
    };

    this.api.submitMomentResponse(momentId, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.clearPendingMedia();
        this.submitted.emit(momentId);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        // Hochgeladene Dateien bleiben serverseitig liegen und werden aufgeräumt;
        // beim erneuten Absenden werden sie neu hochgeladen.
        this.resetProgress();
        this.error.set(
          err instanceof ApiError
            ? err.message || translate('moments.respond.error')
            : translate('moments.respond.failed'),
        );
      },
    });
  }

  /** Lädt die gewählten Dateien nacheinander hoch und liefert ihre Kennungen. */
  private async uploadPendingMedia(momentId: string): Promise<string[]> {
    const ids: string[] = [];
    const items = this.pendingMedia();
    for (let index = 0; index < items.length; index++) {
      const setProgress = (fraction: number) =>
        this.pendingMedia.update((list) =>
          list.map((entry, i) => (i === index ? { ...entry, progress: fraction } : entry)),
        );
      setProgress(0);
      const upload = this.uploader.upload(
        momentId,
        items[index].media,
        this.i18n.language(),
        setProgress,
      );
      this.activeUpload = upload;
      try {
        ids.push((await upload.result).id);
      } finally {
        this.activeUpload = null;
      }
    }
    return ids;
  }

  private resetProgress(): void {
    this.pendingMedia.update((list) => list.map((entry) => ({ ...entry, progress: null })));
  }

  private clearPendingMedia(): void {
    if (this.isBrowser) {
      this.pendingMedia().forEach((item) => URL.revokeObjectURL(item.media.previewUrl));
    }
    this.pendingMedia.set([]);
  }

  private reset(): void {
    this.reaction = null;
    this.statusText = '';
    this.consent = false;
    this.latitude = null;
    this.longitude = null;
    this.geoStatus.set(null);
    this.error.set(null);
    this.mediaError.set(null);
    this.clearPendingMedia();
  }
}
