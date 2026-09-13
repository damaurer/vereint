package de.maurer.baseservice

import de.maurer.baseservice.domain.AccountingMode
import de.maurer.baseservice.domain.DrinkBarcodeEntity
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.PurchaseSnapshotEntity
import de.maurer.baseservice.domain.PurchaseSource
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CorrectionRequest
import de.maurer.baseservice.dto.PayoutRequest
import de.maurer.baseservice.dto.PurchaseRequest
import de.maurer.baseservice.dto.TopupRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.IdempotencyConflictException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.repository.DrinkBarcodeRepository
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.IdempotencyRecordRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.PurchaseSnapshotRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.service.UserService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.ArgumentMatchers.any
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.junit.jupiter.MockitoSettings
import org.mockito.quality.Strictness
import java.math.BigDecimal
import java.util.Optional
import java.util.UUID

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LedgerServiceTest {

    @Mock
    private lateinit var ledgerEntryRepository: LedgerEntryRepository

    @Mock
    private lateinit var idempotencyRecordRepository: IdempotencyRecordRepository

    @Mock
    private lateinit var purchaseSnapshotRepository: PurchaseSnapshotRepository

    @Mock
    private lateinit var userRepository: UserRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var drinkBarcodeRepository: DrinkBarcodeRepository

    @Mock
    private lateinit var eventDrinkRepository: EventDrinkRepository

    @Mock
    private lateinit var userService: UserService

    @Mock
    private lateinit var auditService: AuditService

    private lateinit var ledgerService: LedgerService

    private val adminId: UUID = UUID.randomUUID()
    private val memberId: UUID = UUID.randomUUID()

    private val eventId: UUID = UUID.randomUUID()
    private val drinkId: UUID = UUID.randomUUID()
    private val barcode = "4000000000001"

    private fun anyLedgerEntry(): LedgerEntryEntity = any(LedgerEntryEntity::class.java) ?: LedgerEntryEntity()

    private fun anyPurchaseSnapshot(): PurchaseSnapshotEntity =
        any(PurchaseSnapshotEntity::class.java) ?: PurchaseSnapshotEntity()

    private fun admin() = UserEntity(id = adminId, keycloakSubject = "sub-admin", displayName = "Admin")

    private fun member() = UserEntity(id = memberId, keycloakSubject = "sub-member", displayName = "Member")

    private fun adminPrincipal() = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

    private fun memberPrincipal() = UserPrincipal(subject = "sub-member", roles = setOf(UserRole.MEMBER))

    private fun guestPrincipal() = UserPrincipal(subject = "sub-guest", roles = emptySet())

    private fun activeEvent() = EventEntity(id = eventId, title = "Fest", status = EventStatus.active)

    private fun approvedDrink() = DrinkCatalogEntity(
        id = drinkId,
        name = "Cola",
        status = DrinkStatus.approved,
        active = true,
        imageReference = "img/cola.png"
    )

    private fun eventDrink(selfService: Boolean = true) = EventDrinkEntity(
        event = activeEvent(),
        drink = approvedDrink(),
        price = BigDecimal("2.50"),
        currency = "EUR",
        selfServiceEnabled = selfService,
        tabletEnabled = true,
        catalogVersion = 3,
        imageSnapshot = "img/cola-v3.png"
    )

    private fun stubPurchaseResolution(selfService: Boolean = true) {
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(drinkBarcodeRepository.findByBarcode(barcode))
            .thenReturn(Optional.of(DrinkBarcodeEntity(drink = approvedDrink(), barcode = barcode, active = true)))
        `when`(eventDrinkRepository.findByEventIdAndDrinkId(eventId, drinkId))
            .thenReturn(Optional.of(eventDrink(selfService)))
    }

    @BeforeEach
    fun setup() {
        ledgerService = LedgerService(
            ledgerEntryRepository,
            idempotencyRecordRepository,
            purchaseSnapshotRepository,
            userRepository,
            userRoleRepository,
            eventRepository,
            drinkBarcodeRepository,
            eventDrinkRepository,
            userService,
            auditService
        )
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: adminId)).thenReturn(emptyList())
        `when`(idempotencyRecordRepository.findByScopeAndIdempotencyKey(anyString(), anyString()))
            .thenReturn(Optional.empty())
        `when`(ledgerEntryRepository.findByIdempotencyKey(anyString())).thenReturn(Optional.empty())
    }

    @Test
    fun `topup by admin appends a topup entry`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        `when`(ledgerEntryRepository.save(anyLedgerEntry())).thenAnswer { it.arguments[0] }

        val dto = ledgerService.topup(
            TopupRequest(memberId = memberId.toString(), amount = BigDecimal("10.00")),
            "idem-topup-1",
            adminPrincipal()
        )

        assertEquals(LedgerEntryType.topup.name, dto.entryType)
        assertEquals(memberId.toString(), dto.memberId)
        assertEquals(0, BigDecimal("10.00").compareTo(dto.amount))
        assertEquals("EUR", dto.currency)
        assertEquals("idem-topup-1", dto.idempotencyKey)
        verify(ledgerEntryRepository).save(anyLedgerEntry())
        verify(auditService).recordLedgerEntry(
            any(),
            eq(AuditService.ACTION_LEDGER_TOPUP) ?: AuditService.ACTION_LEDGER_TOPUP,
            any(UUID::class.java) ?: adminId,
            anyString()
        )
    }

    @Test
    fun `topup is denied for a plain member`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())

        val ex = assertThrows(AccessDeniedException::class.java) {
            ledgerService.topup(
                TopupRequest(memberId = memberId.toString(), amount = BigDecimal("5.00")),
                "idem-topup-2",
                memberPrincipal()
            )
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `topup requires an idempotency key`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())

        val ex = assertThrows(InvalidRequestException::class.java) {
            ledgerService.topup(
                TopupRequest(memberId = memberId.toString(), amount = BigDecimal("5.00")),
                "  ",
                adminPrincipal()
            )
        }
        assertEquals(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `topup replays the existing entry for a repeated matching key`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        val existing = LedgerEntryEntity(
            entryType = LedgerEntryType.topup,
            member = member(),
            amount = BigDecimal("10.00"),
            currency = "EUR",
            actor = admin(),
            idempotencyKey = "idem-topup-1"
        )
        `when`(ledgerEntryRepository.findByIdempotencyKey("idem-topup-1")).thenReturn(Optional.of(existing))

        val dto = ledgerService.topup(
            TopupRequest(memberId = memberId.toString(), amount = BigDecimal("10.00")),
            "idem-topup-1",
            adminPrincipal()
        )

        assertEquals(existing.id.toString(), dto.id)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `topup with a reused key but different amount is a conflict`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        val existing = LedgerEntryEntity(
            entryType = LedgerEntryType.topup,
            member = member(),
            amount = BigDecimal("10.00"),
            currency = "EUR",
            actor = admin(),
            idempotencyKey = "idem-topup-1"
        )
        `when`(ledgerEntryRepository.findByIdempotencyKey("idem-topup-1")).thenReturn(Optional.of(existing))

        val ex = assertThrows(IdempotencyConflictException::class.java) {
            ledgerService.topup(
                TopupRequest(memberId = memberId.toString(), amount = BigDecimal("99.00")),
                "idem-topup-1",
                adminPrincipal()
            )
        }
        assertEquals(ErrorCode.IDEMPOTENCY_CONFLICT, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `payout by admin appends a payout entry`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        `when`(ledgerEntryRepository.save(anyLedgerEntry())).thenAnswer { it.arguments[0] }

        val dto = ledgerService.payout(
            PayoutRequest(memberId = memberId.toString(), amount = BigDecimal("4.50")),
            "idem-payout-1",
            adminPrincipal()
        )

        assertEquals(LedgerEntryType.payout.name, dto.entryType)
        assertEquals(0, BigDecimal("4.50").compareTo(dto.amount))
        verify(ledgerEntryRepository).save(anyLedgerEntry())
    }

    @Test
    fun `correction creates a compensating entry referencing the original`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        val original = LedgerEntryEntity(
            entryType = LedgerEntryType.purchase,
            event = EventEntity(id = UUID.randomUUID(), title = "Fest"),
            member = member(),
            drink = DrinkCatalogEntity(id = UUID.randomUUID(), name = "Cola"),
            amount = BigDecimal("2.50"),
            currency = "EUR",
            accountingMode = AccountingMode.credit,
            actor = admin(),
            idempotencyKey = "purchase-1"
        )
        `when`(ledgerEntryRepository.findById(original.id)).thenReturn(Optional.of(original))
        `when`(ledgerEntryRepository.findByReversesEntryId(original.id)).thenReturn(emptyList())
        `when`(ledgerEntryRepository.save(anyLedgerEntry())).thenAnswer { it.arguments[0] }

        val dto = ledgerService.correct(
            CorrectionRequest(originalEntryId = original.id.toString(), reason = "Fehlbuchung"),
            "idem-correction-1",
            adminPrincipal()
        )

        assertEquals(LedgerEntryType.correction.name, dto.entryType)
        assertEquals(original.id.toString(), dto.reversesEntryId)
        assertEquals(memberId.toString(), dto.memberId)
        assertEquals(0, BigDecimal("2.50").compareTo(dto.amount))
        verify(ledgerEntryRepository).save(anyLedgerEntry())
    }

    @Test
    fun `correction rejects an already corrected entry`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        val original = LedgerEntryEntity(
            entryType = LedgerEntryType.topup,
            member = member(),
            amount = BigDecimal("10.00"),
            currency = "EUR",
            actor = admin(),
            idempotencyKey = "topup-x"
        )
        val existingCorrection = LedgerEntryEntity(
            entryType = LedgerEntryType.correction,
            member = member(),
            amount = BigDecimal("10.00"),
            currency = "EUR",
            actor = admin(),
            reversesEntry = original,
            idempotencyKey = "correction-x"
        )
        `when`(ledgerEntryRepository.findById(original.id)).thenReturn(Optional.of(original))
        `when`(ledgerEntryRepository.findByReversesEntryId(original.id)).thenReturn(listOf(existingCorrection))

        val ex = assertThrows(ApiException::class.java) {
            ledgerService.correct(
                CorrectionRequest(originalEntryId = original.id.toString()),
                "idem-correction-2",
                adminPrincipal()
            )
        }
        assertEquals(ErrorCode.LEDGER_ALREADY_CORRECTED, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `correction cannot correct another correction`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        val correction = LedgerEntryEntity(
            entryType = LedgerEntryType.correction,
            member = member(),
            amount = BigDecimal("10.00"),
            currency = "EUR",
            actor = admin(),
            idempotencyKey = "correction-y"
        )
        `when`(ledgerEntryRepository.findById(correction.id)).thenReturn(Optional.of(correction))

        val ex = assertThrows(InvalidRequestException::class.java) {
            ledgerService.correct(
                CorrectionRequest(originalEntryId = correction.id.toString()),
                "idem-correction-3",
                adminPrincipal()
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `barcode purchase by member appends a purchase with a receipt snapshot`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())
        stubPurchaseResolution()
        `when`(ledgerEntryRepository.save(anyLedgerEntry())).thenAnswer { it.arguments[0] }
        `when`(purchaseSnapshotRepository.save(anyPurchaseSnapshot())).thenAnswer { it.arguments[0] }

        val dto = ledgerService.purchaseByBarcode(
            PurchaseRequest(eventId = eventId.toString(), barcode = barcode),
            "purchase-1",
            memberPrincipal()
        )

        assertEquals(LedgerEntryType.purchase.name, dto.entryType)
        assertEquals(PurchaseSource.pwaBarcode.name, dto.source)
        assertEquals("credit", dto.accountingMode)
        assertEquals(memberId.toString(), dto.memberId)
        assertEquals(eventId.toString(), dto.eventId)
        assertEquals(drinkId.toString(), dto.drinkId)
        assertEquals(0, BigDecimal("2.50").compareTo(dto.amount))
        assertEquals("EUR", dto.currency)
        assertNotNull(dto.snapshot)
        assertEquals("Cola", dto.snapshot?.drinkName)
        assertEquals(barcode, dto.snapshot?.barcode)
        assertEquals(3, dto.snapshot?.catalogVersion)
        verify(ledgerEntryRepository).save(anyLedgerEntry())
        verify(purchaseSnapshotRepository).save(anyPurchaseSnapshot())
        verify(auditService).recordLedgerEntry(
            any(),
            eq(AuditService.ACTION_LEDGER_PURCHASE) ?: AuditService.ACTION_LEDGER_PURCHASE,
            any(UUID::class.java) ?: memberId,
            anyString()
        )
    }

    @Test
    fun `barcode purchase requires an idempotency key`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())

        val ex = assertThrows(InvalidRequestException::class.java) {
            ledgerService.purchaseByBarcode(
                PurchaseRequest(eventId = eventId.toString(), barcode = barcode),
                " ",
                memberPrincipal()
            )
        }
        assertEquals(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `barcode purchase is denied for a non member`() {
        `when`(userService.getOrCreateUser(guestPrincipal()))
            .thenReturn(UserEntity(id = UUID.randomUUID(), keycloakSubject = "sub-guest", displayName = "Gast"))

        val ex = assertThrows(AccessDeniedException::class.java) {
            ledgerService.purchaseByBarcode(
                PurchaseRequest(eventId = eventId.toString(), barcode = barcode),
                "purchase-guest",
                guestPrincipal()
            )
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `barcode purchase on an inactive event is rejected`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())
        `when`(eventRepository.findById(eventId))
            .thenReturn(Optional.of(EventEntity(id = eventId, title = "Fest", status = EventStatus.draft)))

        val ex = assertThrows(ApiException::class.java) {
            ledgerService.purchaseByBarcode(
                PurchaseRequest(eventId = eventId.toString(), barcode = barcode),
                "purchase-inactive",
                memberPrincipal()
            )
        }
        assertEquals(ErrorCode.EVENT_NOT_ACTIVE, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `barcode purchase is rejected when self service is disabled`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())
        stubPurchaseResolution(selfService = false)

        val ex = assertThrows(ApiException::class.java) {
            ledgerService.purchaseByBarcode(
                PurchaseRequest(eventId = eventId.toString(), barcode = barcode),
                "purchase-selfservice",
                memberPrincipal()
            )
        }
        assertEquals(ErrorCode.SELF_SERVICE_DISABLED, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `barcode purchase with an unknown barcode is not found`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(drinkBarcodeRepository.findByBarcode(barcode)).thenReturn(Optional.empty())

        val ex = assertThrows(ApiException::class.java) {
            ledgerService.purchaseByBarcode(
                PurchaseRequest(eventId = eventId.toString(), barcode = barcode),
                "purchase-unknown",
                memberPrincipal()
            )
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `barcode purchase replays the existing entry for a repeated key`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())
        stubPurchaseResolution()
        val existing = LedgerEntryEntity(
            entryType = LedgerEntryType.purchase,
            event = activeEvent(),
            member = member(),
            drink = approvedDrink(),
            amount = BigDecimal("2.50"),
            currency = "EUR",
            accountingMode = AccountingMode.credit,
            source = PurchaseSource.pwaBarcode,
            actor = member(),
            idempotencyKey = "purchase-1"
        )
        `when`(ledgerEntryRepository.findByIdempotencyKey("purchase-1")).thenReturn(Optional.of(existing))

        val dto = ledgerService.purchaseByBarcode(
            PurchaseRequest(eventId = eventId.toString(), barcode = barcode),
            "purchase-1",
            memberPrincipal()
        )

        assertEquals(existing.id.toString(), dto.id)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
        verify(purchaseSnapshotRepository, never()).save(anyPurchaseSnapshot())
    }

    @Test
    fun `round purchase is booked revenue only with source and receipt snapshot`() {
        `when`(ledgerEntryRepository.save(anyLedgerEntry())).thenAnswer { it.arguments[0] }
        `when`(purchaseSnapshotRepository.save(anyPurchaseSnapshot())).thenAnswer { it.arguments[0] }

        val dto = ledgerService.recordEventRevenuePurchase(
            event = activeEvent(),
            member = member(),
            drink = approvedDrink(),
            eventDrink = eventDrink(),
            actor = admin(),
            source = PurchaseSource.round,
            idempotencyKey = "round-1"
        )

        assertEquals(LedgerEntryType.purchase.name, dto.entryType)
        assertEquals(PurchaseSource.round.name, dto.source)
        assertEquals(AccountingMode.revenueOnly.name, dto.accountingMode)
        assertEquals(memberId.toString(), dto.memberId)
        assertEquals(adminId.toString(), dto.actorId)
        assertEquals(0, BigDecimal("2.50").compareTo(dto.amount))
        assertNull(dto.snapshot?.barcode)
        assertEquals("Cola", dto.snapshot?.drinkName)
        verify(ledgerEntryRepository).save(anyLedgerEntry())
        verify(purchaseSnapshotRepository).save(anyPurchaseSnapshot())
    }

    @Test
    fun `evening purchase is booked revenue only with the evening source`() {
        `when`(ledgerEntryRepository.save(anyLedgerEntry())).thenAnswer { it.arguments[0] }
        `when`(purchaseSnapshotRepository.save(anyPurchaseSnapshot())).thenAnswer { it.arguments[0] }

        val dto = ledgerService.recordEventRevenuePurchase(
            event = activeEvent(),
            member = member(),
            drink = approvedDrink(),
            eventDrink = eventDrink(),
            actor = admin(),
            source = PurchaseSource.evening,
            idempotencyKey = "evening-1"
        )

        assertEquals(PurchaseSource.evening.name, dto.source)
        assertEquals(AccountingMode.revenueOnly.name, dto.accountingMode)
    }

    @Test
    fun `revenue only purchase rejects a non round or evening source`() {
        val ex = assertThrows(InvalidRequestException::class.java) {
            ledgerService.recordEventRevenuePurchase(
                event = activeEvent(),
                member = member(),
                drink = approvedDrink(),
                eventDrink = eventDrink(),
                actor = admin(),
                source = PurchaseSource.tabletManual,
                idempotencyKey = "bad-source"
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        verify(ledgerEntryRepository, never()).save(anyLedgerEntry())
    }

    @Test
    fun `revenue only purchases do not change the credit balance`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))

        val entries = listOf(
            LedgerEntryEntity(
                entryType = LedgerEntryType.topup,
                member = member(),
                amount = BigDecimal("10.00"),
                currency = "EUR",
                actor = member(),
                idempotencyKey = "t1"
            ),
            LedgerEntryEntity(
                entryType = LedgerEntryType.purchase,
                member = member(),
                amount = BigDecimal("2.50"),
                currency = "EUR",
                accountingMode = AccountingMode.revenueOnly,
                source = PurchaseSource.round,
                actor = admin(),
                idempotencyKey = "r1"
            )
        )
        `when`(ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(memberId)).thenReturn(entries)

        val balance = ledgerService.getMemberBalance(memberId, memberPrincipal())

        assertEquals(0, BigDecimal("10.00").compareTo(balance.creditBalance))
        assertEquals(0, BigDecimal("0.00").compareTo(balance.purchaseTotal))
        assertEquals(2, balance.entryCount)
    }

    @Test
    fun `member can read own balance which nets topups payouts purchases and corrections`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))

        val purchase = LedgerEntryEntity(
            entryType = LedgerEntryType.purchase,
            member = member(),
            amount = BigDecimal("2.50"),
            currency = "EUR",
            accountingMode = AccountingMode.credit,
            actor = member(),
            idempotencyKey = "p1"
        )
        val entries = listOf(
            LedgerEntryEntity(
                entryType = LedgerEntryType.topup,
                member = member(),
                amount = BigDecimal("10.00"),
                currency = "EUR",
                actor = member(),
                idempotencyKey = "t1"
            ),
            LedgerEntryEntity(
                entryType = LedgerEntryType.payout,
                member = member(),
                amount = BigDecimal("3.00"),
                currency = "EUR",
                actor = member(),
                idempotencyKey = "po1"
            ),
            purchase,
            LedgerEntryEntity(
                entryType = LedgerEntryType.correction,
                member = member(),
                amount = BigDecimal("2.50"),
                currency = "EUR",
                accountingMode = AccountingMode.credit,
                actor = member(),
                reversesEntry = purchase,
                idempotencyKey = "c1"
            )
        )
        `when`(ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(memberId)).thenReturn(entries)

        val balance = ledgerService.getMemberBalance(memberId, memberPrincipal())

        assertEquals(0, BigDecimal("7.00").compareTo(balance.creditBalance))
        assertEquals(0, BigDecimal("10.00").compareTo(balance.topupTotal))
        assertEquals(0, BigDecimal("3.00").compareTo(balance.payoutTotal))
        assertEquals(0, BigDecimal("2.50").compareTo(balance.purchaseTotal))
        assertEquals(0, BigDecimal("2.50").compareTo(balance.correctionTotal))
        assertEquals(4, balance.entryCount)
    }

    @Test
    fun `member cannot read another members balance`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())

        val ex = assertThrows(AccessDeniedException::class.java) {
            ledgerService.getMemberBalance(UUID.randomUUID(), memberPrincipal())
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `admin can read another members balance`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        `when`(ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(memberId)).thenReturn(emptyList())

        val balance = ledgerService.getMemberBalance(memberId, adminPrincipal())

        assertEquals(memberId.toString(), balance.memberId)
        assertEquals(0, BigDecimal("0.00").compareTo(balance.creditBalance))
        assertEquals(0, balance.entryCount)
    }

    @Test
    fun `event summary is denied for a plain member`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())

        val ex = assertThrows(AccessDeniedException::class.java) {
            ledgerService.getEventSummary(UUID.randomUUID(), memberPrincipal())
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `event summary aggregates revenue and credit consumption`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        val eventId = UUID.randomUUID()
        val event = EventEntity(id = eventId, title = "Fest")
        val entries = listOf(
            LedgerEntryEntity(
                entryType = LedgerEntryType.purchase,
                event = event,
                member = member(),
                amount = BigDecimal("2.50"),
                currency = "EUR",
                accountingMode = AccountingMode.credit,
                actor = member(),
                idempotencyKey = "p1"
            ),
            LedgerEntryEntity(
                entryType = LedgerEntryType.purchase,
                event = event,
                member = member(),
                amount = BigDecimal("1.50"),
                currency = "EUR",
                accountingMode = AccountingMode.revenueOnly,
                actor = member(),
                idempotencyKey = "p2"
            )
        )
        `when`(ledgerEntryRepository.findByEventId(eventId)).thenReturn(entries)

        val summary = ledgerService.getEventSummary(eventId, adminPrincipal())

        assertEquals(eventId.toString(), summary.eventId)
        assertEquals(0, BigDecimal("4.00").compareTo(summary.revenueTotal))
        assertEquals(0, BigDecimal("2.50").compareTo(summary.creditConsumptionTotal))
        assertEquals(2, summary.entryCount)
    }
}
