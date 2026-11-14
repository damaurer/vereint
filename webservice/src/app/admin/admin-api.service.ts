import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type { PagedResponse, UserSummary } from '../auth/auth.types';
import type {
  AdminUpdateUserPayload,
  AssignPermissionsPayload,
  AssignRolesPayload,
  AuditLogEntry,
  MemberProfile,
  UpdateUserStatusPayload,
  UserListQuery,
} from '../api/api.types';

/**
 * Fachlicher Datenzugriff der Administration (TICKET-026).
 *
 * Bündelt die adminseitigen Endpunkte: paginierte Benutzerliste, Benutzerdetails,
 * Rollen-, Berechtigungs- und Statusänderungen sowie den vollständigen Zugriff
 * auf das Audit-Protokoll. Der Service formuliert ausschließlich die Aufrufe an
 * den Express-Auslieferungs-Proxy (`/api/v1`); die verbindliche Autorisierung
 * (nur `admin`) erfolgt serverseitig im Spring-Fachservice (`deny by default`).
 */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly api = inject(ApiClient);

  private userPath(id: string): string {
    return `/users/${encodeURIComponent(id)}`;
  }

  /** Paginierte Benutzerliste (`GET /users`), optional gefiltert/gesucht. */
  listUsers(query: UserListQuery = {}): Observable<PagedResponse<UserSummary>> {
    const params = new URLSearchParams();
    if (query.search?.trim()) params.set('search', query.search.trim());
    if (query.role?.trim()) params.set('role', query.role.trim());
    if (query.disabled !== undefined) params.set('disabled', String(query.disabled));
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.size !== undefined) params.set('size', String(query.size));
    const suffix = params.toString();
    return this.api.get<PagedResponse<UserSummary>>(suffix ? `/users?${suffix}` : '/users');
  }

  /** Benutzerdetails inkl. Rollen und Permissions (`GET /users/{id}`). */
  getUser(userId: string): Observable<MemberProfile> {
    return this.api.get<MemberProfile>(this.userPath(userId));
  }

  /** Administrative Profil-/Statusänderung (`PUT /users/{id}`). */
  updateUser(userId: string, payload: AdminUpdateUserPayload): Observable<MemberProfile> {
    return this.api.put<MemberProfile>(this.userPath(userId), payload);
  }

  /** Rollen setzen (`PUT /users/{id}/roles`). */
  assignRoles(userId: string, payload: AssignRolesPayload): Observable<MemberProfile> {
    return this.api.put<MemberProfile>(`${this.userPath(userId)}/roles`, payload);
  }

  /** Permissions setzen (`PUT /users/{id}/permissions`). */
  assignPermissions(
    userId: string,
    payload: AssignPermissionsPayload,
  ): Observable<MemberProfile> {
    return this.api.put<MemberProfile>(`${this.userPath(userId)}/permissions`, payload);
  }

  /** Benutzer aktivieren/deaktivieren (`PUT /users/{id}/status`). */
  updateStatus(userId: string, payload: UpdateUserStatusPayload): Observable<MemberProfile> {
    return this.api.put<MemberProfile>(`${this.userPath(userId)}/status`, payload);
  }

  /** Vollständiges Audit-Protokoll (`GET /audit-logs`). */
  listAuditLogs(): Observable<PagedResponse<AuditLogEntry>> {
    return this.api.get<PagedResponse<AuditLogEntry>>('/audit-logs');
  }
}
