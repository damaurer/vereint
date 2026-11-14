import { translate } from '../i18n/i18n.service';

/**
 * Anzeigehelfer der Verwaltungs- und Tablet-Kontexte (TICKET-026). Die
 * Formatierung findet ausschließlich clientseitig statt; die Ansichten werden im
 * Browser gerendert.
 */

/** Klartext der Audit-Zielarten (`targetEntity`) in der aktiven Sprache. */
export function auditTargetLabel(targetEntity: string): string {
  switch (targetEntity) {
    case 'Ledger':
      return translate('board.auditTarget.ledger');
    case 'Notification':
      return translate('board.auditTarget.notification');
    case 'User':
      return translate('board.auditTarget.user');
    case 'Kiosk':
      return translate('board.auditTarget.kiosk');
    default:
      return targetEntity;
  }
}

/** Klartext der Vorstands-Unterrolle (`BoardRole`) in der aktiven Sprache. */
export function boardRoleLabel(boardRole: string | null): string {
  switch (boardRole) {
    case 'chair':
      return translate('board.boardRole.chair');
    case 'treasurer':
      return translate('board.boardRole.treasurer');
    case 'secretary':
      return translate('board.boardRole.secretary');
    case 'assessor':
      return translate('board.boardRole.assessor');
    default:
      return translate('board.boardRole.board');
  }
}

/** Übersetzt einen Schlüssel und fällt auf den Rohwert zurück, wenn er fehlt. */
function translateOr(key: string, raw: string): string {
  const label = translate(key);
  return label === key ? raw : label;
}

/** Klartext einer Audit-Aktion (`USER_ROLES_CHANGED` …) in der aktiven Sprache. */
export function auditActionLabel(action: string): string {
  return translateOr(`board.auditAction.${action}`, action);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Schlüssel, die nur Kennungen oder Technik tragen; Namen liefert `targetName`. */
const HIDDEN_DETAIL_KEYS = new Set(['target', 'member', 'reverses', 'invite', 'type']);

/**
 * Lesbare Kurzfassung der Audit-Details. Der Server schreibt `schlüssel=wert; …`;
 * IDs und leere Werte fallen weg, bekannte Schlüssel werden übersetzt. Freitext
 * ohne dieses Format bleibt unverändert.
 */
export function auditDetails(details: string | null): string {
  if (!details) return '';
  const parts = details.split(';').map((part) => part.trim()).filter(Boolean);
  if (!parts[0]?.includes('=')) return details;
  const pairs: [string, string][] = [];
  for (const part of parts) {
    const index = part.indexOf('=');
    // Ein Semikolon im Freitext (z. B. Notiz) gehört noch zum vorherigen Wert.
    if (index < 0) pairs[pairs.length - 1][1] += `; ${part}`;
    else pairs.push([part.slice(0, index).trim(), part.slice(index + 1).trim()]);
  }
  return pairs
    .filter(([key, value]) => !HIDDEN_DETAIL_KEYS.has(key) && value !== '' && value !== '-' && !UUID_PATTERN.test(value))
    .map(([key, value]) => `${translateOr(`board.auditDetail.${key}`, key)}: ${value}`)
    .join(' · ');
}
