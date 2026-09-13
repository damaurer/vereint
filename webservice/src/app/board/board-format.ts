/**
 * Anzeigehelfer der Verwaltungs- und Tablet-Kontexte (TICKET-026). Die
 * Formatierung findet ausschließlich clientseitig statt; die Ansichten werden im
 * Browser gerendert.
 */

/** Deutscher Klartext der Audit-Zielarten (`targetEntity`). */
export function auditTargetLabel(targetEntity: string): string {
  switch (targetEntity) {
    case 'Ledger':
      return 'Finanzen';
    case 'Notification':
      return 'Kommunikation';
    case 'User':
      return 'Benutzer';
    default:
      return targetEntity;
  }
}

/** Deutscher Klartext der Vorstands-Unterrolle (`BoardRole`). */
export function boardRoleLabel(boardRole: string | null): string {
  switch (boardRole) {
    case 'chair':
      return 'Vorsitz';
    case 'treasurer':
      return 'Kassenwart';
    case 'secretary':
      return 'Schriftführer';
    case 'assessor':
      return 'Beisitzer';
    default:
      return 'Vorstand';
  }
}
