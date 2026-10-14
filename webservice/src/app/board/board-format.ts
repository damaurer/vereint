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
