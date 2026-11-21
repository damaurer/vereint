import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '../i18n';
import { IconComponent } from '../ui/icon.component';

/** Ein Foto oder Video im Raster: gesendet (Server-Adresse) oder als Entwurf (lokale Vorschau). */
export interface ChatMediaTile {
  key: string;
  kind: 'image' | 'video';
  src: string;
  /** Entwurf: Upload-Fortschritt 0..1; fehlt, wenn fertig hochgeladen oder schon gesendet. */
  progress?: number | null;
  failed?: boolean;
  /** Entwurf: mit ✕ entfernbar. */
  removable?: boolean;
  /** Seitenverhältnis (Breite/Höhe), damit der Platz schon vor dem Laden feststeht. */
  ratio?: number | null;
}

/**
 * Fotos und Videos einer Nachricht wie bei bekannten Messengern: eines groß,
 * mehrere als Raster. Fotos öffnen sich in voller Größe, Videos spielen direkt.
 * Im Composer zeigt dasselbe Raster die Anhänge mit Fortschritt.
 */
@Component({
  selector: 'app-chat-media-grid',
  imports: [IconComponent, TranslatePipe],
  template: `
    <div class="media-grid" [class.is-single]="tiles.length === 1" [class.is-draft]="draft">
      @for (tile of tiles; track tile.key) {
        <figure class="media-tile" [class.is-failed]="tile.failed" [style.aspect-ratio]="tiles.length === 1 && !draft && tile.ratio ? tile.ratio : null">
          @if (tile.kind === 'video') {
            <video
              class="media-content"
              [src]="tile.src"
              [attr.controls]="draft ? null : ''"
              preload="metadata"
              playsinline
              (loadedmetadata)="loaded.emit()"
              [attr.aria-label]="'chat.media.video' | t"
            ></video>
            @if (draft) {
              <span class="media-badge" aria-hidden="true"><vereint-icon name="video" /></span>
            }
          } @else if (draft) {
            <img class="media-content" [src]="tile.src" [alt]="'chat.media.photo' | t" />
          } @else {
            <a class="media-link" [href]="tile.src" target="_blank" rel="noopener" [attr.aria-label]="'chat.media.open' | t">
              <img class="media-content" [src]="tile.src" [alt]="'chat.media.photo' | t" (load)="loaded.emit()" />
            </a>
          }
          @if (tile.progress !== undefined && tile.progress !== null && tile.progress < 1 && !tile.failed) {
            <span class="media-progress" role="progressbar" [attr.aria-valuenow]="percent(tile.progress)" aria-valuemin="0" aria-valuemax="100">
              <span class="media-progress-bar" [style.width.%]="percent(tile.progress)"></span>
            </span>
          }
          @if (tile.failed) {
            <span class="media-failed" role="alert">{{ 'chat.composer.uploadFailed' | t }}</span>
          }
          @if (tile.removable) {
            <button type="button" class="media-remove" [attr.aria-label]="'chat.composer.removeMedia' | t" (click)="remove.emit(tile.key)">
              <vereint-icon name="close" />
            </button>
          }
        </figure>
      }
    </div>
  `,
  styles: [
    `
      .media-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.25rem;
        width: 18rem;
        max-width: 100%;
        margin-top: 0.3rem;
      }
      .media-grid.is-single {
        grid-template-columns: minmax(0, 1fr);
      }
      .media-grid.is-draft {
        display: flex;
        width: auto;
        margin: 0;
        overflow-x: auto;
      }
      .media-tile {
        position: relative;
        margin: 0;
        overflow: hidden;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-subtle);
        aspect-ratio: 1;
      }
      .media-grid.is-single .media-tile {
        aspect-ratio: auto;
      }
      .media-grid.is-draft .media-tile {
        flex: none;
        width: 4.5rem;
        height: 4.5rem;
      }
      .media-link {
        display: block;
        height: 100%;
      }
      .media-content {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .media-grid.is-single .media-tile {
        max-height: 22rem;
      }
      .media-grid.is-single .media-content {
        object-fit: contain;
        background-color: #000;
      }
      .media-grid.is-single img.media-content {
        background: none;
      }
      .media-badge {
        position: absolute;
        left: 0.25rem;
        bottom: 0.25rem;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
      }
      .media-progress {
        position: absolute;
        left: 0.3rem;
        right: 0.3rem;
        bottom: 0.3rem;
        height: 0.3rem;
        border-radius: 999px;
        background-color: rgba(255, 255, 255, 0.6);
      }
      .media-progress-bar {
        display: block;
        height: 100%;
        border-radius: 999px;
        background-color: var(--color-brand);
      }
      .media-failed {
        position: absolute;
        inset: auto 0 0;
        padding: 0.15rem;
        background-color: var(--color-danger, #c0392b);
        color: #fff;
        font-size: 0.65rem;
        text-align: center;
      }
      .media-remove {
        position: absolute;
        top: 0.2rem;
        right: 0.2rem;
        display: grid;
        place-items: center;
        width: 1.5rem;
        height: 1.5rem;
        border: none;
        border-radius: 50%;
        background-color: rgba(0, 0, 0, 0.6);
        color: #fff;
        font-size: 0.75rem;
        cursor: pointer;
      }
    `,
  ],
})
export class ChatMediaGridComponent {
  @Input({ required: true }) tiles: ChatMediaTile[] = [];
  /** Composer-Vorschau statt gesendeter Nachricht. */
  @Input() draft = false;
  @Output() readonly remove = new EventEmitter<string>();
  /** Ein Foto/Video ist geladen (Höhe kann sich geändert haben). */
  @Output() readonly loaded = new EventEmitter<void>();

  protected percent(progress: number): number {
    return Math.round(progress * 100);
  }
}
