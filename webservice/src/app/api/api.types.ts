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
}

/** Teilnehmer eines Events (`GET /api/v1/events/{id}/participants`). */
export interface EventParticipant {
  userId: string;
  displayName: string;
  role: string;
  joinedAt: string;
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

/** Unveränderlicher Beleg-Snapshot eines Kaufs. */
export interface PurchaseSnapshot {
  drinkName: string;
  imageReference: string | null;
  barcode: string | null;
  unitPrice: string;
  currency: string;
  catalogVersion: number;
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
  eventDrinkId: string;
}

/**
 * Runde oder Abendaktion als Revenue-Only-Buchung
 * (`POST /api/v1/tablet/events/{id}/rounds` bzw. `/evening`).
 */
export interface TabletRevenuePayload {
  eventDrinkId: string;
  memberIds: string[];
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

/** Gemeinschaftsmomente & Rituale DTOs (`/api/v1/events/{eventId}/moments`). */
export interface StartMomentRequest {
  title: string;
  topicType: string;
  message?: string;
  consent: boolean;
  latitude?: number;
  longitude?: number;
  durationMinutes?: number;
}

export interface SubmitMomentResponseRequest {
  reaction: string;
  statusText?: string;
  consent: boolean;
  latitude?: number;
  longitude?: number;
}

export interface MomentSessionDto {
  id: string;
  eventId: string;
  creatorId: string;
  creatorName: string;
  conversationId: string | null;
  title: string;
  topicType: string;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
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
  reaction: string;
  statusText: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
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
  title: string;
  topicType: string;
  totalResponses: number;
  uniqueParticipants: number;
  summary: string;
  completedAt: string;
}
