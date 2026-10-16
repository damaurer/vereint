import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { translate } from '../i18n/i18n.service';
import { AuthMeResponse, AuthSessionUser } from './auth.types';

/**
 * Anmeldung über Keycloak.
 *
 * Der Browser besitzt keine Anmeldedaten und kein Token: Der Login startet den
 * OIDC-Authorization-Code-Flow mit PKCE in Express (`GET /api/auth/login`),
 * Keycloak authentifiziert, und Express legt die HttpOnly-Session an. Der
 * frühere Firebase-Pfad mit `POST /api/auth/session` ist entfallen; der
 * Endpunkt antwortet mit `410` (siehe `docs/authentifizierung.md`).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  /**
   * Kurzlebiger Cache der laufenden Sessionabfrage. Guards und Navigation lesen
   * die Session innerhalb einer Navigation mehrfach; ohne Bündelung entstünden
   * mehrere `GET /api/auth/me`-Aufrufe. Der Cache hält ausschließlich die
   * bereits vom Server freigegebene, tokenfreie Identität.
   */
  private sessionRequest: Promise<AuthSessionUser | null> | null = null;

  /** Der Anmeldeweg ist eine Serverumleitung und damit nur im Browser nutzbar. */
  isAvailable(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /**
   * Baut das Ziel des Anmeldestarts. Ein Rücksprungziel wird ausschließlich als
   * relativer Pfad übergeben; Express validiert es erneut
   * (`src/server/auth/redirect.ts`).
   */
  buildLoginUrl(returnTo?: string | null): string {
    if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
      return '/api/auth/login';
    }
    return `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  }

  /** Startet den Keycloak-Login durch Verlassen der Anwendung. */
  startLogin(returnTo?: string | null): void {
    if (!this.isAvailable()) throw new Error('auth-browser-only');
    globalThis.location.assign(this.buildLoginUrl(returnTo));
  }

  /** Liest die aktuelle Session; `null`, wenn keine Session besteht. */
  async loadSession(): Promise<AuthSessionUser | null> {
    if (!this.isAvailable()) return null;

    const response = await fetch('/api/auth/me', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { authenticated?: boolean; identity?: AuthMeResponse };
    if (!body.authenticated || !body.identity) return null;

    return {
      uid: body.identity.subject,
      email: null,
      displayName: body.identity.displayName,
      provider: 'keycloak',
      roles: body.identity.roles,
      boardRole: body.identity.boardRole ?? undefined,
      permissions: body.identity.permissions ?? [],
      stammtisch: body.identity.stammtisch,
      memberships: body.identity.memberships,
      platformAdmin: body.identity.platformAdmin,
      appContexts: body.identity.appContexts,
    };
  }

  /**
   * Wählt den Stammtisch dieser Session (`null` hebt die Auswahl auf). Express
   * merkt ihn sich im HttpOnly-Cookie; der Fachservice prüft die Mitgliedschaft.
   */
  async selectStammtisch(stammtischId: string | null): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const response = await fetch('/api/auth/stammtisch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ stammtischId }),
    }).catch(() => null);
    this.clearClientState();
    return response?.ok === true;
  }

  /**
   * Liefert die Session und bündelt parallele Abfragen einer Navigation. Die
   * Entscheidung bleibt serverseitig (`deny by default`); dieser Wert steuert
   * ausschließlich die clientseitige Navigation und UX. `force` erzwingt eine
   * frische Abfrage, etwa nach einem `403`.
   */
  getSession(force = false): Promise<AuthSessionUser | null> {
    if (!this.isAvailable()) return Promise.resolve(null);
    if (force || !this.sessionRequest) {
      this.sessionRequest = this.loadSession().catch(() => null);
    }
    return this.sessionRequest;
  }

  /** Beendet die Session serverseitig inklusive Keycloak-Backchannel-Logout. */
  async signOut(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    this.clearClientState();
  }

  /**
   * Verwirft zwischengespeicherte Sessioninformationen im Client. Tokens werden
   * ohnehin nur serverseitig gehalten; hier wird lediglich der kurzlebige
   * Identitäts-Cache invalidiert, damit nach Logout keine veraltete Navigation
   * erfolgt (siehe `docs/authentifizierung.md`, „Logout").
   */
  clearClientState(): void {
    this.sessionRequest = null;
  }

  /** Übersetzt die Fehlercodes der Anmeldeumleitung in Benutzertexte. */
  describeError(error: unknown): string {
    switch (this.errorCode(error)) {
      case 'invalid_state':
        return translate('auth.errors.invalidState');
      case 'oidc_session_expired':
        return translate('errors.api.sessionExpired');
      case 'account_disabled':
        return translate('auth.errors.accountDisabled');
      case 'oidc_login_failed':
        return translate('auth.errors.oidcLoginFailed');
      case 'auth-browser-only':
        return translate('auth.errors.browserOnly');
      default:
        return translate('auth.errors.generic');
    }
  }

  errorCode(error: unknown): string {
    if (typeof error === 'string') return error;
    const code = (error as { code?: unknown; message?: unknown } | null)?.code;
    if (typeof code === 'string') return code;
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === 'string' ? message : '';
  }
}
