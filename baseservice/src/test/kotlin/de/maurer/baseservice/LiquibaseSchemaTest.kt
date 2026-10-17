package de.maurer.baseservice

import de.maurer.baseservice.domain.*
import de.maurer.baseservice.repository.*
import de.maurer.baseservice.security.UserRole
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class LiquibaseSchemaTest @Autowired constructor(
    private val userRepository: UserRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userPermissionRepository: UserPermissionRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val eventInviteRepository: EventInviteRepository,
    private val eventGuestRepository: EventGuestRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val drinkBarcodeRepository: DrinkBarcodeRepository,
    private val drinkSublistRepository: DrinkSublistRepository,
    private val drinkSublistItemRepository: DrinkSublistItemRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val foodCatalogRepository: FoodCatalogRepository,
    private val eventFoodRepository: EventFoodRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val purchaseSnapshotRepository: PurchaseSnapshotRepository,
    private val idempotencyRecordRepository: IdempotencyRecordRepository,
    private val conversationRepository: ConversationRepository,
    private val conversationMemberRepository: ConversationMemberRepository,
    private val chatMessageRepository: ChatMessageRepository,
    private val notificationRepository: NotificationRepository,
    private val pushSubscriptionRepository: PushSubscriptionRepository,
    private val momentSessionRepository: MomentSessionRepository,
    private val momentResponseRepository: MomentResponseRepository,
    private val auditLogRepository: AuditLogRepository,
    private val jdbcTemplate: JdbcTemplate
) {

    @Test
    @Transactional
    fun `persists and queries full relational domain model`() {
        // 1. Users and roles
        val userId = UUID.randomUUID()
        val user = UserEntity(
            id = userId,
            keycloakSubject = "kc-sub-12345",
            email = "user@example.com",
            displayName = "Max Mustermann"
        )
        userRepository.save(user)

        val role = UserRoleEntity(id = UserRoleId(userId = userId, role = UserRole.BOARD), user = user)
        userRoleRepository.save(role)

        val permission = UserPermissionEntity(id = UserPermissionId(userId = userId, permission = "ledger.read"), user = user)
        userPermissionRepository.save(permission)

        val foundUser = userRepository.findById(userId).orElseThrow()
        assertEquals("Max Mustermann", foundUser.displayName)
        assertEquals("kc-sub-12345", foundUser.keycloakSubject)

        val foundRoles = userRoleRepository.findByIdUserId(userId)
        assertEquals(1, foundRoles.size)
        assertEquals(UserRole.BOARD, foundRoles[0].id.role)

        // 2. Events and participants
        val eventId = UUID.randomUUID()
        val event = EventEntity(
            id = eventId,
            title = "Sommerfest 2026",
            description = "Jährliches Sommerfest",
            location = "Vereinsheim",
            startsAt = Instant.now(),
            owner = user
        )
        eventRepository.save(event)

        val participantId = UUID.randomUUID()
        val participant = EventParticipantEntity(
            id = participantId,
            event = event,
            user = user,
            role = "owner"
        )
        eventParticipantRepository.save(participant)

        val foundEvent = eventRepository.findById(eventId).orElseThrow()
        assertEquals("Sommerfest 2026", foundEvent.title)

        // 3. Drink catalog, barcodes, and sublists
        val drinkId = UUID.randomUUID()
        val drink = DrinkCatalogEntity(
            id = drinkId,
            name = "Club Mate",
            category = "Erfrischung",
            defaultPrice = BigDecimal("2.50")
        )
        drinkCatalogRepository.save(drink)

        val barcodeId = UUID.randomUUID()
        val barcode = DrinkBarcodeEntity(
            id = barcodeId,
            drink = drink,
            barcode = "4029764001807"
        )
        drinkBarcodeRepository.save(barcode)

        val sublistId = UUID.randomUUID()
        val sublist = DrinkSublistEntity(
            id = sublistId,
            name = "Standardgetränke",
            createdBy = user
        )
        drinkSublistRepository.save(sublist)

        val sublistItemId = UUID.randomUUID()
        val sublistItem = DrinkSublistItemEntity(
            id = sublistItemId,
            sublist = sublist,
            drink = drink,
            defaultPrice = BigDecimal("2.50")
        )
        drinkSublistItemRepository.save(sublistItem)

        // 4. Event Drinks
        val eventDrinkId = UUID.randomUUID()
        val eventDrink = EventDrinkEntity(
            id = eventDrinkId,
            event = event,
            drink = drink,
            price = BigDecimal("2.50"),
            costPrice = BigDecimal("1.20"),
            catalogVersion = 1
        )
        eventDrinkRepository.save(eventDrink)

        // 4b. Food Catalog & Event Food
        val foodId = UUID.randomUUID()
        val food = FoodCatalogEntity(
            id = foodId,
            name = "Bratwurst",
            description = "Frisch vom Grill",
            category = "Grill",
            defaultPrice = BigDecimal("3.50"),
            costPrice = BigDecimal("1.50"),
            currency = "EUR",
            createdBy = user
        )
        foodCatalogRepository.save(food)

        val eventFoodId = UUID.randomUUID()
        val eventFood = EventFoodEntity(
            id = eventFoodId,
            event = event,
            food = food,
            price = BigDecimal("4.00"),
            costPrice = BigDecimal("1.80"),
            currency = "EUR"
        )
        eventFoodRepository.save(eventFood)

        // 5. Ledger entries and purchase snapshots
        val ledgerId = UUID.randomUUID()
        val ledgerEntry = LedgerEntryEntity(
            id = ledgerId,
            event = event,
            member = user,
            drink = drink,
            amount = BigDecimal("2.50"),
            accountingMode = AccountingMode.credit,
            source = PurchaseSource.pwaBarcode,
            actor = user,
            idempotencyKey = "idem-key-1001"
        )
        ledgerEntryRepository.save(ledgerEntry)

        val snapshotId = UUID.randomUUID()
        val snapshot = PurchaseSnapshotEntity(
            id = snapshotId,
            ledgerEntry = ledgerEntry,
            itemType = "DRINK",
            drinkName = "Club Mate",
            barcode = "4029764001807",
            unitPrice = BigDecimal("2.50"),
            costPrice = BigDecimal("1.20"),
            profit = BigDecimal("1.30"),
            catalogVersion = 1
        )
        purchaseSnapshotRepository.save(snapshot)

        // 5b. Food Ledger entry
        val foodLedgerId = UUID.randomUUID()
        val foodLedgerEntry = LedgerEntryEntity(
            id = foodLedgerId,
            event = event,
            member = user,
            food = food,
            amount = BigDecimal("4.00"),
            accountingMode = AccountingMode.credit,
            source = PurchaseSource.tabletManual,
            actor = user,
            idempotencyKey = "idem-key-1002"
        )
        ledgerEntryRepository.save(foodLedgerEntry)

        val foodSnapshotId = UUID.randomUUID()
        val foodSnapshot = PurchaseSnapshotEntity(
            id = foodSnapshotId,
            ledgerEntry = foodLedgerEntry,
            itemType = "FOOD",
            foodName = "Bratwurst",
            unitPrice = BigDecimal("4.00"),
            costPrice = BigDecimal("1.80"),
            profit = BigDecimal("2.20")
        )
        purchaseSnapshotRepository.save(foodSnapshot)

        val foundLedger = ledgerEntryRepository.findById(ledgerId).orElseThrow()
        assertEquals("idem-key-1001", foundLedger.idempotencyKey)
        assertEquals(AccountingMode.credit, foundLedger.accountingMode)
        assertEquals(PurchaseSource.pwaBarcode, foundLedger.source)
        val foundSnapshot = purchaseSnapshotRepository.findByLedgerEntryId(ledgerId).orElseThrow()
        assertEquals("Club Mate", foundSnapshot.drinkName)

        // 6. Idempotency records
        val idempotencyRecord = IdempotencyRecordEntity(
            id = UUID.randomUUID(),
            idempotencyKey = "idem-key-1001",
            scope = "purchase",
            requestHash = "hash123",
            responseStatus = 200,
            responsePayload = "{\"status\":\"ok\"}",
            expiresAt = Instant.now().plusSeconds(86400)
        )
        idempotencyRecordRepository.save(idempotencyRecord)

        // 7. Conversations, messages and notifications
        val convId = UUID.randomUUID()
        val conversation = ConversationEntity(
            id = convId,
            type = "event",
            event = event,
            title = "Sommerfest Chat"
        )
        conversationRepository.save(conversation)

        val momentConvId = UUID.randomUUID()
        val momentConversation = ConversationEntity(
            id = momentConvId,
            type = "moment",
            event = event,
            title = "Moment: Anstoßen",
            expiresAt = Instant.now().plusSeconds(86400)
        )
        conversationRepository.save(momentConversation)

        val memberId = UUID.randomUUID()
        val convMember = ConversationMemberEntity(
            id = memberId,
            conversation = conversation,
            user = user
        )
        conversationMemberRepository.save(convMember)

        val msgId = UUID.randomUUID()
        val chatMessage = ChatMessageEntity(
            id = msgId,
            conversation = conversation,
            sender = user,
            message = "Hallo alle zusammen!"
        )
        chatMessageRepository.save(chatMessage)

        val notifId = UUID.randomUUID()
        val notification = NotificationEntity(
            id = notifId,
            user = user,
            title = "Neues Event",
            body = "Du wurdest zum Sommerfest eingeladen.",
            type = "event_invite"
        )
        notificationRepository.save(notification)

        val subscrId = UUID.randomUUID()
        val pushSubscription = PushSubscriptionEntity(
            id = subscrId,
            user = user,
            endpoint = "https://push.example.com/endpoint1",
            p256dh = "p256dh-key-sample",
            auth = "auth-secret-sample"
        )
        pushSubscriptionRepository.save(pushSubscription)

        val sessionId = UUID.randomUUID()
        val session = MomentSessionEntity(
            id = sessionId,
            creator = user,
            event = event,
            title = "Anstoßen",
            topicType = "toast",
            latitude = 48.1351,
            longitude = 11.5820,
            message = "Am Tresen",
            expiresAt = Instant.now().plusSeconds(3600)
        )
        momentSessionRepository.save(session)

        val responseId = UUID.randomUUID()
        val momentResponse = MomentResponseEntity(
            id = responseId,
            moment = session,
            user = user,
            reaction = "CHEERS",
            statusText = "Dabei!",
            latitude = 48.1352,
            longitude = 11.5821
        )
        momentResponseRepository.save(momentResponse)

        val auditId = UUID.randomUUID()
        val auditLog = AuditLogEntity(
            id = auditId,
            actor = user,
            action = "EVENT_CREATE",
            targetEntity = "Event",
            targetId = eventId.toString(),
            details = "Event angelegt"
        )
        auditLogRepository.save(auditLog)

        assertNotNull(notificationRepository.findById(notifId).orElse(null))

        // Chat-Nachrichten und Benachrichtigungen liegen nur verschlüsselt in der Datenbank.
        chatMessageRepository.flush()
        val storedMessage = jdbcTemplate.queryForObject(
            "SELECT message FROM chat_messages WHERE id = ?", String::class.java, msgId
        )!!
        assertTrue(storedMessage.startsWith("enc:v1:"))
        assertFalse(storedMessage.contains("Hallo"))
        val storedNotification = jdbcTemplate.queryForMap(
            "SELECT title, body FROM notifications WHERE id = ?", notifId
        )
        for (column in listOf("title", "body")) {
            val value = storedNotification.entries.first { it.key.equals(column, ignoreCase = true) }.value as String
            assertTrue(value.startsWith("enc:v1:"), column)
            assertFalse(value.contains("Sommerfest") || value.contains("Event"), column)
        }
        assertNotNull(pushSubscriptionRepository.findById(subscrId).orElse(null))
        assertNotNull(momentSessionRepository.findById(sessionId).orElse(null))
        assertNotNull(momentResponseRepository.findById(responseId).orElse(null))
        assertNotNull(auditLogRepository.findById(auditId).orElse(null))
    }

    @Test
    @Transactional
    fun `persists a topup ledger entry without event or drink`() {
        val user = userRepository.saveAndFlush(
            UserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = "kc-topup-${UUID.randomUUID()}",
                displayName = "Topup Member"
            )
        )

        val topup = LedgerEntryEntity(
            id = UUID.randomUUID(),
            entryType = LedgerEntryType.topup,
            member = user,
            amount = BigDecimal("10.00"),
            accountingMode = AccountingMode.credit,
            actor = user,
            idempotencyKey = "ledger-topup-${UUID.randomUUID()}"
        )
        val saved = ledgerEntryRepository.saveAndFlush(topup)

        val found = ledgerEntryRepository.findById(saved.id).orElseThrow()
        assertEquals(LedgerEntryType.topup, found.entryType)
        assertNull(found.event)
        assertNull(found.drink)
        assertNull(found.source)
        assertEquals(0, BigDecimal("10.00").compareTo(found.amount))
    }

    @Test
    fun `enforces unique constraints on keycloak subject and idempotency keys`() {
        val user1 = UserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "kc-unique-test",
            email = "user1@example.com",
            displayName = "User 1"
        )
        userRepository.save(user1)

        val user2 = UserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "kc-unique-test", // duplicate subject
            email = "user2@example.com",
            displayName = "User 2"
        )
        assertThrows(DataIntegrityViolationException::class.java) {
            userRepository.saveAndFlush(user2)
        }
    }

    /**
     * Die Entitäten bilden die Statusspalten als Enum ab; ungültige Werte lassen sich
     * darüber nicht mehr schreiben. Der `CHECK`-Constraint der Datenbank wird deshalb
     * bewusst über natives SQL geprüft.
     */
    @Test
    fun `rejects invalid enum values through database check constraints`() {
        val owner = userRepository.saveAndFlush(
            UserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = "kc-check-${UUID.randomUUID()}",
                displayName = "Check Owner"
            )
        )

        assertThrows(DataIntegrityViolationException::class.java) {
            jdbcTemplate.update(
                "INSERT INTO events (id, title, starts_at, status, owner_id) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID(),
                "Ungültiger Status",
                Timestamp.from(Instant.now()),
                "activ",
                owner.id
            )
        }
    }

    @Test
    fun `rejects an invalid board role through the check constraint`() {
        val user = userRepository.saveAndFlush(
            UserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = "kc-board-${UUID.randomUUID()}",
                displayName = "Falsche Vorstandsrolle"
            )
        )

        // Die Vorstandsfunktion gehört seit Migration 013 zur Mitgliedschaft im Stammtisch.
        assertThrows(DataIntegrityViolationException::class.java) {
            jdbcTemplate.update(
                "INSERT INTO stammtisch_members (id, stammtisch_id, user_id, active, board_role) VALUES (?, ?, ?, TRUE, ?)",
                UUID.randomUUID(),
                DEFAULT_STAMMTISCH,
                user.id,
                "kassenwart"
            )
        }
    }

    @Test
    fun `rejects an invalid user role through the check constraint`() {
        val owner = userRepository.saveAndFlush(
            UserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = "kc-role-${UUID.randomUUID()}",
                displayName = "Falsche Rolle"
            )
        )

        // Rollen müssen im Stammtisch definiert sein (Fremdschlüssel auf stammtisch_roles).
        assertThrows(DataIntegrityViolationException::class.java) {
            jdbcTemplate.update(
                "INSERT INTO user_roles (stammtisch_id, user_id, role) VALUES (?, ?, ?)",
                DEFAULT_STAMMTISCH,
                owner.id,
                "vorstandsmitglied"
            )
        }
    }

    @Test
    fun `idempotency keys are unique per scope only`() {
        val sharedKey = "idem-shared-${UUID.randomUUID()}"

        idempotencyRecordRepository.saveAndFlush(
            IdempotencyRecordEntity(
                id = UUID.randomUUID(),
                idempotencyKey = sharedKey,
                scope = "purchase",
                expiresAt = Instant.now().plusSeconds(3600)
            )
        )

        // Gleicher Schlüssel in einem anderen Kontext ist zulässig
        idempotencyRecordRepository.saveAndFlush(
            IdempotencyRecordEntity(
                id = UUID.randomUUID(),
                idempotencyKey = sharedKey,
                scope = "correction",
                expiresAt = Instant.now().plusSeconds(3600)
            )
        )

        // Gleicher Schlüssel im selben Kontext verletzt den kombinierten Constraint
        assertThrows(DataIntegrityViolationException::class.java) {
            idempotencyRecordRepository.saveAndFlush(
                IdempotencyRecordEntity(
                    id = UUID.randomUUID(),
                    idempotencyKey = sharedKey,
                    scope = "purchase",
                    expiresAt = Instant.now().plusSeconds(3600)
                )
            )
        }
    }

    @Test
    fun `optimistic locking version and audit timestamps are maintained automatically`() {
        val user = userRepository.saveAndFlush(
            UserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = "kc-version-${UUID.randomUUID()}",
                displayName = "Version Original"
            )
        )

        assertEquals(0L, user.version)
        assertNotNull(user.createdAt)
        val createdAt = user.createdAt

        user.displayName = "Version Updated"
        val updated = userRepository.saveAndFlush(user)

        assertEquals(1L, updated.version)
        assertEquals(createdAt, updated.createdAt)
        assertTrue(!updated.updatedAt.isBefore(createdAt))
    }

    companion object {
        private val DEFAULT_STAMMTISCH: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
    }

    @Test
    fun `seeds the shared drink library with real drinks and their barcodes`() {
        val drinks = jdbcTemplate.queryForObject("select count(*) from drink_library", Int::class.java)!!
        assertTrue(drinks >= 90, "Startbestand der Getränkedatenbank fehlt: $drinks")
        val name = jdbcTemplate.queryForObject(
            """
            select d.name from drink_library d
            join drink_library_barcodes b on b.library_drink_id = d.id
            where b.barcode = '4008287054026'
            """.trimIndent(),
            String::class.java
        )
        assertEquals("Krombacher Pils 0,5 l", name)
        assertEquals(
            0,
            jdbcTemplate.queryForObject(
                "select count(*) from information_schema.tables where lower(table_name) like 'drink_library_seed%'",
                Int::class.java
            )
        )
    }
}
