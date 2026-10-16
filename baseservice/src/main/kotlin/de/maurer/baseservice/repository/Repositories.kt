package de.maurer.baseservice.repository

import de.maurer.baseservice.domain.*
import jakarta.persistence.LockModeType
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.time.Instant
import java.util.Optional
import java.util.UUID

@Repository
interface UserRepository : JpaRepository<UserEntity, UUID>, JpaSpecificationExecutor<UserEntity> {
    fun findByKeycloakSubject(keycloakSubject: String): Optional<UserEntity>
    fun findByEmail(email: String): Optional<UserEntity>
    fun existsByEmailIgnoreCase(email: String): Boolean
    fun findByDisabled(disabled: Boolean): List<UserEntity>
    fun findFirstByEmailIgnoreCase(email: String): Optional<UserEntity>
}

@Repository
interface UserRoleRepository : JpaRepository<UserRoleEntity, UserRoleId> {
    fun findByIdUserId(userId: UUID): List<UserRoleEntity>
    fun findByIdRole(role: String): List<UserRoleEntity>
    fun findByStammtischIdAndIdUserId(stammtischId: UUID, userId: UUID): List<UserRoleEntity>
    fun deleteByIdUserId(userId: UUID)
    fun deleteByIdRole(role: String)
}

/** Gemeinsame Getränkedatenbank; gehört keinem Stammtisch. */
@Repository
interface DrinkLibraryRepository : JpaRepository<DrinkLibraryEntity, UUID> {
    @Query(
        """
        select d from DrinkLibraryEntity d
        where lower(d.name) like lower(concat('%', :term, '%'))
           or lower(coalesce(d.category, '')) like lower(concat('%', :term, '%'))
        order by d.name
        """
    )
    fun search(@Param("term") term: String, pageable: Pageable): List<DrinkLibraryEntity>
}

@Repository
interface DrinkLibraryBarcodeRepository : JpaRepository<DrinkLibraryBarcodeEntity, UUID> {
    fun findByBarcode(barcode: String): Optional<DrinkLibraryBarcodeEntity>
    fun findByBarcodeIn(barcodes: Collection<String>): List<DrinkLibraryBarcodeEntity>
    fun findByDrinkIdIn(drinkIds: Collection<UUID>): List<DrinkLibraryBarcodeEntity>
}

@Repository
interface StammtischRepository : JpaRepository<StammtischEntity, UUID> {
    fun findAllByOrderByNameAsc(): List<StammtischEntity>
}

/** Mitgliedschaften im aktuellen Stammtisch (Hibernate filtert über `@TenantId`). */
@Repository
interface StammtischMemberRepository : JpaRepository<StammtischMemberEntity, UUID> {
    fun findByUserId(userId: UUID): Optional<StammtischMemberEntity>

    @EntityGraph(attributePaths = ["user"])
    fun findByActiveTrue(): List<StammtischMemberEntity>

    @EntityGraph(attributePaths = ["user"])
    fun findAllBy(): List<StammtischMemberEntity>

    fun countByActiveTrue(): Long

    @Query("select m.user.id from StammtischMemberEntity m where m.active = true")
    fun findActiveUserIds(): List<UUID>

    @Query("select (count(m) > 0) from StammtischMemberEntity m where m.user.id = :userId and m.active = true")
    fun isActiveMember(@Param("userId") userId: UUID): Boolean

    /** Im System-Kontext: alle aktiven Mitgliedschaften einer Person über alle Stammtische. */
    fun findByUserIdAndActiveTrue(userId: UUID): List<StammtischMemberEntity>
}

@Repository
interface StammtischRoleRepository : JpaRepository<StammtischRoleEntity, UUID> {
    fun findAllByOrderBySortOrderAscNameAsc(): List<StammtischRoleEntity>
    fun findByCode(code: String): Optional<StammtischRoleEntity>

    /** Für den System-Kontext, der alle Stammtische sieht. */
    fun findByStammtischId(stammtischId: UUID): List<StammtischRoleEntity>
}

