import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  GuardResult,
  RouterStateSnapshot,
} from '@angular/router';
import { AuthNavigationService } from './auth-navigation.service';
import { AuthService } from './auth.service';
import { AppContext, UserRole } from './auth.types';

/**
 * Clientseitige Navigations-Guards (TICKET-023).
 *
 * Die Guards verbessern Navigation und UX: Sie leiten Unangemeldete auf den
 * passenden Login, verweigern unpassende Kontexte mit `/403` und halten Gäste
 * am Eventkontext. Sie sind ausdrücklich keine Sicherheitsgrenze — Express und
 * der Spring-Boot-Fachservice entscheiden jede Anfrage erneut (`deny by
 * default`, `docs/backend-for-frontend/04-authorization.md`).
 *
 * Beim serverseitigen Rendern lassen die Guards passieren: Die Express-Middleware
 * hat den Zugriff dort bereits geprüft, und private Kontexte werden ohnehin im
 * Browser gerendert (TICKET-007).
 */

function isBrowser(): boolean {
  return isPlatformBrowser(inject(PLATFORM_ID));
}

/**
 * Default-Route (`''`): Angemeldete Benutzer werden auf ihre kontextabhängige
 * Startseite geführt, alle übrigen auf den Keycloak-Login. Beim
 * serverseitigen Rendern wird `true` geliefert; die Express-Middleware hat
 * den Zugriff bereits geprüft bzw. leitet weiter.
 */
export const homeGuard: CanActivateFn = async (): Promise<GuardResult> => {
  if (!isBrowser()) return true;

  const auth = inject(AuthService);
  const navigation = inject(AuthNavigationService);
  const session = await auth.getSession();
  if (!session) {
    return navigation.redirectToLogin('');
  }
  return navigation.defaultRouteUrlTree(session);
};

/** Erzwingt eine angemeldete Session; sonst direkte Umleitung auf den Keycloak-Login. */
export const authGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<GuardResult> => {
  if (!isBrowser()) return true;

  const auth = inject(AuthService);
  const navigation = inject(AuthNavigationService);

  const session = await auth.getSession();
  if (!session) return navigation.redirectToLogin(state.url);
  if (session.stammtisch === null) return navigation.stammtischChoiceUrlTree(state.url);
  return true;
};

/**
 * Nur Anmeldung, ohne gewählten Stammtisch: Auswahlseite, Stammtisch beitreten
 * und Plattformverwaltung.
 */
export const signedInGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<GuardResult> => {
  if (!isBrowser()) return true;

  const auth = inject(AuthService);
  const navigation = inject(AuthNavigationService);
  const session = await auth.getSession();
  return session ? true : navigation.redirectToLogin(state.url);
};

/**
 * Prüft den App-Kontext (`data.appContext`) im gewählten Stammtisch. Rollen
 * sind je Stammtisch frei definierbar; maßgeblich sind die vom Fachservice
 * freigegebenen Kontexte. Fehlen sie (ältere Session), gelten `data.roles`.
 */
export const contextGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<GuardResult> => {
  if (!isBrowser()) return true;

  const auth = inject(AuthService);
  const navigation = inject(AuthNavigationService);

  const session = await auth.getSession();
  if (!session) return navigation.redirectToLogin(state.url);

  const context = route.data['appContext'] as AppContext | undefined;
  if (context && session.appContexts) {
    return session.appContexts.includes(context) ? true : navigation.forbiddenUrlTree();
  }
  const required = (route.data['roles'] as UserRole[] | undefined) ?? [];
  const roles = session.roles ?? [];
  if (required.length === 0 || required.some((role) => roles.includes(role))) return true;
  return navigation.forbiddenUrlTree();
};

/** Plattformverwaltung: nur Plattform-Admins (Keycloak-Realmrolle `admin`). */
export const platformGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<GuardResult> => {
  if (!isBrowser()) return true;

  const auth = inject(AuthService);
  const navigation = inject(AuthNavigationService);
  const session = await auth.getSession();
  if (!session) return navigation.redirectToLogin(state.url);
  return session.platformAdmin ? true : navigation.forbiddenUrlTree();
};

/**
 * Erzwingt mindestens eine der in `route.data['roles']` genannten Rollen.
 * Ohne Session führt der Weg direkt zum Login (Sessionablauf), bei falscher Rolle
 * auf `/403`.
 */
export const roleGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<GuardResult> => {
  if (!isBrowser()) return true;

  const auth = inject(AuthService);
  const navigation = inject(AuthNavigationService);

  const required = (route.data['roles'] as UserRole[] | undefined) ?? [];
  const session = await auth.getSession();
  if (!session) return navigation.redirectToLogin(state.url);

  const roles = session.roles ?? [];
  if (required.length === 0 || required.some((role) => roles.includes(role))) return true;

  return navigation.forbiddenUrlTree();
};

/**
 * Erzwingt mindestens eine der in `route.data['permissions']` genannten
 * fachlichen Permissions (zum Beispiel `purchase.tablet` für die Tablet-
 * Erfassung). Ohne Session führt der Weg zum Login, sonst auf `/403`.
 */
export const permissionGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<GuardResult> => {
  if (!isBrowser()) return true;

  const auth = inject(AuthService);
  const navigation = inject(AuthNavigationService);

  const required = (route.data['permissions'] as string[] | undefined) ?? [];
  const session = await auth.getSession();
  if (!session) return navigation.redirectToLogin(state.url);

  const permissions = session.permissions ?? [];
  if (required.length === 0 || required.some((permission) => permissions.includes(permission))) {
    return true;
  }

  return navigation.forbiddenUrlTree();
};

/**
 * Gastübergang: Der eventgebundene Gastkontext (`/guest/:eventId`) benötigt ein
 * Gast-Token im Query-Parameter `token`. Fehlt es, ist der Zugang aus
 * Client-Sicht unvollständig und führt auf `/403`; die eigentliche Prüfung des
 * Tokens erfolgt serverseitig über `POST /api/v1/auth/access/guest`.
 */
export const guestGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
): Promise<GuardResult> => {
  if (!isBrowser()) return true;

  const navigation = inject(AuthNavigationService);
  const token = route.queryParamMap.get('token');
  if (token && token.trim().length > 0) return true;

  return navigation.forbiddenUrlTree();
};
