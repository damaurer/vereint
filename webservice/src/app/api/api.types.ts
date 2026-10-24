/**
 * Datenverträge der fachlichen API (`/api/v1`), soweit die Mitglieder-PWA sie
 * konsumiert (TICKET-024). Die Formen entsprechen den Kotlin-DTOs des
 * Spring-Fachservice; Kennungen sind Zeichenketten (UUID), Zeitstempel
 * ISO-8601, Geldbeträge dezimale Zeichenketten.
 */

import type { BoardRole, UserRole } from '../auth/auth.types';

export type { BoardRole, UserRole } from '../auth/auth.types';

/** Zulässige Eventstatuswerte gemäß Datenvertrag (`EventStatus`). */
export type EventStatus =
  | 'draft'
  | 'published'
  | 'active'
  | 'cancelled'
  | 'completed'
  | 'archived';

/** Eigenes Benutzerprofil (`GET /api/v1/users/me`). */
export interface MemberProfile {
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

/** Aktualisierung des eigenen Profils (`PUT /api/v1/users/me`). */
export interface UpdateProfilePayload {
  displayName?: string;
  email?: string;
}

/** Kompakte Eventzeile (`GET /api/v1/events`). */
export interface EventSummary {
  id: string;
  title: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string | null;
  ownerId: string;
  ownerDisplayName: string;
  location?: string | null;
  /** Eigene Antwort, falls man eingeladen ist. */
  myRsvp?: RsvpStatus | null;
}

/** Antwort eines Eingeladenen; `invited` heißt: noch keine Antwort. */
export type RsvpStatus = 'invited' | 'accepted' | 'maybe' | 'declined';

export interface RsvpCounts {
  invited: number;
  accepted: number;
  maybe: number;
  declined: number;
}

/** Eventdetails (`GET /api/v1/events/{id}`). */
export interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  status: EventStatus;
  ownerId: string;
  ownerDisplayName: string;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
  /** Ab wann Eingeladene benachrichtigt werden; `null` = bei Veröffentlichung. */
  invitationNotifyAt?: string | null;
  /** Erinnerung so viele Stunden vor Beginn; `null` = keine. */
  reminderHoursBefore?: number | null;
  myRsvp?: RsvpStatus | null;
  rsvpCounts?: RsvpCounts;
  canManage?: boolean;
}

/** Neues Event (`POST /api/v1/events`). */
export interface CreateEventPayload {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
  status?: 'draft' | 'published';
  invitationNotifyAt?: string | null;
  reminderHoursBefore?: number | null;
  inviteUserIds?: string[];
  inviteAllMembers?: boolean;
}

/** Mitglieder einladen (`POST /api/v1/events/{id}/invitations`). */
export interface InviteMembersPayload {
  userIds?: string[];
  allMembers?: boolean;
}

/** Eintrag des Mitgliederverzeichnisses (`GET /api/v1/users/directory`, alle Angemeldeten). */
export interface DirectoryMember {
  id: string;
  displayName: string;
  boardRole: string | null;
  roles: string[];
}

/** Zeile der Guthabenübersicht (`GET /api/v1/ledger/balances`, Vorstand/Admin). */
export interface MemberBalanceOverview {
  memberId: string;
  displayName: string;
  currency: string;
  creditBalance: string;
  lastEntryAt: string | null;
}

/** Rundbrief (`POST /api/v1/notifications/broadcast`, Vorstand/Admin). */
export interface BroadcastPayload {
  userIds?: string[];
  allMembers?: boolean;
  title: string;
  body: string;
}

export interface BroadcastResult {
  sent: number;
}

/** Teilnehmer eines Events (`GET /api/v1/events/{id}/participants`). */
export interface EventParticipant {
  userId: string;
  displayName: string;
  role: string;
  joinedAt: string;
  rsvp?: RsvpStatus;
  rsvpAt?: string | null;
}

/**
 * Guthaben und Umsatzkennzahlen einer Person
 * (`GET /api/v1/ledger/members/{memberId}/balance`).
 */
export interface MemberBalance {
  memberId: string;
  currency: string;
  creditBalance: string;
  topupTotal: string;
  payoutTotal: string;
  purchaseTotal: string;
  correctionTotal: string;
  entryCount: number;
}

/** Zulässige Belegpositionstypen. */
export type PurchaseItemType = 'DRINK' | 'FOOD';

/** Unveränderlicher Beleg-Snapshot eines Kaufs. */
export interface PurchaseSnapshot {
  itemType?: PurchaseItemType;
  drinkName: string | null;
  foodName?: string | null;
  imageReference: string | null;
  barcode: string | null;
  unitPrice: string;
  costPrice?: string;
  profit?: string;
  currency: string;
  catalogVersion: number | null;
}

