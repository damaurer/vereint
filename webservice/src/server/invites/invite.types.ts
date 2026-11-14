export type InviteType = 'member' | 'guest';
export interface ValidatedInvite { type: InviteType; eventId?: string; }