@Repository
interface UserPermissionRepository : JpaRepository<UserPermissionEntity, UserPermissionId> {
    fun findByIdUserId(userId: UUID): List<UserPermissionEntity>
    fun findByStammtischIdAndIdUserId(stammtischId: UUID, userId: UUID): List<UserPermissionEntity>
    fun deleteByIdUserId(userId: UUID)
}

@Repository
interface EventRepository : JpaRepository<EventEntity, UUID> {
    fun findByOwnerId(ownerId: UUID): List<EventEntity>
    fun findByStatus(status: EventStatus): List<EventEntity>
}

@Repository
interface EventParticipantRepository : JpaRepository<EventParticipantEntity, UUID> {
    fun findByEventId(eventId: UUID): List<EventParticipantEntity>
    fun findByUserId(userId: UUID): List<EventParticipantEntity>
    fun findByEventIdAndUserId(eventId: UUID, userId: UUID): Optional<EventParticipantEntity>
    fun countByEventId(eventId: UUID): Long

    /** Eingeladene, die noch keine Einladung bekommen haben, bei veröffentlichten bzw. laufenden Events. */
    @Query(
        """
        select p from EventParticipantEntity p join fetch p.event e join fetch p.user u
        where p.invitationSentAt is null
          and e.status in :statuses
          and (e.invitationNotifyAt is null or e.invitationNotifyAt <= :now)
          and e.startsAt > :now
          and u.disabled = false
        """
    )
    fun findDueInvitations(
        @Param("statuses") statuses: Collection<EventStatus>,
        @Param("now") now: Instant
    ): List<EventParticipantEntity>

    /** Teilnehmer mit fälliger Erinnerung; der genaue Zeitpunkt wird je Event im Dienst geprüft. */
    @Query(
        """
        select p from EventParticipantEntity p join fetch p.event e join fetch p.user u
        where p.reminderSentAt is null
          and p.rsvp <> :declined
          and e.reminderHoursBefore is not null
          and e.status in :statuses
          and e.startsAt > :now
          and u.disabled = false
        """
    )
    fun findReminderCandidates(
        @Param("statuses") statuses: Collection<EventStatus>,
        @Param("declined") declined: RsvpStatus,
        @Param("now") now: Instant
    ): List<EventParticipantEntity>
}

@Repository
interface EventInviteRepository : JpaRepository<EventInviteEntity, UUID> {
    fun findByTokenHash(tokenHash: String): Optional<EventInviteEntity>
    fun findByEventId(eventId: UUID): List<EventInviteEntity>
}

@Repository
interface EventGuestRepository : JpaRepository<EventGuestEntity, UUID> {
    fun findByGuestTokenHash(guestTokenHash: String): Optional<EventGuestEntity>
    fun findByEventId(eventId: UUID): List<EventGuestEntity>
}

@Repository
interface DrinkCatalogRepository : JpaRepository<DrinkCatalogEntity, UUID> {
    fun findByActiveTrue(): List<DrinkCatalogEntity>
    fun findByStatusOrderByNameAsc(status: DrinkStatus): List<DrinkCatalogEntity>
    fun findAllByOrderByNameAsc(): List<DrinkCatalogEntity>
    fun findByLibraryDrinkIdIn(libraryDrinkIds: Collection<UUID>): List<DrinkCatalogEntity>
}

@Repository
interface DrinkBarcodeRepository : JpaRepository<DrinkBarcodeEntity, UUID> {
    fun findByBarcode(barcode: String): Optional<DrinkBarcodeEntity>
    fun findByDrinkId(drinkId: UUID): List<DrinkBarcodeEntity>
}

@Repository
interface DrinkSublistRepository : JpaRepository<DrinkSublistEntity, UUID> {
    fun findByCreatedById(createdById: UUID): List<DrinkSublistEntity>
    fun findAllByOrderByNameAsc(): List<DrinkSublistEntity>
}

