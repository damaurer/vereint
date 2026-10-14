import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';

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

/** Benutzertexte für die Fehlercodes rund um Einladungslinks. */
export function describeInviteError(code: string): string | null {
  switch (code) {
    case 'not_found':
      return 'Dieser Einladungslink ist ungültig. Bitte prüfe, ob du den ganzen Link geöffnet hast.';
    case 'invitation_expired':
      return 'Dieser Einladungslink ist abgelaufen. Bitte den Vorstand um einen neuen Link.';
    case 'invitation_revoked':
      return 'Dieser Einladungslink wurde zurückgezogen. Bitte den Vorstand um einen neuen Link.';
    case 'invitation_used_up':
      return 'Dieser Einladungslink wurde schon verwendet. Bitte den Vorstand um einen neuen Link.';
    case 'email_already_registered':
      return 'Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich damit an oder setze dein Passwort zurück.';
    case 'password_rejected':
      return 'Das Passwort erfüllt die Vorgaben nicht. Bitte wähle ein längeres Passwort.';
    case 'registration_unavailable':
      return 'Die Registrierung ist gerade nicht möglich. Bitte versuche es später noch einmal.';
    default:
      return null;
  }
}
