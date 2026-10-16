import { Injectable } from '@angular/core';
import { API_BASE_PATH, ApiError } from '../api/api-client.service';
import type { MomentMediaDto, MomentMediaLimitsDto } from '../api/api.types';
import { translate } from '../i18n/i18n.service';

/**
 * Bilder und kurze Videos für Moment-Beiträge: Prüfen und Verkleinern im
 * Browser, dann Hochladen mit Fortschritt.
 *
 * Fotos werden vor dem Upload auf höchstens [MAX_IMAGE_EDGE] Pixel verkleinert
 * und als JPEG neu kodiert. Das spart Upload-Zeit und Speicher und entfernt
 * nebenbei EXIF/GPS (der Server entfernt sie zusätzlich). Videos lassen sich im
 * Browser nicht sinnvoll verkleinern; hier prüft die App Länge und Größe vorab,
 * damit niemand umsonst 100 MB hochlädt.
 */

/** Längste Bildkante nach dem Verkleinern. */
export const MAX_IMAGE_EDGE = 2048;
const JPEG_QUALITY = 0.85;

/** Eine ausgewählte, geprüfte Datei, bereit zum Hochladen. */
export interface PreparedMedia {
  kind: 'image' | 'video';
  blob: Blob;
  contentType: string;
  /** Lokale Vorschau-URL (`URL.revokeObjectURL` beim Entfernen). */
  previewUrl: string;
  name: string;
}

/** Fehler beim Vorbereiten; `message` ist bereits übersetzt. */
export class MediaPrepareError extends Error {}

const VIDEO_EXTENSIONS: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime' };

function mediaType(file: File): string {
  const type = (file.type || '').toLowerCase();
  if (type) return type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTENSIONS[extension] ?? '';
}

function megabytes(bytes: number): string {
  return String(Math.round(bytes / (1024 * 1024)));
}

/** Prüft und verkleinert eine vom Mitglied gewählte Datei. */
export async function prepareMedia(file: File, limits: MomentMediaLimitsDto): Promise<PreparedMedia> {
  const type = mediaType(file);
  if (type.startsWith('video/')) {
    if (!limits.videoTypes.includes(type)) {
      throw new MediaPrepareError(translate('moments.media.errors.videoType'));
    }
    if (file.size > limits.maxVideoBytes) {
      throw new MediaPrepareError(
        translate('moments.media.errors.videoTooLarge', { max: megabytes(limits.maxVideoBytes) }),
      );
    }
    const previewUrl = URL.createObjectURL(file);
    const duration = await readVideoDuration(previewUrl);
    if (duration !== null && duration > limits.maxVideoSeconds + 1) {
      URL.revokeObjectURL(previewUrl);
      throw new MediaPrepareError(
        translate('moments.media.errors.videoTooLong', { max: limits.maxVideoSeconds }),
      );
    }
    return { kind: 'video', blob: file, contentType: type, previewUrl, name: file.name };
  }

  if (type.startsWith('image/')) {
    // Animierte GIFs bleiben unverändert, alles andere wird zu JPEG.
    if (type === 'image/gif' && file.size <= limits.maxImageBytes) {
      return { kind: 'image', blob: file, contentType: type, previewUrl: URL.createObjectURL(file), name: file.name };
    }
    const resized = await resizeImage(file);
    const blob = resized ?? (limits.imageTypes.includes(type) ? file : null);
    if (!blob) throw new MediaPrepareError(translate('moments.media.errors.imageType'));
    if (blob.size > limits.maxImageBytes) {
      throw new MediaPrepareError(
        translate('moments.media.errors.imageTooLarge', { max: megabytes(limits.maxImageBytes) }),
      );
    }
    const contentType = resized ? 'image/jpeg' : type;
    return { kind: 'image', blob, contentType, previewUrl: URL.createObjectURL(blob), name: file.name };
  }

  throw new MediaPrepareError(translate('moments.media.errors.unsupported'));
}

/** Länge eines Videos in Sekunden; `null`, wenn der Browser sie nicht lesen kann (der Server prüft trotzdem). */
function readVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const done = (value: number | null) => {
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 10_000);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    video.src = url;
  });
}

/** Verkleinert ein Bild auf [MAX_IMAGE_EDGE] und kodiert es als JPEG; `null`, wenn der Browser es nicht lesen kann. */
async function resizeImage(file: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  } finally {
    bitmap.close();
  }
}

/** Laufender Upload: Ergebnis und Abbruch. */
export interface MediaUpload {
  result: Promise<MomentMediaDto>;
  abort: () => void;
}

/**
 * Lädt eine vorbereitete Datei als rohen Körper hoch
 * (`POST /api/v1/events/{eventId}/moments/{momentId}/media`).
 *
 * Bewusst `XMLHttpRequest`: Der `fetch`-basierte HttpClient der App meldet
 * keinen Upload-Fortschritt, und bei Videos will man den sehen.
 */
export function uploadMomentMedia(
  eventId: string,
  momentId: string,
  media: PreparedMedia,
  language: string,
  onProgress: (fraction: number) => void,
): MediaUpload {
  const xhr = new XMLHttpRequest();
  const result = new Promise<MomentMediaDto>((resolve, reject) => {
    xhr.open(
      'POST',
      `${API_BASE_PATH}/events/${encodeURIComponent(eventId)}/moments/${encodeURIComponent(momentId)}/media`,
    );
    xhr.setRequestHeader('Content-Type', media.contentType);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Accept-Language', language);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText || '{}') as Record<string, unknown>;
      } catch {
        body = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(body as unknown as MomentMediaDto);
        return;
      }
      const code = typeof body['code'] === 'string' ? body['code'] : `http_${xhr.status}`;
      const detail =
        typeof body['detail'] === 'string' && body['detail']
          ? body['detail']
          : xhr.status === 413
            ? translate('moments.media.errors.tooLargeServer')
            : translate('moments.media.errors.uploadFailed');
      reject(new ApiError(xhr.status, code, detail));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', translate('errors.api.network')));
    xhr.onabort = () => reject(new ApiError(0, 'aborted', translate('moments.media.errors.aborted')));
    xhr.send(media.blob);
  });
  return { result, abort: () => xhr.abort() };
}

/** Injizierbarer Zugang zu [prepareMedia] und [uploadMomentMedia] (in Tests ersetzbar). */
@Injectable({ providedIn: 'root' })
export class MomentMediaUploader {
  prepare(file: File, limits: MomentMediaLimitsDto): Promise<PreparedMedia> {
    return prepareMedia(file, limits);
  }

  upload(
    eventId: string,
    momentId: string,
    media: PreparedMedia,
    language: string,
    onProgress: (fraction: number) => void,
  ): MediaUpload {
    return uploadMomentMedia(eventId, momentId, media, language, onProgress);
  }
}