@Repository
interface DrinkSublistItemRepository : JpaRepository<DrinkSublistItemEntity, UUID> {
    fun findBySublistId(sublistId: UUID): List<DrinkSublistItemEntity>
    fun findBySublistIdAndDrinkId(sublistId: UUID, drinkId: UUID): Optional<DrinkSublistItemEntity>
    fun countBySublistId(sublistId: UUID): Long
}

@Repository
interface EventDrinkRepository : JpaRepository<EventDrinkEntity, UUID> {
    fun findByEventId(eventId: UUID): List<EventDrinkEntity>
    fun findByEventIdAndDrinkId(eventId: UUID, drinkId: UUID): Optional<EventDrinkEntity>
    fun findByDrinkId(drinkId: UUID): List<EventDrinkEntity>
}

@Repository
interface FoodCatalogRepository : JpaRepository<FoodCatalogEntity, UUID> {
    fun findByActiveTrue(): List<FoodCatalogEntity>
    fun findAllByOrderByNameAsc(): List<FoodCatalogEntity>
    fun findByActiveTrueOrderByNameAsc(): List<FoodCatalogEntity>
}

@Repository
interface EventFoodRepository : JpaRepository<EventFoodEntity, UUID> {
    fun findByEventId(eventId: UUID): List<EventFoodEntity>
    fun findByEventIdAndFoodId(eventId: UUID, foodId: UUID): Optional<EventFoodEntity>
}

/**
 * Append-only Zugriff auf das Ledger: Die Schnittstelle stellt bewusst keine
 * `delete`- oder Bulk-`update`-Operationen bereit. Korrekturen erfolgen als
 * Gegenbuchung; zusätzlich verweigert die Datenbank `UPDATE`/`DELETE`.
 */
@Repository
interface LedgerEntryRepository : org.springframework.data.repository.Repository<LedgerEntryEntity, UUID> {
    fun save(entry: LedgerEntryEntity): LedgerEntryEntity
    fun saveAndFlush(entry: LedgerEntryEntity): LedgerEntryEntity
    fun findById(id: UUID): Optional<LedgerEntryEntity>
    fun count(): Long
    fun findByIdempotencyKey(idempotencyKey: String): Optional<LedgerEntryEntity>

    /** Alle Buchungen des Stammtischs für den Datenexport. */
    @EntityGraph(attributePaths = ["event", "member", "drink", "food", "actor", "reversesEntry"])
    fun findAllByOrderByCreatedAtAsc(): List<LedgerEntryEntity>

    @EntityGraph(attributePaths = ["event", "member", "drink", "actor"])
    fun findByMemberId(memberId: UUID): List<LedgerEntryEntity>

    /** Vollständiger Kontoauszug einer Person in Buchungsreihenfolge. */
    @EntityGraph(attributePaths = ["event", "member", "drink", "actor", "reversesEntry"])
    fun findByMemberIdOrderByCreatedAtAsc(memberId: UUID): List<LedgerEntryEntity>

    @EntityGraph(attributePaths = ["event", "member", "drink", "actor"])
    fun findByEventId(eventId: UUID): List<LedgerEntryEntity>

    /** Buchungen ab einem Zeitpunkt für die Vereinsstatistik. */
    @EntityGraph(attributePaths = ["event", "member", "drink", "food", "reversesEntry"])
    fun findByCreatedAtGreaterThanEqual(since: Instant): List<LedgerEntryEntity>

    /** Mehrere Buchungen samt Mitglied, z. B. um Audit-Einträge mit Namen anzuzeigen. */
    @EntityGraph(attributePaths = ["member"])
    fun findByIdIn(ids: Collection<UUID>): List<LedgerEntryEntity>

    /** Bereits vorhandene Gegenbuchungen zu einer Ursprungsbuchung (Doppelkorrektur vermeiden). */
    fun findByReversesEntryId(reversesEntryId: UUID): List<LedgerEntryEntity>