/**
 * Einzelne Ledger-Buchung
 * (`GET /api/v1/ledger/members/{memberId}/entries`).
 */
export interface LedgerEntry {
  id: string;
  entryType: string;
  eventId: string | null;
  memberId: string;
  memberDisplayName: string;
  drinkId: string | null;
  foodId?: string | null;
  amount: string;
  currency: string;
  accountingMode: string;
  source: string | null;
  actorId: string;
  reversesEntryId: string | null;
  idempotencyKey: string;
  createdAt: string;
  snapshot: PurchaseSnapshot | null;
}

/** Ein laufendes Event, an dem das gescannte Getränk gekauft werden kann. */
export interface PurchaseOption {
  eventId: string;
  eventTitle: string;
  unitPrice: string;
  currency: string;
}

/** Vorschau eines Barcodekaufs (`POST /api/v1/ledger/purchases/preview`); bucht nichts. */
export interface PurchasePreview {
  barcode: string;
  drinkId: string;
  drinkName: string;
  imageReference: string | null;
  options: PurchaseOption[];
  creditBalance: string;
  balanceCurrency: string;
}

/**
 * Verträge der Verwaltungs- und Tablet-Kontexte (TICKET-026): Vorstand/Kasse,
 * Kommunikation, Administration/Audit sowie der Drink-Recorder. Sämtliche
 * Autorisierung verbleibt serverseitig im Fachservice (`deny by default`); die
 * Oberflächen formulieren ausschließlich die Aufrufe.
 */

/** Aggregierte Kassen-/Umsatzsicht eines Events (`GET /api/v1/ledger/events/{id}/summary`). */
export interface EventLedgerSummary {
  eventId: string;
  currency: string;
  revenueTotal: string;
  costTotal?: string;
  profitTotal?: string;
  creditConsumptionTotal: string;
  entryCount: number;
}

/** Guthaben-Aufladung (`POST /api/v1/ledger/topups`, nur Vorstand/Admin). */
export interface TopupPayload {
  memberId: string;
  amount: string;
  currency?: string;
  note?: string;
}

/** Guthaben-Auszahlung (`POST /api/v1/ledger/payouts`, nur Vorstand/Admin). */
export interface PayoutPayload {
  memberId: string;
  amount: string;
  currency?: string;
  note?: string;
}

/** Korrektur als Gegenbuchung (`POST /api/v1/ledger/corrections`, nur Vorstand/Admin). */
export interface CorrectionPayload {
  originalEntryId: string;
  reason?: string;
}

/** Gespeicherte Benachrichtigung (`GET`/`POST /api/v1/notifications`). */
export interface NotificationMessage {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
  /** Ziel in der App, z. B. `/events/{id}`. */
  link?: string | null;
}

/** Versenden einer Benachrichtigung (`POST /api/v1/notifications`, nur Vorstand/Admin). */
export interface SendNotificationPayload {
  userId: string;
  title: string;
  body: string;
  type?: string;
}

/** Ein Eintrag des Audit-Protokolls (`GET /api/v1/audit-logs`, nur Vorstand/Admin). */
export interface AuditLogEntry {
  id: string;
  action: string;
  targetEntity: string;
  targetId: string | null;
  actorId: string | null;
  actorDisplayName: string | null;
  details: string | null;
  createdAt: string;
  /** Betroffene Person (Mitglied, Empfänger), vom Server aufgelöst. */
  targetName?: string | null;
  /** Betreff, z. B. Titel einer Mitteilung. */
  targetTitle?: string | null;
}

/** Kompaktes aktives Event für die Tablet-Auswahl (`GET /api/v1/tablet/events`). */
export interface TabletEvent {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  status: EventStatus;
}

/** Für den Tablet-Kontext freigegebenes Eventmitglied. */
export interface TabletMember {
  memberId: string;
  displayName: string;
}

/** Manueller Strichlisten-Kauf (`POST /api/v1/tablet/events/{id}/purchases`). */
export interface TabletPurchasePayload {
  memberId: string;
  eventDrinkId?: string | null;
  eventFoodId?: string | null;
}

/**
 * Runde oder Abendaktion als Revenue-Only-Buchung
 * (`POST /api/v1/tablet/events/{id}/rounds` bzw. `/evening`).
 */
export interface TabletRevenuePayload {
  eventDrinkId?: string | null;
  eventFoodId?: string | null;
  memberIds: string[];
}

/** Globaler Speisenkatalog (`GET /api/v1/food`). */
export interface FoodSummary {
  id: string;
  name: string;
  category: string | null;
  defaultPrice: string;
  costPrice: string;
  currency: string;
  active: boolean;
}

