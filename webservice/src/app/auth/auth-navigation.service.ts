import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { defaultRouteForSession, STAMMTISCH_CHOICE_ROUTE } from './app-context';
import { AuthService } from './auth.service';
import { AuthSessionUser } from './auth.types';
import { RememberedLoginService } from './remembered-login.service';

/**
 * Zentrale App-Kontext-Navigation nach Login und Logout (TICKET-023).
 *
 * Die Navigation ist reine UX: Sie ergänzt die serverseitige
 * Zugriffskontrolle (Express-Access-Resolver, Spring-Boot-Fachservice), ersetzt
 * sie aber nie. Alle Ziele stammen aus `app-context.ts` und decken sich mit den
 * Serverquellen (`src/server/auth/redirect.ts`,
 * `authorization.middleware.ts`).
 */
@Injectable({ providedIn: 'root' })
export class AuthNavigationService {
  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly rememberedLogin: RememberedLoginService,
  ) {}

  /**
   * Ermittelt die Standard-Startseite des angemeldeten Benutzers und navigiert
   * dorthin. Ohne Session führt der Weg auf den Login.
   */
  async goToDefaultRoute(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;
    const session = await this.auth.getSession(true);
    if (!session) {
      this.redirectToLogin('');
      return false;
    }
    return this.router.navigateByUrl(defaultRouteForSession(session));
  }

  /**
   * Leitet nicht-authentifizierte Benutzer direkt an den Keycloak-Login weiter.
   * Ungültige oder unsichere URLs werden verworfen. Gibt stets `false` für
   * Router-Guards zurück.
   */
  redirectToLogin(requestedUrl?: string): false {
    if (!isPlatformBrowser(this.platformId)) return false;
    const safeUrl =
      requestedUrl && requestedUrl.startsWith('/') && !requestedUrl.startsWith('//')
        ? requestedUrl
        : undefined;
    this.auth.startLogin(safeUrl);
    return false;
  }

  /** UrlTree der kontextabhängigen Standard-Startseite (für Guards). */
  defaultRouteUrlTree(session: AuthSessionUser): UrlTree {
    return this.router.parseUrl(defaultRouteForSession(session));
  }

  /** Ziel für einen verweigerten Zugriff. */
  /** Ohne gewählten Stammtisch gibt es keine Rechte: erst auswählen. */
  stammtischChoiceUrlTree(returnTo?: string): UrlTree {
    const safe = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : undefined;
    return this.router.createUrlTree([STAMMTISCH_CHOICE_ROUTE], safe ? { queryParams: { returnTo: safe } } : {});
  }

  forbiddenUrlTree(): UrlTree {
    return this.router.parseUrl('/403');
  }

  /**
   * Meldet den Benutzer ab: beendet die Express-Session (inklusive
   * Keycloak-Backchannel-Logout), verwirft private Clientdaten und navigiert
   * auf `/auth/logged-out`.
   */
  async logout(): Promise<boolean> {
    await this.auth.signOut();
    this.rememberedLogin.forget();
    this.auth.clearClientState();
    if (!isPlatformBrowser(this.platformId)) return false;
    return this.router.navigateByUrl('/auth/logged-out');
  }
}
