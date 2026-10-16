import type { AccessDecision, AppContext, StammtischMembership } from '../auth/auth.types';

/**
 * Zugriffsentscheidung, wie sie der Spring-Boot-Access-Resolver ausliefert.
 *
 * `AccessDecision` (`src/server/auth/auth.types.ts`) bleibt der gemeinsame
 * Datenvertrag; Express ergänzt hier ausschließlich die Felder, die der
 * Resolver zusätzlich liefert:
 *
 * - `ownedEvents` enthält ausschließlich Events in eigener Eigentümerschaft und
 *   ist die einzige Grundlage des Kontexts `eventOwner`. `eventScopes` umfasst
 *   dagegen auch bloße Teilnahmen und darf niemals Eigentümerrechte begründen
 *   (TICKET-006).
 * - `matrixVersion` benennt die Version der Rollen-/Permission-Matrix. Die
 *   Matrix wird ausschließlich in Kotlin gepflegt
 *   (`baseservice/.../security/RolePermissionMatrix.kt`) und über den Resolver
 *   versioniert ausgeliefert; Express wertet die Antwort nur aus.
 */
export interface ResolvedAccessDecision extends AccessDecision {
  ownedEvents: string[];
  matrixVersion?: number;
}

/** Versionierte Rollen-/Permission-Matrix aus `GET /api/v1/auth/access/matrix`. */
export interface RolePermissionMatrix {
  version: number;
  roles: Record<string, string[]>;
  assignableRoles: string[];
  knownPermissions: string[];
  appContexts: AppContext[];
}

/**
 * Ergebnis einer Zugriffsprüfung.
 *
 * `unavailable` ist bewusst von `denied` getrennt: Ein nicht erreichbarer
 * Fachservice darf niemals wie eine Ablehnung oder wie eine Freigabe behandelt
 * werden, sondern führt zu `503` beziehungsweise zur Wartungsseite
 * (`fail closed`, TICKET-006).
 */
export type AccessOutcome = 'allowed' | 'denied' | 'unauthenticated' | 'unavailable';

export interface AccessCheckResult {
  outcome: AccessOutcome;
  decision?: ResolvedAccessDecision;
  /** `traceId` der Resolver-Antwort, sofern vorhanden. */
  traceId?: string;
}

/** Leere Entscheidung; Grundlage von `deny by default`. */
export function denyAllDecision(subject = ''): ResolvedAccessDecision {
  return {
    subject,
    disabled: true,
    roles: [],
    drinkRecorder: false,
    permissions: [],
    eventScopes: [],
    ownedEvents: [],
    allowedAppContexts: [],
  };
}

/** Normalisiert eine Resolver-Antwort auf den vollständigen Datenvertrag. */
export function normalizeDecision(raw: unknown): ResolvedAccessDecision | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<ResolvedAccessDecision>;
  if (typeof value.subject !== 'string') return undefined;

  return {
    subject: value.subject,
    userId: value.userId,
    displayName: value.displayName,
    email: value.email,
    disabled: value.disabled === true,
    roles: Array.isArray(value.roles) ? value.roles : [],
    boardRole: value.boardRole,
    drinkRecorder: value.drinkRecorder === true,
    permissions: Array.isArray(value.permissions) ? value.permissions : [],
    eventScopes: Array.isArray(value.eventScopes) ? value.eventScopes : [],
    ownedEvents: Array.isArray(value.ownedEvents) ? value.ownedEvents : [],
    allowedAppContexts: Array.isArray(value.allowedAppContexts) ? value.allowedAppContexts : [],
    matrixVersion: typeof value.matrixVersion === 'number' ? value.matrixVersion : undefined,
    stammtischId: typeof value.stammtischId === 'string' ? value.stammtischId : undefined,
    stammtischName: typeof value.stammtischName === 'string' ? value.stammtischName : undefined,
    platformAdmin: value.platformAdmin === true ? true : undefined,
    // Fehlt die Liste, stammt die Antwort nicht aus einem Stammtisch-fähigen Fachservice.
    memberships: Array.isArray(value.memberships)
      ? value.memberships.filter(
          (entry): entry is StammtischMembership =>
            !!entry && typeof entry.id === 'string' && typeof entry.name === 'string',
        ).map((entry) => ({
          id: entry.id,
          name: entry.name,
          roles: Array.isArray(entry.roles) ? entry.roles : [],
          boardRole: entry.boardRole ?? null,
        }))
      : undefined,
  };
}