/** Speisedetails (`GET /api/v1/food/{id}`). */
export interface FoodDetail {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  defaultPrice: string;
  costPrice: string;
  currency: string;
  active: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFoodPayload {
  name: string;
  description?: string;
  category?: string;
  defaultPrice: string | number;
  costPrice?: string | number;
  currency?: string;
}

export interface UpdateFoodPayload {
  name?: string;
  description?: string;
  category?: string;
  defaultPrice?: string | number;
  costPrice?: string | number;
  currency?: string;
  active?: boolean;
}

/** Eventspeise (`GET /api/v1/events/{id}/food`). */
export interface EventFood {
  id: string;
  eventId: string;
  foodId: string;
  foodName: string;
  price: string | null;
  effectivePrice: string;
  costPrice: string | null;
  effectiveCostPrice: string;
  currency: string;
  selfServiceEnabled: boolean;
  tabletEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddEventFoodPayload {
  foodId: string;
  price?: string | number | null;
  costPrice?: string | number | null;
  currency?: string;
  selfServiceEnabled?: boolean;
  tabletEnabled?: boolean;
}

export interface UpdateEventFoodPayload {
  price?: string | number | null;
  costPrice?: string | number | null;
  currency?: string;
  selfServiceEnabled?: boolean;
  tabletEnabled?: boolean;
}

/** Kombiniertes Angebot an Getränken und Speisen für das Tablet. */
export interface TabletItems {
  drinks: any[];
  food: EventFood[];
}

/** Administrative Benutzeraktualisierung (`PUT /api/v1/users/{id}`). */
export interface AdminUpdateUserPayload {
  displayName?: string;
  email?: string;
  disabled?: boolean;
  drinkRecorder?: boolean;
  boardRole?: BoardRole | '' | null;
  roles?: string[];
  permissions?: string[];
}

/** Setzt die Rollen eines Benutzers (`PUT /api/v1/users/{id}/roles`). */
export interface AssignRolesPayload {
  roles: string[];
}

/** Setzt die Permissions eines Benutzers (`PUT /api/v1/users/{id}/permissions`). */
export interface AssignPermissionsPayload {
  permissions: string[];
}

/** Aktiviert/deaktiviert einen Benutzer (`PUT /api/v1/users/{id}/status`). */
export interface UpdateUserStatusPayload {
  disabled: boolean;
}

/** Query-Parameter der administrativen Benutzerliste (`GET /api/v1/users`). */
export interface UserListQuery {
  search?: string;
  role?: string;
  disabled?: boolean;
  page?: number;
  size?: number;
}

/** Wer einen Moment sieht: die ganze Gruppe oder nur die Teilnehmer des verknüpften Events. */
export type MomentVisibility = 'group' | 'event';

/** Gemeinschaftsmomente & Rituale DTOs (`/api/v1/moments`). */
export interface StartMomentRequest {
  /** Optional; leer übernimmt der Moment den Namen des Themas. */
  title?: string;
  topicType: string;
  message?: string;
  consent: boolean;
  latitude?: number;
  longitude?: number;
  durationMinutes?: number;
  /** Optionales Event, an das der Moment geknüpft wird. */
  eventId?: string;
  visibility?: MomentVisibility;
}

export interface SubmitMomentResponseRequest {
  /** Code einer Reaktion; optional, wenn Text oder Bilder/Videos mitkommen. */
  reaction?: string;
  statusText?: string;
  consent: boolean;
  latitude?: number;
  longitude?: number;
  /** Zuvor hochgeladene Bilder/Videos (`uploadMomentMedia`). */
  mediaIds?: string[];
}

export interface MomentSessionDto {
  id: string;
  eventId: string | null;
  eventTitle: string | null;
  visibility: MomentVisibility;
  creatorId: string;
  creatorName: string;
  conversationId: string | null;
  title: string;
  topicType: string;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  topicName: string;
  topicEmoji: string | null;
  responsesCount: number;
  expiresAt: string;
  createdAt: string;
  summary: string | null;
}

export interface MomentResponseDto {
  id: string;
  momentId: string;
  userId: string;
  userName: string;
  reaction: string | null;
  reactionName: string | null;
  reactionEmoji: string | null;
  statusText: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  media: MomentMediaDto[];
}

export interface MomentMediaDto {
  id: string;
  kind: 'image' | 'video';
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Berechtigungsgeprüfter Content-Endpunkt (Videos mit HTTP-Range). */
  url: string;
  canDelete: boolean;
}

/** Vom Vorstand gepflegter Moment-Typ (`/api/v1/moment-config`). */
export interface MomentTypeDto {
  id: string;
  code: string;
  name: string;
  emoji: string;
  description: string | null;
  active: boolean;
  allReactions: boolean;
  reactionIds: string[];
  /** Codes der Reaktionen, die in Moments dieses Typs gerade wählbar sind. */
  allowedReactionCodes: string[];
}

export interface MomentReactionDto {
  id: string;
  code: string;
  name: string;
  emoji: string;
  active: boolean;
}

export interface MomentMediaLimitsDto {
  maxImageBytes: number;
  maxVideoBytes: number;
  maxVideoSeconds: number;
  maxMediaPerResponse: number;
  imageTypes: string[];
  videoTypes: string[];
  /** Erlaubt der Tarif der Gruppe Videos? */
  videosAllowed: boolean;
}

export interface MomentConfigDto {
  types: MomentTypeDto[];
  reactions: MomentReactionDto[];
  mediaLimits: MomentMediaLimitsDto;
}

export interface SaveMomentTypeRequest {
  name: string;
  emoji: string;
  description?: string;
  active: boolean;
  allReactions: boolean;
  reactionIds: string[];
}

export interface SaveMomentReactionRequest {
  name: string;
  emoji: string;
  active: boolean;
}

export interface GeoJsonGeometryDto {
  type: string;
  coordinates: [number, number];
}

export interface GeoJsonFeatureDto {
  type: string;
  geometry: GeoJsonGeometryDto;
  properties: Record<string, unknown>;
}

export interface MomentMapGeoJsonDto {
  type: string;
  features: GeoJsonFeatureDto[];
}

export interface MomentDetailDto {
  session: MomentSessionDto;
  responses: MomentResponseDto[];
  mapGeoJson: MomentMapGeoJsonDto;
}

export interface MomentSummaryDto {
  momentId: string;
  eventId: string | null;
  eventTitle: string | null;
  title: string;
  topicType: string;
  topicName: string;
  topicEmoji: string | null;
  totalResponses: number;
  uniqueParticipants: number;
  summary: string;
  completedAt: string;
}

// --- Chat (`/api/v1/conversations`) ---

export type ConversationType = 'club' | 'direct' | 'event' | 'moment';

export interface ChatReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

/** Nachricht einer Konversation. `senderType` ist `member` oder `guest`. */
export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderType: 'member' | 'guest';
  senderId: string | null;
  senderName: string;
  message: string;
  imageUrl: string | null;
  createdAt: string;
  reactions?: ChatReaction[];
}

export interface PinnedNote {
  text: string;
  authorName: string;
  pinnedAt: string;
}

/** Eintrag der Chat-Übersicht (`GET /api/v1/conversations`). */
export interface ConversationSummary {
  id: string;
  type: ConversationType;
  title: string;
  eventId: string | null;
  partnerId: string | null;
  partnerName: string | null;
  lastMessage: { senderName: string; message: string; createdAt: string } | null;
  unreadCount: number;
  pinned: PinnedNote | null;
  canWrite: boolean;
}

// --- Freunde (`/api/v1/friends`, gruppenübergreifend) ---

export type FriendStatus = 'friend' | 'incoming' | 'outgoing' | 'none';

/** Gemeinsame Gruppe; nur Gruppen, in denen man selbst Mitglied ist. */
export interface SharedGroup {
  id: string;
  name: string;
}

/** Person in Freundesliste oder Kontakten. */
export interface FriendContact {
  userId: string;
  displayName: string;
  friendStatus: FriendStatus;
  since: string | null;
  sharedGroups: SharedGroup[];
  /** Darf man der Person schreiben (Freunde oder gemeinsame Gruppe)? */
  canMessage: boolean;
}

export interface FriendsOverview {
  friends: FriendContact[];
  incoming: FriendContact[];
  outgoing: FriendContact[];
}

// --- Persönlicher Kalender (`GET /api/v1/calendar`, alle eigenen Gruppen) ---

export interface CalendarEntry {
  kind: 'event' | 'moment';
  id: string;
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  /** Ort des Events; bei Moments der Titel des Events. */
  location: string | null;
  status: string;
  myRsvp: string | null;
  emoji: string | null;
  topicName: string | null;
  active: boolean;
  stammtischId: string;
  stammtischName: string;
}

export interface CalendarResponse {
  from: string;
  to: string;
  entries: CalendarEntry[];
}

// --- Statistik (`GET /api/v1/statistics`, alle Angemeldeten) ---

export interface ClubStatistics {
  periodDays: number;
  totalItems: number;
  myItems: number;
  myRank: number | null;
  topConsumers: { memberId: string; displayName: string; count: number }[];
  attendancePercent: number | null;
  spending: { total: string; currency: string; changePercent: number | null; weekly: string[] };
  itemRanking: { name: string; count: number; sharePercent: number }[];
  topEvents: { eventId: string; title: string; count: number }[];
}
