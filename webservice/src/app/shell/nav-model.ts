import { AppContext, AuthSessionUser, UserRole } from '../auth/auth.types';
import type { IconName } from '../ui/icons';

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
  /** Übersetzungsschlüssel des sichtbaren Labels (Sidebar/Bottom-Bar) bzw. `aria-label` (Icon-Rail). */
  labelKey: string;
  /** Icon aus dem Vereint-Icon-Set. */
  icon: IconName;
  /** Zielroute (absoluter Pfad). */
  route: string;
  /** Erfüllt, wenn die Session eine dieser Rollen besitzt. */
  requiredRoles?: UserRole[];
  /** Erfüllt, wenn die Session alle dieser Permissions besitzt. */
  requiredPermissions?: string[];
  /** Vom Fachservice freigegebener App-Kontext im gewählten Stammtisch; geht vor `requiredRoles`. */
  requiredContext?: AppContext;
}

/**
 * Frühere Permission der Statistik. Die Statistik ist inzwischen für alle
 * Angemeldeten sichtbar; die Konstante bleibt für bestehende Importe erhalten.
 */
export const STATISTICS_PERMISSION = 'statistics.view';

/** Permission, die die Tablet-Erfassung freischaltet. */
export const TABLET_PERMISSION = 'purchase.tablet';

/**
 * Primäre Navigation: die vier häufigsten Ziele. Sie stehen mobil in der
 * Bottom-Bar (plus „Mehr“), auf dem Tablet oben in der Rail und am Desktop
 * zuerst in der Seitenleiste.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { id: 'home', labelKey: 'nav.items.home', icon: 'home', route: '/dashboard' },
  { id: 'events', labelKey: 'nav.items.events', icon: 'events', route: '/events' },
  { id: 'chat', labelKey: 'nav.items.chat', icon: 'chat', route: '/chat' },
  { id: 'wallet', labelKey: 'nav.items.wallet', icon: 'wallet', route: '/wallet' },
];

/**
 * Weitere Mitgliederseiten, die nicht in der Bottom-Bar Platz haben. Sie
 * erscheinen in der Seitenleiste und im „Mehr“-Sheet.
 */
export const SECONDARY_NAV: readonly NavItem[] = [
  { id: 'moments', labelKey: 'nav.items.moments', icon: 'moments', route: '/moments' },
  { id: 'direct', labelKey: 'nav.items.direct', icon: 'direct-message', route: '/direktnachrichten' },
  { id: 'scan', labelKey: 'nav.items.scan', icon: 'camera', route: '/scan' },
  { id: 'purchases', labelKey: 'nav.items.purchases', icon: 'receipt', route: '/purchases' },
  { id: 'notifications', labelKey: 'nav.items.notifications', icon: 'bell', route: '/notifications' },
  { id: 'catalog', labelKey: 'nav.items.catalog', icon: 'catalog', route: '/catalog' },
  { id: 'sublists', labelKey: 'nav.items.sublists', icon: 'lists', route: '/sublists' },
  {
    id: 'statistik',
    labelKey: 'nav.items.statistik',
    icon: 'stats',
    route: '/statistik',
  },
  { id: 'profil', labelKey: 'nav.items.profil', icon: 'user', route: '/profile' },
  { id: 'stammtisch', labelKey: 'nav.items.stammtisch', icon: 'users', route: '/gruppe' },
];

/**
 * Rollenspezifische Panels (Abschnitt „Verwaltung“).
 * Vorstand, Kasse, Kommunikation, Administration und Terminal.
 */
export const PANEL_NAV: readonly NavItem[] = [
  {
    id: 'board',
    labelKey: 'nav.items.board',
    icon: 'board',
    route: '/board',
    requiredRoles: ['board', 'admin'],
    requiredContext: 'boardGeneral',
  },
  {
    id: 'treasury',
    labelKey: 'nav.items.treasury',
    icon: 'treasury',
    route: '/board/treasury',
    requiredRoles: ['board', 'admin'],
    requiredContext: 'boardTreasury',
  },
  {
    id: 'communications',
    labelKey: 'nav.items.communications',
    icon: 'megaphone',
    route: '/board/communications',
    requiredRoles: ['board', 'admin'],
    requiredContext: 'boardCommunications',
  },
  {
    id: 'admin',
    labelKey: 'nav.items.admin',
    icon: 'admin',
    route: '/admin',
    requiredRoles: ['admin'],
    requiredContext: 'admin',
  },
  {
    id: 'tablet',
    labelKey: 'nav.items.tablet',
    icon: 'terminal',
    route: '/tablet',
    requiredPermissions: [TABLET_PERMISSION],
  },
];

/** Abschnitt der Seitenleiste bzw. des „Mehr“-Sheets. */
export interface NavSection {
  id: 'club' | 'account' | 'bar' | 'admin';
  /** Übersetzungsschlüssel der Abschnittsüberschrift. */
  labelKey: string;
  items: NavItem[];
}

const SECTION_LAYOUT: readonly { id: NavSection['id']; labelKey: string; ids: readonly string[] }[] = [
  { id: 'club', labelKey: 'nav.sections.club', ids: ['home', 'events', 'moments', 'chat', 'direct'] },
  { id: 'account', labelKey: 'nav.sections.account', ids: ['wallet', 'scan', 'purchases', 'notifications', 'profil', 'stammtisch'] },
  { id: 'bar', labelKey: 'nav.sections.bar', ids: ['catalog', 'sublists', 'statistik'] },
  {
    id: 'admin',
    labelKey: 'nav.sections.admin',
    ids: ['board', 'treasury', 'communications', 'admin', 'tablet'],
  },
];

const ALL_NAV: readonly NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV, ...PANEL_NAV];

/**
 * Prüft, ob ein Eintrag für die Session sichtbar ist. Ohne Session sind nur
 * Einträge ohne jede Anforderung sichtbar; jede fehlende Rolle/Permission
 * blendet den Eintrag aus (`deny by default`).
 */
export function isNavItemVisible(item: NavItem, session: AuthSessionUser | null): boolean {
  const hasRequirements = Boolean(item.requiredRoles || item.requiredPermissions);
  if (!session) return !hasRequirements;

  if (item.requiredContext && session.appContexts) {
    if (!session.appContexts.includes(item.requiredContext)) return false;
  } else if (item.requiredRoles) {
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

/** Alle sichtbaren Einträge außer den primären (Inhalt des „Mehr“-Sheets). */
export function buildMoreNav(session: AuthSessionUser | null): NavItem[] {
  return [...filterNavItems(SECONDARY_NAV, session), ...filterNavItems(PANEL_NAV, session)];
}

/**
 * Sichtbare Abschnitte in fester Reihenfolge; leere Abschnitte (z. B.
 * „Verwaltung“ für ein einfaches Mitglied) entfallen.
 */
export function buildNavSections(session: AuthSessionUser | null): NavSection[] {
  const visible = new Map(filterNavItems(ALL_NAV, session).map((item) => [item.id, item]));
  return SECTION_LAYOUT.map((section) => ({
    id: section.id,
    labelKey: section.labelKey,
    items: section.ids.flatMap((id) => visible.get(id) ?? []),
  })).filter((section) => section.items.length > 0);
}
