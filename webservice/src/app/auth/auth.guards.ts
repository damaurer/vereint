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
import { UserRole } from './auth.types';

/**
 * Clientseitige Navigations-Guards (TICKET-023).
 *
 * Die Guards verbessern Navigation und UX: Sie leiten Unangemeldete auf den
 * passenden Login, verweigern unpassende Kontexte mit `/403` und halten Gäste
 * am Eventkontext. Sie sind ausdrücklich keine Sicherheitsgrenze — Express und
 * der Spring-Boot-Fachservice entscheiden jede Anfrage erneut (`deny by
 * default`, `docs/authentifizierung.md`, Abschnitt „Guards und SSR").
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
 * Startseite geführt, alle übrigen auf den öffentlichen Login. Beim
 * serverseitigen Rendern wird der Login ausgeliefert, damit kein
 * personenbezogenes Ziel im SSR-HTML entsteht.
 */
export const homeGuard: CanActivateFn = async (): Promise<GuardResult> => {
  const navigation = inject(AuthNavigationService);
  if (!isBrowser()) return navigation.loginUrlTree('');

  const auth = inject(AuthService);
  const session = await auth.getSession();
  return navigation.defaultRouteUrlTree(session);
};

/** Erzwingt eine angemeldete Session; sonst Umleitung auf den Login. */
export const authGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Promise<GuardResult> => {
  if (!isBrowser()) return true;

  const auth = inject(AuthService);
  const navigation = inject(AuthNavigationService);

  const session = await auth.getSession();
  if (session) return true;

  // Fehlende oder abgelaufene Session: zurück zum kontextpassenden Login.
  return navigation.loginUrlTree(state.url);
};

/**
 * Erzwingt mindestens eine der in `route.data['roles']` genannten Rollen.
 * Ohne Session führt der Weg zum Login (Sessionablauf), bei falscher Rolle
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
  if (!session) return navigation.loginUrlTree(state.url);

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
  if (!session) return navigation.loginUrlTree(state.url);

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
