import { Injectable } from '@angular/core';
import { translate } from '../i18n/i18n.service';
import { resizeImageToJpeg } from '../ui/image-resize';
import { STAMMTISCH_IMAGE_MAX_BYTES, STAMMTISCH_IMAGE_MAX_EDGE, STAMMTISCH_IMAGE_TYPES } from './stammtisch-api.service';

/** Ein geprüftes, verkleinertes Gruppenbild, bereit zum Hochladen. */
export interface PreparedGroupImage {
  blob: Blob;
  filename: string;
}

/** Fehler beim Vorbereiten; `message` ist bereits übersetzt. */
export class GroupImageError extends Error {}

/**
 * Prüft das gewählte Gruppenbild und verkleinert es im Browser auf höchstens
 * [STAMMTISCH_IMAGE_MAX_EDGE] Pixel als JPEG (wie die Fotos in Moments). Kann
 * der Browser das Bild nicht lesen, geht das Original hoch, sofern Format und
 * Größe passen; verbindlich prüft der Fachservice.
 */
@Injectable({ providedIn: 'root' })
export class GroupImagePreparer {
  async prepare(file: File): Promise<PreparedGroupImage> {
    const type = (file.type || '').toLowerCase();
    if (!STAMMTISCH_IMAGE_TYPES.includes(type)) {
      throw new GroupImageError(translate('stammtisch.settings.imageType'));
    }
    const resized = await this.resize(file);
    const blob = resized ?? file;
    if (blob.size > STAMMTISCH_IMAGE_MAX_BYTES) {
      throw new GroupImageError(
        translate('stammtisch.settings.imageTooLarge', { max: Math.round(STAMMTISCH_IMAGE_MAX_BYTES / (1024 * 1024)) }),
      );
    }
    return { blob, filename: resized ? 'gruppe.jpg' : file.name || 'gruppe' };
  }

  protected resize(file: Blob): Promise<Blob | null> {
    return resizeImageToJpeg(file, STAMMTISCH_IMAGE_MAX_EDGE);
  }
}