    /** Guthaben und Käufe einer Person je Event (Composite-Index). */
    @EntityGraph(attributePaths = ["event", "member", "drink", "actor"])
    fun findByEventIdAndMemberIdOrderByCreatedAtAsc(eventId: UUID, memberId: UUID): List<LedgerEntryEntity>

    /** Buchungen im Zeitraum ohne N+1-Nachladen. */
    @Query(
        """
        select l from LedgerEntryEntity l
        join fetch l.event
        join fetch l.member
        join fetch l.drink
        join fetch l.actor
        where l.createdAt >= :from and l.createdAt < :until
        order by l.createdAt asc
        """
    )
    fun findAllInPeriodWithRelations(
        @Param("from") from: Instant,
        @Param("until") until: Instant
    ): List<LedgerEntryEntity>
}

@Repository
interface PurchaseSnapshotRepository : JpaRepository<PurchaseSnapshotEntity, UUID> {
    fun findByLedgerEntryId(ledgerEntryId: UUID): Optional<PurchaseSnapshotEntity>
    fun findByLedgerEntryIdIn(ledgerEntryIds: Collection<UUID>): List<PurchaseSnapshotEntity>
}

@Repository
interface IdempotencyRecordRepository : JpaRepository<IdempotencyRecordEntity, UUID> {
    fun findByScopeAndIdempotencyKey(scope: String, idempotencyKey: String): Optional<IdempotencyRecordEntity>
    fun findByIdempotencyKey(idempotencyKey: String): List<IdempotencyRecordEntity>
}

@Repository
interface ConversationRepository : JpaRepository<ConversationEntity, UUID> {
    fun findByEventId(eventId: UUID): List<ConversationEntity>
    fun findByDirectKey(directKey: String): Optional<ConversationEntity>

    /**
     * Legt den Vereinschat an, falls es ihn noch nicht gibt. Parallele erste
     * Aufrufe erzeugen so keinen zweiten Chat und keinen Fehler.
     */
    @Modifying
    @Query(
        value = "INSERT INTO conversations (id, stammtisch_id, type, title, direct_key, created_at, version) " +
            "VALUES (:id, :stammtischId, :type, :title, :key, CURRENT_TIMESTAMP, 0) ON CONFLICT DO NOTHING",
        nativeQuery = true
    )
    fun insertKeyedIfAbsent(
        @Param("id") id: UUID,
        @Param("stammtischId") stammtischId: UUID,
        @Param("type") type: String,
        @Param("title") title: String,
        @Param("key") key: String
    ): Int

    /** Wie [insertKeyedIfAbsent], für den einen Chat eines Events. */
    @Modifying
    @Query(
        value = "INSERT INTO conversations (id, stammtisch_id, type, event_id, title, direct_key, created_at, version) " +
            "VALUES (:id, :stammtischId, :type, :eventId, :title, :key, CURRENT_TIMESTAMP, 0) ON CONFLICT DO NOTHING",
        nativeQuery = true
    )
    fun insertEventIfAbsent(
        @Param("id") id: UUID,
        @Param("stammtischId") stammtischId: UUID,
        @Param("type") type: String,
        @Param("eventId") eventId: UUID,
        @Param("title") title: String?,
        @Param("key") key: String
    ): Int
}

@Repository
interface ConversationMemberRepository : JpaRepository<ConversationMemberEntity, UUID> {
    fun findByConversationId(conversationId: UUID): List<ConversationMemberEntity>
    fun findByUserId(userId: UUID): List<ConversationMemberEntity>
    fun findByConversationIdAndUserId(conversationId: UUID, userId: UUID): Optional<ConversationMemberEntity>
    fun findByConversationIdAndGuestId(conversationId: UUID, guestId: UUID): Optional<ConversationMemberEntity>
    fun countByConversationId(conversationId: UUID): Long

