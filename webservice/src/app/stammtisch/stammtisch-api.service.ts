import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient, ApiError, describeApiError } from '../api/api-client.service';

/** Eigene Mitgliedschaft (`GET /stammtische`), auch ohne gewählten Stammtisch abrufbar. */
export interface StammtischMembershipDto {
  id: string;
  name: string;
  roles: string[];
  boardRole: string | null;
}

/** Der aktuell gewählte Stammtisch (`GET /stammtisch`). */
export interface StammtischDto {
  id: string;
  name: string;
  memberCount: number;
  myRoles: string[];
  myPermissions: string[];
  createdAt: string;
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

/** Stammtisch aus Sicht der Plattform-Administration. */
export interface PlatformStammtischDto {
  id: string;
  name: string;
  archived: boolean;
  memberCount: number;
  createdAt: string;
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

  current(): Observable<StammtischDto> {
    return this.api.get<StammtischDto>('/stammtisch');
  }

  rename(name: string): Observable<StammtischDto> {
    return this.api.put<StammtischDto>('/stammtisch', { name });
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

/** Lokalisierte Meldung des Fachservice, sonst ein neutraler Text. */
export function apiErrorText(error: unknown): string {
  return (error instanceof ApiError && error.detail) || describeApiError(error);
}
