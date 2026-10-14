import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import { translate } from '../i18n';

export type MemberInviteStatus = 'active' | 'used' | 'expired' | 'revoked';

export interface MemberInvite {
  id: string;
  label: string | null;
  status: MemberInviteStatus;
  maxUses: number;
  usesCount: number;
  expiresAt: string;
  createdAt: string;
  createdByName: string | null;
  revokedAt: string | null;
  registeredMembers: string[];
}

export interface CreateMemberInvitePayload {
  label?: string;
  expiresInDays?: number;
  maxUses?: number;
}

/** `token` und `registerPath` liefert der Fachservice nur dieses eine Mal. */
export interface CreatedMemberInvite {
  invite: MemberInvite;
  token: string;
  registerPath: string;
}

export interface RegisterMemberPayload {
  token: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/**
 * Einladungslinks für neue Mitglieder. Verwalten dürfen nur Vorstand und
 * Administration; `preview` und `register` sind öffentlich, das Token steht
 * dabei ausschließlich im Request-Body.
 */
@Injectable({ providedIn: 'root' })
export class MemberInvitesApiService {
  private readonly api = inject(ApiClient);

  list(): Observable<MemberInvite[]> {
    return this.api.get<MemberInvite[]>('/member-invites');
  }

  create(payload: CreateMemberInvitePayload): Observable<CreatedMemberInvite> {
    return this.api.post<CreatedMemberInvite>('/member-invites', payload);
  }

  revoke(id: string): Observable<MemberInvite> {
    return this.api.delete<MemberInvite>(`/member-invites/${encodeURIComponent(id)}`);
  }

  preview(token: string): Observable<{ expiresAt: string }> {
    return this.api.post<{ expiresAt: string }>('/member-invites/preview', { token });
  }

  register(payload: RegisterMemberPayload): Observable<{ email: string; displayName: string }> {
    return this.api.post<{ email: string; displayName: string }>('/member-invites/register', payload);
  }
}

const INVITE_ERROR_KEYS: Readonly<Record<string, string>> = {
  not_found: 'notFound',
  invitation_expired: 'expired',
  invitation_revoked: 'revoked',
  invitation_used_up: 'usedUp',
  email_already_registered: 'emailTaken',
  password_rejected: 'passwordRejected',
  registration_unavailable: 'unavailable',
};

/** Benutzertexte für die Fehlercodes rund um Einladungslinks. */
export function describeInviteError(code: string): string | null {
  const key = Object.hasOwn(INVITE_ERROR_KEYS, code) ? INVITE_ERROR_KEYS[code] : undefined;
  return key ? translate(`admin.invite.errors.${key}`) : null;
}
