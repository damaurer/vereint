import { AppContext, AuthSessionUser, BoardRole, UserRole } from './auth.types';

/**
 * Clientseitige App-Kontext-Navigation (TICKET-023).
 *
 * Diese Ableitungen steuern ausschließlich Navigation und UX; die
 * Sicherheitsentscheidung bleibt vollständig serverseitig (Express-Access-
 * Resolver und Spring-Boot-Fachservice, `deny by default`). Die Werte spiegeln
 * bewusst die Serverquellen aus `src/server/auth/redirect.ts`
 * (`CONTEXT_DEFAULT_PATHS`) und `authorization.middleware.ts`
 * (`loginPathForContext`), damit Client und Server dieselben Ziele verwenden.
 */

/** Öffentliche Standard-Startseite ohne Session. */
export const PUBLIC_LOGIN_ROUTE = '/pwa/login';

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

/** Kontexte, die über die Webanwendung (`/web/login`) angemeldet werden. */
const WEB_LOGIN_CONTEXTS: readonly AppContext[] = [
  'tabletRecorder',
  'admin',
  'boardGeneral',
  'boardTreasury',
  'boardCommunications',
];

/**
 * Ordnet einen Zielpfad einem App-Kontext zu. Spiegelt bewusst
 * `resolvePathAppContext` im Server, damit die Loginwahl konsistent bleibt.
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
 * Wählt den Anmeldeeinstieg passend zum angeforderten Pfad: Vorstands-, Admin-
 * und Tablet-Kontexte melden sich über `/web/login` an, alle übrigen über
 * `/pwa/login` (spiegelt `loginPathForContext` im Server).
 */
export function loginRouteForPath(pathname: string): string {
  const context = contextForPath(pathname);
  if (context && WEB_LOGIN_CONTEXTS.includes(context)) return '/web/login';
  return PUBLIC_LOGIN_ROUTE;
}

/**
 * Leitet die Standard-Startseite eines angemeldeten Benutzers aus seinen Rollen
 * ab. Priorität `admin` vor `board` vor `member`; die Vorstandsrolle bestimmt
 * das Vorstandsressort. Ohne Session ergibt sich der öffentliche Login.
 */
export function defaultRouteForSession(session: AuthSessionUser | null): string {
  if (!session) return PUBLIC_LOGIN_ROUTE;

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
