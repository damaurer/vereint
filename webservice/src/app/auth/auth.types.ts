export type AuthProvider = 'password' | 'keycloak';

export type UserRole = 'member' | 'board' | 'admin';
export type BoardRole = 'chair' | 'treasurer' | 'secretary' | 'assessor';

export type AppContext =
  | 'memberPwa'
  | 'event'
  | 'eventOwner'
  | 'boardGeneral'
  | 'boardTreasury'
  | 'boardCommunications'
  | 'admin'
  | 'tabletRecorder'
  | 'eventGuest';

export interface AccessDecision {
  subject: string;
  userId?: string;
  displayName?: string;
  email?: string;
  disabled: boolean;
  roles: UserRole[];
  boardRole?: BoardRole;
  drinkRecorder: boolean;
  permissions: string[];
  eventScopes: string[];
  allowedAppContexts: AppContext[];
}

export interface UserProfile {
  id: string;
  keycloakSubject: string;
  displayName: string;
  email: string | null;
  disabled: boolean;
  drinkRecorder: boolean;
  boardRole: BoardRole | null;
  roles: UserRole[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserSummary {
  id: string;
  keycloakSubject: string;
  displayName: string;
  email: string | null;
  disabled: boolean;
  drinkRecorder: boolean;
  boardRole: BoardRole | null;
  roles: UserRole[];
  createdAt: string;
}

/**
 * Fehlerformat des Spring-Boot-Fachservice nach RFC 7807
 * (`application/problem+json`). Ausgewertet werden `code` und `detail`.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

/** Seitenweise Antwort des Fachservice, z. B. `GET /api/v1/users`. */
export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

/** Query-Parameter der Seitennavigation (Standard `size` 25, Maximum 100). */
export interface PageRequest {
  page?: number;
  size?: number;
  sort?: string;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_USER_SORT = 'displayName,asc';

/** Antwort von `GET /api/v1/auth/me` und `GET /api/auth/me`. */
/** Mitgliedschaft in einem Stammtisch; Rollen sind je Stammtisch definiert. */
export interface StammtischMembership {
  id: string;
  name: string;
  roles: string[];
  boardRole?: BoardRole | null;
  /** Version des Gruppenbilds; fehlt oder `null` = kein Bild. */
  imageVersion?: number | null;
}

export interface StammtischRef {
  id: string;
  name: string;
  /** Version des Gruppenbilds; fehlt oder `null` = kein Bild. */
  imageVersion?: number | null;
}

export interface AuthMeResponse {
  subject: string;
  displayName: string | null;
  roles: UserRole[];
  boardRole: BoardRole | null;
  permissions: string[];
  stammtisch?: StammtischRef | null;
  memberships?: StammtischMembership[];
  platformAdmin?: boolean;
  appContexts?: AppContext[];
}

export interface ServiceStatus {
  status: string;
  buildVersion: string;
}

export interface AuthSessionUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  provider: AuthProvider;
  roles?: UserRole[];
  boardRole?: BoardRole;
  permissions?: string[];
  drinkRecorder?: boolean;
  eventScopes?: string[];
  /** Gewählter Stammtisch; `null` heißt: keiner gewählt (Auswahlseite). */
  stammtisch?: StammtischRef | null;
  memberships?: StammtischMembership[];
  platformAdmin?: boolean;
  /** Freigegebene App-Kontexte im gewählten Stammtisch (Navigation). */
  appContexts?: AppContext[];
}

export interface RememberedLogin {
  email: string;
}

export const REMEMBERED_LOGIN_STORAGE_KEY = 'vereint.login.rememberedEmail';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmailAddress(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}
