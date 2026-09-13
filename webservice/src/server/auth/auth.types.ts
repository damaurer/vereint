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

/** Antwort von `GET /api/v1/auth/me`: keine `email`, keine Rohclaims. */
export interface AuthMeResponse {
  subject: string;
  displayName: string | null;
  roles: UserRole[];
  boardRole: BoardRole | null;
  permissions: string[];
}

export interface ServiceStatus {
  status: string;
  buildVersion: string;
}

export interface RequestIdentity {
  uid: string;
  email?: string;
  displayName?: string;
  roles: UserRole[];
  boardRole?: BoardRole;
  drinkRecorder: boolean;
  /** Permissions aus `permissions` und `scope` gemäß Claim-Vertrag. */
  permissions?: string[];
  eventScopes?: string[];
}

export interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type: string;
  id_token?: string;
  scope?: string;
  session_state?: string;
}

export interface StoredSessionTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  scope?: string;
}

export interface SessionData {
  sessionId: string;
  uid: string;
  createdAt: number;
  /** Ende der Express-Session (identisch zu `ssoSessionMaxLifespan`). */
  expiresAt: number;
  /** Ablauf des Access-Tokens; steuert den Refresh mit Karenzzeit. */
  accessTokenExpiresAt?: number;
  tokens: StoredSessionTokens;
  identity: RequestIdentity;
}

export interface OidcTransactionState {
  state: string;
  codeVerifier: string;
  nonce?: string;
  returnTo?: string;
  createdAt: number;
}

declare global {
  namespace Express {
    interface Request {
      identity?: RequestIdentity;
      sessionData?: SessionData;
    }
  }
}
