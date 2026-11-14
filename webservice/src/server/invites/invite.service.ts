import type { ValidatedInvite } from './invite.types';

/**
 * Reine Format-/Plausibilitätsprüfung eines Einladungscodes.
 *
 * Express ist keine Sicherheitsgrenze: Diese Prüfung stellt nur sicher, dass
 * der Code syntaktisch wohlgeformt ist, bevor er an den Client zurückgemeldet
 * oder an den Fachservice weitergereicht wird. Die verbindliche Einlösung und
 * Autorisierung der Einladung nimmt ausschließlich der Spring-Fachservice über
 * `POST /api/v1/invites/accept` vor; `deny by default` bleibt serverseitig in
 * Spring Boot verankert.
 */
export async function validateInvite(code: string): Promise<ValidatedInvite | undefined> {
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(code)) return undefined;
  return { type: 'member' };
}