    /**
     * Trägt ein Mitglied ein, falls es noch nicht eingetragen ist. Parallele
     * Aufrufe (z. B. zweimal „gelesen“ beim Öffnen) erzeugen keine Doppelzeile.
     */
    @Modifying
    @Query(
        value = "INSERT INTO conversation_members (id, stammtisch_id, conversation_id, user_id, joined_at) " +
            "VALUES (:id, :stammtischId, :conversationId, :userId, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING",
        nativeQuery = true
    )
    fun insertUserIfAbsent(
        @Param("id") id: UUID,
        @Param("stammtischId") stammtischId: UUID,
        @Param("conversationId") conversationId: UUID,
        @Param("userId") userId: UUID
    ): Int
}

@Repository
interface ChatMessageRepository : JpaRepository<ChatMessageEntity, UUID> {
    fun findByConversationIdOrderByCreatedAtAsc(conversationId: UUID): List<ChatMessageEntity>
    fun findFirstByConversationIdOrderByCreatedAtDesc(conversationId: UUID): Optional<ChatMessageEntity>

    /** Ungelesene Nachrichten anderer (Mitglieder oder Gäste) seit `after`. */
    @Query(
        """
        select count(m) from ChatMessageEntity m left join m.sender s
        where m.conversation.id = :conversationId
          and m.createdAt > :after
          and (s is null or s.id <> :userId)
        """
    )
    fun countUnread(
        @Param("conversationId") conversationId: UUID,
        @Param("userId") userId: UUID,
        @Param("after") after: Instant
    ): Long
}

@Repository
interface ChatReactionRepository : JpaRepository<ChatReactionEntity, UUID> {
    fun findByMessageIdIn(messageIds: Collection<UUID>): List<ChatReactionEntity>
    fun findByMessageIdAndUserIdAndEmoji(messageId: UUID, userId: UUID, emoji: String): Optional<ChatReactionEntity>
}

@Repository
interface NotificationRepository : JpaRepository<NotificationEntity, UUID> {
    fun findByUserIdOrderByCreatedAtDesc(userId: UUID): List<NotificationEntity>
    fun findByUserIdAndReadFalse(userId: UUID): List<NotificationEntity>
}

@Repository
interface PushSubscriptionRepository : JpaRepository<PushSubscriptionEntity, UUID> {
    fun findByUserId(userId: UUID): List<PushSubscriptionEntity>
    fun findByEndpoint(endpoint: String): Optional<PushSubscriptionEntity>
}

@Repository
interface MomentSessionRepository : JpaRepository<MomentSessionEntity, UUID> {
    fun findByEventIdAndActiveTrue(eventId: UUID): List<MomentSessionEntity>
    fun findByEventIdAndCreatorIdAndActiveTrue(eventId: UUID, creatorId: UUID): List<MomentSessionEntity>
    fun findByEventIdOrderByCreatedAtDesc(eventId: UUID): List<MomentSessionEntity>
}

@Repository
interface MomentResponseRepository : JpaRepository<MomentResponseEntity, UUID> {
    fun findByMomentIdOrderByCreatedAtAsc(momentId: UUID): List<MomentResponseEntity>
    fun findByMomentId(momentId: UUID): List<MomentResponseEntity>
    fun findByUserId(userId: UUID): List<MomentResponseEntity>
    fun countByMomentId(momentId: UUID): Long
}

@Repository
interface AuditLogRepository :
    JpaRepository<AuditLogEntity, UUID>,
    JpaSpecificationExecutor<AuditLogEntity> {
    fun findByTargetEntityAndTargetId(targetEntity: String, targetId: String): List<AuditLogEntity>
    fun findByActorId(actorId: UUID): List<AuditLogEntity>
}

@Repository
interface ImageAssetRepository : JpaRepository<ImageAssetEntity, UUID> {
    fun findByPurposeAndTargetIdAndStatus(
        purpose: ImagePurpose,
        targetId: UUID?,
        status: ImageStatus
    ): List<ImageAssetEntity>

    fun findByOwnerIdAndStatus(ownerId: UUID, status: ImageStatus): List<ImageAssetEntity>

    /** Belegter Speicher der aktuellen Bilder des Stammtischs (Tarifgrenze). */
    @Query("select coalesce(sum(i.sizeBytes), 0) from ImageAssetEntity i where i.status = :status")
    fun sumSizeBytesByStatus(@Param("status") status: ImageStatus): Long

