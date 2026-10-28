import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { API_BASE_PATH, ApiClient, ApiError, describeApiError } from '../api/api-client.service';

/** Eigene Mitgliedschaft (`GET /stammtische`), auch ohne gewählten Stammtisch abrufbar. */
export interface StammtischMembershipDto {
  id: string;
  name: string;
  roles: string[];
  boardRole: string | null;
  /** Version des Gruppenbilds; fehlt oder `null` = kein Bild. */
  imageVersion?: number | null;
}

/** Der aktuell gewählte Stammtisch (`GET /stammtisch`). */
export interface StammtischDto {
  id: string;
  name: string;
  memberCount: number;
  myRoles: string[];
  myPermissions: string[];
  createdAt: string;
  /** Version des Gruppenbilds; fehlt oder `null` = kein Bild. */
  imageVersion?: number | null;
}

/** Antwort von `PUT /stammtisch/image`. */
export interface StammtischImageDto {
  imageVersion: number;
}

/** Zulässige Formate des Gruppenbilds (der Fachservice prüft verbindlich). */
export const STAMMTISCH_IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/gif'];
/** Obergrenze des Fachservice für das Gruppenbild. */
export const STAMMTISCH_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Längste Kante nach dem Verkleinern im Browser. */
export const STAMMTISCH_IMAGE_MAX_EDGE = 1024;

/**
 * Adresse des Gruppenbilds (`GET /api/v1/stammtische/{id}/image`), mit der
 * Version als Cache-Schlüssel; `null`, solange die Gruppe kein Bild hat.
 * Mitglieder dürfen das Bild jeder ihrer Gruppen laden, auch ohne sie gewählt zu haben.
 */
export function stammtischImageUrl(id: string, imageVersion: number | null | undefined): string | null {
  if (typeof imageVersion !== 'number') return null;
  return `${API_BASE_PATH}/stammtische/${encodeURIComponent(id)}/image?v=${imageVersion}`;
}

export interface StammtischRoleDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
  systemRole: boolean;
  sortOrder: number;
  memberCount: number;
}

export interface StammtischRolesDto {
  roles: StammtischRoleDto[];
  knownPermissions: string[];
}

export interface SaveStammtischRoleRequest {
  code?: string;
  name: string;
  description?: string | null;
  permissions: string[];
  sortOrder?: number;
}

/** Datenexport als JSON-Datei; der Browser lädt ihn direkt über den Proxy herunter. */
export const STAMMTISCH_EXPORT_URL = `${API_BASE_PATH}/stammtisch/export`;

/** Stammtisch aus Sicht der Plattform-Administration. */
export interface PlatformStammtischDto {
  id: string;
  name: string;
  archived: boolean;
  memberCount: number;
  createdAt: string;
  storageBytes: number;
  /** Version des Gruppenbilds; fehlt oder `null` = kein Bild. */
  imageVersion?: number | null;
}

export interface CreateStammtischRequest {
  name: string;
  adminEmail?: string;
}

export interface UpdatePlatformStammtischRequest {
  name?: string;
  archived?: boolean;
}

/** Antwort von `POST /member-invites/join`. */
export interface JoinStammtischResult {
  stammtischId: string;
  stammtischName: string;
  alreadyMember: boolean;
}

/** Öffentliche Eröffnung samt neuem Konto (`POST /signup`). */
export interface SignupRequest {
  stammtischName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Zustimmung zu den AGB; der Fachservice speichert die gültige Fassung. */
  acceptTerms: boolean;
}

export interface SignupResult {
  email: string;
  displayName: string;
  stammtischId: string;
  stammtischName: string;
}

/** Antwort von `POST /stammtische`: der neue Stammtisch, die Person ist Admin. */
export interface CreatedStammtischDto {
  id: string;
  name: string;
  roles: string[];
}

/**
 * Stammtische: eigene Mitgliedschaften, Einstellungen und Rollen des gewählten
 * Stammtischs sowie die Plattform-Administration. Welcher Stammtisch gewählt
 * ist, hält Express im HttpOnly-Cookie und reicht ihn an den Fachservice weiter.
 */
@Injectable({ providedIn: 'root' })
export class StammtischApiService {
  private readonly api = inject(ApiClient);

  listMine(): Observable<StammtischMembershipDto[]> {
    return this.api.get<StammtischMembershipDto[]>('/stammtische');
  }

  /** Eigenen Stammtisch eröffnen (angemeldet, AGB zugestimmt); höchstens drei je Person. */
  createOwn(name: string): Observable<CreatedStammtischDto> {
    return this.api.post<CreatedStammtischDto>('/stammtische', { name, acceptTerms: true });
  }

  /** Stammtisch samt Konto eröffnen, ohne Anmeldung. Danach normal anmelden. */
  signup(request: SignupRequest): Observable<SignupResult> {
    return this.api.post<SignupResult>('/signup', request);
  }

  current(): Observable<StammtischDto> {
    return this.api.get<StammtischDto>('/stammtisch');
  }

  rename(name: string): Observable<StammtischDto> {
    return this.api.put<StammtischDto>('/stammtisch', { name });
  }

  /** Gruppenbild hochladen (`stammtisch.manage`); Feld `file`, PNG, JPEG oder GIF. */
  uploadImage(file: Blob, filename = 'gruppe.jpg'): Observable<StammtischImageDto> {
    const form = new FormData();
    form.append('file', file, filename);
    return this.api.put<StammtischImageDto>('/stammtisch/image', form);
  }

  removeImage(): Observable<void> {
    return this.api.delete<void>('/stammtisch/image');
  }

  leave(): Observable<void> {
    return this.api.post<void>('/stammtisch/leave', {});
  }

  roles(): Observable<StammtischRolesDto> {
    return this.api.get<StammtischRolesDto>('/stammtisch/roles');
  }

  createRole(request: SaveStammtischRoleRequest): Observable<StammtischRoleDto> {
    return this.api.post<StammtischRoleDto>('/stammtisch/roles', request);
  }

  updateRole(id: string, request: SaveStammtischRoleRequest): Observable<StammtischRoleDto> {
    return this.api.put<StammtischRoleDto>(`/stammtisch/roles/${encodeURIComponent(id)}`, request);
  }

  deleteRole(id: string): Observable<void> {
    return this.api.delete<void>(`/stammtisch/roles/${encodeURIComponent(id)}`);
  }

  platformList(): Observable<PlatformStammtischDto[]> {
    return this.api.get<PlatformStammtischDto[]>('/platform/stammtische');
  }

  platformCreate(request: CreateStammtischRequest): Observable<PlatformStammtischDto> {
    return this.api.post<PlatformStammtischDto>('/platform/stammtische', request);
  }

  platformUpdate(id: string, request: UpdatePlatformStammtischRequest): Observable<PlatformStammtischDto> {
    return this.api.put<PlatformStammtischDto>(`/platform/stammtische/${encodeURIComponent(id)}`, request);
  }

  /** Mit einem Einladungslink einem weiteren Stammtisch beitreten (angemeldet). */
  join(token: string): Observable<JoinStammtischResult> {
    return this.api.post<JoinStammtischResult>('/member-invites/join', { token });
  }
}

/** Codes, deren Text die App selbst formuliert (mit Hinweis, was weiterhilft). */
const APP_TEXT_CODES = new Set(['stammtisch_limit']);

/** Lokalisierte Meldung des Fachservice, sonst ein neutraler Text. */
export function apiErrorText(error: unknown): string {
  if (error instanceof ApiError && APP_TEXT_CODES.has(error.code)) return describeApiError(error);
  return (error instanceof ApiError && error.detail) || describeApiError(error);
}
