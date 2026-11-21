import { Injectable } from '@angular/core';
import type { ChatMedia, MomentMediaLimitsDto } from '../api/api.types';
import { prepareMedia, uploadMediaFile, type PreparedMedia } from '../moments/moment-media';

/**
 * Grenzen für Fotos und Videos im Chat; dieselben wie bei Moments
 * (Fachservice `MediaStore`): Fotos bis 10 MB, Videos MP4/MOV bis 60 Sekunden
 * und 100 MB, höchstens vier je Nachricht.
 */
export const CHAT_MEDIA_LIMITS: MomentMediaLimitsDto = {
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 100 * 1024 * 1024,
  maxVideoSeconds: 60,
  maxMediaPerResponse: 4,
  imageTypes: ['image/jpeg', 'image/png', 'image/gif'],
  videoTypes: ['video/mp4', 'video/quicktime'],
};

/** Auswahl im Dateidialog. */
export const CHAT_MEDIA_ACCEPT = 'image/*,video/mp4,video/quicktime';

/** Prüfen, verkleinern und hochladen von Chat-Anhängen (in Tests ersetzbar). */
@Injectable({ providedIn: 'root' })
export class ChatMediaUploader {
  prepare(file: File): Promise<PreparedMedia> {
    return prepareMedia(file, CHAT_MEDIA_LIMITS);
  }

  upload(
    target: { path: string; headers: Record<string, string> },
    media: PreparedMedia,
    language: string,
    onProgress: (fraction: number) => void,
  ): { result: Promise<ChatMedia>; abort: () => void } {
    return uploadMediaFile<ChatMedia>(target.path, media, language, onProgress, target.headers);
  }
}
