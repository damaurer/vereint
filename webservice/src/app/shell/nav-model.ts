import { AuthSessionUser, UserRole } from '../auth/auth.types';

/**
 * Navigationsmodell der responsiven `AppShell` (TICKET-032).
 *
 * Die Einträge werden anhand von Rolle/Permission der bereits serverseitig
 * freigegebenen Session gefiltert (`deny by default`). Dieses Modell steuert
 * ausschließlich Navigation und UX; die eigentliche Autorisierung bleibt bei
 * den Angular-Guards (Client-UX) und beim Spring-Boot-Fachservice.
 */
export interface NavItem {
  /** Stabile Kennung, u. a. für Tests und `trackBy`. */
  id: string;
  /** Sichtbares Label (Sidebar/Bottom-Bar) bzw. `aria-label` (Icon-Rail). */
  label: string;
  /** Symbol-Glyphe für Bottom-Bar und Icon-Rail. */
  icon: string;
  /** Zielroute (absoluter Pfad). */
  route: string;
  /** Erfüllt, wenn die Session eine dieser Rollen besitzt. */
  requiredRoles?: UserRole[];
  /** Erfüllt, wenn die Session alle dieser Permissions besitzt. */
  requiredPermissions?: string[];
}

/** Permission, die den Zugriff auf die Statistiken fvereintaltet. */
export const STATISTICS_PERMISSION = 'statistics.view';

/** Permission, die die Tablet-Erfassung fvereintaltet. */
export const TABLET_PERMISSION = 'purchase.tablet';

/**
 * Primäre Navigation (Bottom-Tab-Bar mobil / Icon-Rail Tablet / Sidebar-Kopf).
 * Home, Strichliste, Chat, Statistik und Profil.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { id: 'home', label: 'Home', icon: '🏠', route: '/dashboard' },
  { id: 'strichliste', label: 'Strichliste', icon: '📋', route: '/events' },
  { id: 'chat', label: 'Chat', icon: '💬', route: '/chat' },
  {
    id: 'statistik',
    label: 'Statistik',
    icon: '📊',
    route: '/statistik',
    requiredPermissions: [STATISTICS_PERMISSION],
  },
  { id: 'profil', label: 'Profil', icon: '👤', route: '/profile' },
];

/**
 * Rollenspezifische Panels (Sidebar-Fuß Web / erweiterte Rail Tablet).
 * Vorstand, Kasse, Kommunikation, Administration und Terminal.
 */
export const PANEL_NAV: readonly NavItem[] = [
  { id: 'board', label: 'Vorstand', icon: '⭐', route: '/board', requiredRoles: ['board', 'admin'] },
  {
    id: 'treasury',
    label: 'Kasse & Finanzen',
    icon: '💰',
    route: '/board/treasury',
    requiredRoles: ['board', 'admin'],
  },
  {
    id: 'communications',
    label: 'Kommunikation',
    icon: '📣',
    route: '/board/communications',
    requiredRoles: ['board', 'admin'],
  },
  { id: 'admin', label: 'Administration', icon: '🛠️', route: '/admin', requiredRoles: ['admin'] },
  {
    id: 'tablet',
    label: 'Terminal',
    icon: '🍺',
    route: '/tablet',
    requiredPermissions: [TABLET_PERMISSION],
  },
];

/**
 * Prüft, ob ein Eintrag für die Session sichtbar ist. Ohne Session sind nur
 * Einträge ohne jede Anforderung sichtbar; jede fehlende Rolle/Permission
 * blendet den Eintrag aus (`deny by default`).
 */
export function isNavItemVisible(item: NavItem, session: AuthSessionUser | null): boolean {
  const hasRequirements = Boolean(item.requiredRoles || item.requiredPermissions);
  if (!session) return !hasRequirements;

  if (item.requiredRoles) {
    const roles = session.roles ?? [];
    if (!item.requiredRoles.some((role) => roles.includes(role))) return false;
  }
  if (item.requiredPermissions) {
    const permissions = session.permissions ?? [];
    if (!item.requiredPermissions.every((permission) => permissions.includes(permission))) {
      return false;
    }
  }
  return true;
}

/** Filtert eine Eintragsliste anhand der Session (`deny by default`). */
export function filterNavItems(
  items: readonly NavItem[],
  session: AuthSessionUser | null,
): NavItem[] {
  return items.filter((item) => isNavItemVisible(item, session));
}

/** Sichtbare primäre Navigationseinträge. */
export function buildPrimaryNav(session: AuthSessionUser | null): NavItem[] {
  return filterNavItems(PRIMARY_NAV, session);
}

/** Sichtbare rollenspezifische Panel-Einträge. */
export function buildPanelNav(session: AuthSessionUser | null): NavItem[] {
  return filterNavItems(PANEL_NAV, session);
}