    /** Höchste bisher vergebene fachliche Bildversion eines Objekts (für die Fortschreibung). */
    @Query(
        """
        select coalesce(max(i.imageVersion), 0) from ImageAssetEntity i
        where i.purpose = :purpose and (:targetId is null or i.targetId = :targetId)
        """
    )
    fun findMaxImageVersion(
        @Param("purpose") purpose: ImagePurpose,
        @Param("targetId") targetId: UUID?
    ): Int
}

@Repository
interface MemberInviteRepository : JpaRepository<MemberInviteEntity, UUID> {
    fun findByTokenHash(tokenHash: String): Optional<MemberInviteEntity>

    /** Sperrt die Zeile, damit parallele Registrierungen die Nutzungsgrenze nicht überschreiten. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from MemberInviteEntity i where i.tokenHash = :tokenHash")
    fun findByTokenHashForUpdate(@Param("tokenHash") tokenHash: String): Optional<MemberInviteEntity>

    fun findAllByOrderByCreatedAtDesc(): List<MemberInviteEntity>
}

@Repository
interface MemberInviteRedemptionRepository : JpaRepository<MemberInviteRedemptionEntity, UUID> {
    @EntityGraph(attributePaths = ["user"])
    fun findByInviteIdIn(inviteIds: Collection<UUID>): List<MemberInviteRedemptionEntity>
}

@Repository
interface KioskSessionRepository : JpaRepository<KioskSessionEntity, UUID> {
    /** Sperrt die Zeile, damit parallele PIN-Versuche den Fehlerzähler nicht überholen. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select k from KioskSessionEntity k where k.id = :id")
    fun findByIdForUpdate(@Param("id") id: UUID): Optional<KioskSessionEntity>

    @EntityGraph(attributePaths = ["startedBy"])
    fun findByEndedAtIsNullOrderByStartedAtAsc(): List<KioskSessionEntity>

    fun countByEndedAtIsNull(): Long
}

@Repository
interface MomentTypeRepository : JpaRepository<MomentTypeEntity, UUID> {
    fun findByCode(code: String): Optional<MomentTypeEntity>
    fun findAllByOrderBySortOrderAscNameAsc(): List<MomentTypeEntity>

    @Query("select coalesce(max(t.sortOrder), 0) from MomentTypeEntity t")
    fun findMaxSortOrder(): Int
}

@Repository
interface MomentReactionRepository : JpaRepository<MomentReactionEntity, UUID> {
    fun findByCode(code: String): Optional<MomentReactionEntity>
    fun findAllByOrderBySortOrderAscNameAsc(): List<MomentReactionEntity>

    @Query("select coalesce(max(r.sortOrder), 0) from MomentReactionEntity r")
    fun findMaxSortOrder(): Int
}

@Repository
interface MomentMediaRepository : JpaRepository<MomentMediaEntity, UUID> {
    fun findByResponseIdIn(responseIds: Collection<UUID>): List<MomentMediaEntity>
    fun countByMomentIdAndOwnerId(momentId: UUID, ownerId: UUID): Long
    fun findByResponseIsNullAndCreatedAtBefore(cutoff: Instant): List<MomentMediaEntity>

    /** Belegter Speicher aller Moment-Medien des Stammtischs (Tarifgrenze). */
    @Query("select coalesce(sum(m.sizeBytes), 0) from MomentMediaEntity m")
    fun sumSizeBytes(): Long
}

@Repository
interface StammtischSubscriptionRepository : JpaRepository<StammtischSubscriptionEntity, UUID> {
    fun findByStripeSubscriptionId(stripeSubscriptionId: String): Optional<StammtischSubscriptionEntity>
    fun findFirstByStripeCustomerId(stripeCustomerId: String): Optional<StammtischSubscriptionEntity>
}

@Repository
interface BillingEventRepository : JpaRepository<BillingEventEntity, String>
