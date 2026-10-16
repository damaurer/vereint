import { AppContext, AuthSessionUser, BoardRole, UserRole } from './auth.types';

/**
 * Clientseitige App-Kontext-Navigation (TICKET-023).
 *
 * Diese Ableitungen steuern ausschließlich Navigation und UX; die
 * Sicherheitsentscheidung bleibt vollständig serverseitig (Express-Access-
 * Resolver und Spring-Boot-Fachservice, `deny by default`). Die Werte spiegeln
 * bewusst die Serverquellen aus `src/server/auth/redirect.ts`
 * (`CONTEXT_DEFAULT_PATHS`), damit Client und Server dieselben Ziele verwenden.
 */

/** Standardziel je App-Kontext, identisch zu `CONTEXT_DEFAULT_PATHS` im Server. */
export const CONTEXT_DEFAULT_ROUTES: Readonly<Record<AppContext, string>> = {
  memberPwa: '/app',
  event: '/events',
  eventOwner: '/events',
  boardGeneral: '/board',
  boardTreasury: '/board/treasury',
  boardCommunications: '/board/communications',
  admin: '/admin',
  tabletRecorder: '/tablet',
  eventGuest: '/guest',
};

/**
 * Ordnet einen Zielpfad einem App-Kontext zu. Spiegelt bewusst
 * `resolvePathAppContext` im Server.
 */
export function contextForPath(pathname: string): AppContext | null {
  const clean = (pathname.split('?')[0] ?? '').split('#')[0];

  if (clean === '/admin' || clean.startsWith('/admin/')) return 'admin';
  if (clean === '/board/treasury' || clean.startsWith('/board/treasury/')) return 'boardTreasury';
  if (clean === '/board/communications' || clean.startsWith('/board/communications/')) {
    return 'boardCommunications';
  }
  if (clean === '/board' || clean.startsWith('/board/')) return 'boardGeneral';
  if (clean === '/tablet' || clean.startsWith('/tablet/')) return 'tabletRecorder';
  if (clean.startsWith('/guest/') || clean === '/guest') return 'eventGuest';

  if (clean.startsWith('/events/')) {
    const parts = clean.split('/');
    if (parts[3] === 'manage') return 'eventOwner';
    if (parts[2]) return 'event';
  }

  return null;
}

/**
 * Leitet die Standard-Startseite eines angemeldeten Benutzers aus seinen Rollen
 * ab. Priorität `admin` vor `board` vor `member`; die Vorstandsrolle bestimmt
 * das Vorstandsressort.
 */
/** Auswahlseite, solange kein Stammtisch gewählt ist. */
export const STAMMTISCH_CHOICE_ROUTE = '/stammtische';

export function defaultRouteForSession(session: AuthSessionUser): string {
  if (session.stammtisch === null) return STAMMTISCH_CHOICE_ROUTE;
  const roles: UserRole[] = session.roles ?? [];
  if (roles.includes('admin')) return CONTEXT_DEFAULT_ROUTES.admin;
  if (roles.includes('board')) return boardRouteForRole(session.boardRole);
  if (roles.includes('member')) return CONTEXT_DEFAULT_ROUTES.memberPwa;

  // Angemeldet, aber ohne bekannte Rolle: keine Standardrolle annehmen.
  return CONTEXT_DEFAULT_ROUTES.memberPwa;
}

/** Vorstandsressort abhängig von der `BoardRole`. */
function boardRouteForRole(boardRole: BoardRole | undefined): string {
  switch (boardRole) {
    case 'treasurer':
      return CONTEXT_DEFAULT_ROUTES.boardTreasury;
    case 'secretary':
      return CONTEXT_DEFAULT_ROUTES.boardCommunications;
    default:
      return CONTEXT_DEFAULT_ROUTES.boardGeneral;
  }
}
