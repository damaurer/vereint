package de.maurer.baseservice.service

import de.maurer.baseservice.domain.*
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.IdempotencyConflictException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkBarcodeRepository
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.IdempotencyRecordRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.PurchaseSnapshotRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.Identifiers
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischMembers
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Fachlicher Slice für Ledger, Guthaben und Kassenbuchungen (TICKET-015).
 *
 * Das Ledger ist append-only: Topup, Payout und Korrektur erzeugen ausschließlich
 * neue Buchungen; Korrekturen sind Gegenbuchungen auf die Ursprungszeile. Jeder
 * finanzielle Schreibvorgang trägt einen Idempotency-Key; Wiederholungen liefern
 * dasselbe Ergebnis oder einen kontrollierten Konflikt (siehe `docs/domains/ledger-and-finance.md`).
 *
 * Alle Aufrufe folgen `deny by default`: Mitglieder sehen ausschließlich das eigene
 * Guthaben, Vorstand und Administration lesen und buchen (LEDGER_READ/LEDGER_CORRECT).
 */
@Service
@Transactional
class LedgerService(
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val idempotencyRecordRepository: IdempotencyRecordRepository,
    private val purchaseSnapshotRepository: PurchaseSnapshotRepository,
    private val access: StammtischAccess,
    private val members: StammtischMembers,
    private val eventRepository: EventRepository,
    private val drinkBarcodeRepository: DrinkBarcodeRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val userService: UserService,
    private val auditService: AuditService,
    private val snapshots: LedgerSnapshots
) {

    /**
     * Guthabenübersicht aller aktiven Mitglieder für die Kasse (Vorstand/Admin),
     * sortiert nach Namen.
     */
    @Transactional(readOnly = true)
    fun listBalances(principal: UserPrincipal): List<MemberBalanceOverviewDto> {
        val caller = userService.getOrCreateUser(principal)
        requireLedgerRead(caller, principal)
        return members.activeUsers()
            .map { member ->
                val entries = ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(member.id)
                val balance = computeBalance(member, entries)
                MemberBalanceOverviewDto(
                    memberId = balance.memberId,
                    displayName = member.displayName,
                    currency = balance.currency,
                    creditBalance = balance.creditBalance,
                    lastEntryAt = entries.lastOrNull()?.createdAt
                )
            }
    }

    @Transactional(readOnly = true)
    fun getMemberBalance(memberId: UUID, principal: UserPrincipal): MemberBalanceDto {
        val caller = userService.getOrCreateUser(principal)
        requireCanReadMember(caller, principal, memberId)
        val member = requireUser(memberId)
        val entries = ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(memberId)
        return computeBalance(member, entries)
    }

    @Transactional(readOnly = true)
    fun listMemberEntries(memberId: UUID, principal: UserPrincipal): List<LedgerEntryDto> {
        val caller = userService.getOrCreateUser(principal)
        requireCanReadMember(caller, principal, memberId)
        requireUser(memberId)
        return snapshots.attach(ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(memberId)).map { toDto(it) }
    }

    @Transactional(readOnly = true)
    fun getEventSummary(eventId: UUID, principal: UserPrincipal): EventLedgerSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        if (!access.hasAny(principal, caller, Permission.LEDGER_READ, Permission.EVENT_MANAGE)) {
            throw AccessDeniedException(
                Msg("error.ledger.eventSummaryDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
        val entries = snapshots.attach(ledgerEntryRepository.findByEventId(eventId))
        val purchases = entries.filter { it.entryType == LedgerEntryType.purchase }
        val purchaseCorrections = entries.filter {
            it.entryType == LedgerEntryType.correction && it.reversesEntry?.entryType == LedgerEntryType.purchase
        }
        val revenueTotal = purchases.sumOf { it.amount } -
            purchaseCorrections.sumOf { it.reversesEntry?.amount ?: BigDecimal.ZERO }
        val costTotal = purchases.sumOf { it.purchaseSnapshot?.costPrice ?: BigDecimal.ZERO } -
            purchaseCorrections.sumOf { it.reversesEntry?.purchaseSnapshot?.costPrice ?: BigDecimal.ZERO }
        val profitTotal = purchases.sumOf { it.purchaseSnapshot?.profit ?: BigDecimal.ZERO } -
            purchaseCorrections.sumOf { it.reversesEntry?.purchaseSnapshot?.profit ?: BigDecimal.ZERO }
        val creditConsumptionTotal =
            purchases.filter { it.accountingMode == AccountingMode.credit }.sumOf { it.amount } -
                purchaseCorrections
                    .filter { it.reversesEntry?.accountingMode == AccountingMode.credit }
                    .sumOf { it.reversesEntry?.amount ?: BigDecimal.ZERO }
        val currency = entries.firstOrNull()?.currency ?: DEFAULT_CURRENCY
        return EventLedgerSummaryDto(
            eventId = eventId.toString(),
            currency = currency,
            revenueTotal = revenueTotal.setScale(2),
            costTotal = costTotal.setScale(2),
            profitTotal = profitTotal.setScale(2),
            creditConsumptionTotal = creditConsumptionTotal.setScale(2),
            entryCount = entries.size
        )
    }

    fun topup(request: TopupRequest, idempotencyKey: String?, principal: UserPrincipal): LedgerEntryDto {
        val caller = userService.getOrCreateUser(principal)
        requireLedgerWrite(caller, principal)
        val key = requireIdempotencyKey(idempotencyKey)
        val amount = requirePositiveAmount(request.amount)
        val member = members.requireActiveUser(parseId(request.memberId, "memberId"))
        val currency = normalizeCurrency(request.currency)
        return appendWrite(
            AppendWriteCommand(
                scope = SCOPE_TOPUP,
                key = key,
                entryType = LedgerEntryType.topup,
                member = member,
                event = null,
                drink = null,
                amount = amount,
                currency = currency,
                accountingMode = AccountingMode.credit,
                source = null,
                actor = caller,
                reversesEntry = null,
                auditAction = AuditService.ACTION_LEDGER_TOPUP,
                note = request.note
            )
        )
    }

    fun payout(request: PayoutRequest, idempotencyKey: String?, principal: UserPrincipal): LedgerEntryDto {
        val caller = userService.getOrCreateUser(principal)
        requireLedgerWrite(caller, principal)
        val key = requireIdempotencyKey(idempotencyKey)
        val amount = requirePositiveAmount(request.amount)
        val member = members.requireActiveUser(parseId(request.memberId, "memberId"))
        val currency = normalizeCurrency(request.currency)
        return appendWrite(
            AppendWriteCommand(
                scope = SCOPE_PAYOUT,
                key = key,
                entryType = LedgerEntryType.payout,
                member = member,
                event = null,
                drink = null,
                amount = amount,
                currency = currency,
                accountingMode = AccountingMode.credit,
                source = null,
                actor = caller,
                reversesEntry = null,
                auditAction = AuditService.ACTION_LEDGER_PAYOUT,
                note = request.note
            )
        )
    }

    fun correct(request: CorrectionRequest, idempotencyKey: String?, principal: UserPrincipal): LedgerEntryDto {
        val caller = userService.getOrCreateUser(principal)
        requireLedgerWrite(caller, principal)
        val key = requireIdempotencyKey(idempotencyKey)
        val originalId = parseId(request.originalEntryId, "originalEntryId")
        val original = ledgerEntryRepository.findById(originalId).orElseThrow {
            ResourceNotFoundException(Msg("error.ledger.entryNotFound", originalId), ErrorCode.NOT_FOUND)
        }
        if (original.entryType == LedgerEntryType.correction) {
            throw InvalidRequestException(
                Msg("error.ledger.correctionOfCorrection"),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (ledgerEntryRepository.findByReversesEntryId(originalId).isNotEmpty()) {
            throw ApiException(
                ErrorCode.LEDGER_ALREADY_CORRECTED,
                Msg("error.ledger.alreadyCorrected", originalId),
                HttpStatus.CONFLICT
            )
        }
        val member = original.member
            ?: throw ResourceNotFoundException(Msg("error.ledger.originalWithoutMember"), ErrorCode.NOT_FOUND)
        return appendWrite(
            AppendWriteCommand(
                scope = SCOPE_CORRECTION,
                key = key,
                entryType = LedgerEntryType.correction,
                member = member,
                event = original.event,
                drink = original.drink,
                food = original.food,
                amount = original.amount,
                currency = original.currency,
                accountingMode = original.accountingMode,
                source = null,
                actor = caller,
                reversesEntry = original,
                tallyCategory = original.tallyCategory,
                round = original.round,
                beneficiary = original.beneficiary,
                auditAction = AuditService.ACTION_LEDGER_CORRECTION,
                note = request.reason
            )
        )
    }

    /**
     * Bereits gespeicherte Buchung zu einem Idempotency-Key, damit ein wiederholter
     * Strich nicht erneut auf eine Runde geprüft wird (Issue #81).
     */
    @Transactional(readOnly = true)
    fun findByIdempotencyKey(idempotencyKey: String?): LedgerEntryEntity? {
        val key = idempotencyKey?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return ledgerEntryRepository.findByIdempotencyKey(key).orElse(null)
    }

    /** DTO einer gespeicherten Buchung samt Beleg. */
    @Transactional(readOnly = true)
    fun describe(entry: LedgerEntryEntity): LedgerEntryDto = toDto(snapshots.attach(entry))

    /**
     * Macht einen eben erfassten Strichlisten-Kauf am Tablet rückgängig.
     *
     * Das Thekentablet darf keine allgemeinen Korrekturen buchen. Damit ein
     * versehentlicher Strich trotzdem sofort zurückgenommen werden kann, erlaubt
     * diese Methode genau eine Gegenbuchung, wenn die Ursprungsbuchung
     * - ein manueller Tablet-Kauf an genau diesem Event ist,
     * - vom selben Tablet-Benutzer erfasst wurde und
     * - höchstens [TABLET_UNDO_WINDOW] alt ist.
     * Alles andere bleibt eine Korrektur durch Vorstand/Admin. Wiederholungen mit
     * demselben Idempotency-Key liefern die bereits erzeugte Gegenbuchung.
     */
    fun undoTabletPurchase(
        eventId: UUID,
        entryId: UUID,
        actor: UserEntity,
        idempotencyKey: String?,
        now: Instant = Instant.now()
    ): LedgerEntryDto {
        val key = requireIdempotencyKey(idempotencyKey)
        val original = ledgerEntryRepository.findById(entryId).orElseThrow {
            ResourceNotFoundException(Msg("error.ledger.entryNotFound", entryId), ErrorCode.NOT_FOUND)
        }
        val replay = ledgerEntryRepository.findByIdempotencyKey(key).orElse(null)
        if (replay != null && replay.reversesEntry?.id == original.id) {
            return toDto(snapshots.attach(replay))
        }
        val tabletSource = original.source == PurchaseSource.tabletManual ||
            (original.round != null && (original.source == PurchaseSource.round || original.source == PurchaseSource.evening))
        if (original.entryType != LedgerEntryType.purchase ||
            !tabletSource ||
            original.event?.id != eventId
        ) {
            throw InvalidRequestException(
                Msg("error.ledger.undoOnlyTally"),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (original.actor?.id != actor.id) {
            throw AccessDeniedException(
                Msg("error.ledger.undoOnlyRecorder"),
                ErrorCode.ACCESS_DENIED
            )
        }
        if (original.createdAt.isBefore(now.minus(TABLET_UNDO_WINDOW))) {
            throw InvalidRequestException(
                Msg("error.ledger.undoWindowExpired", TABLET_UNDO_WINDOW.toMinutes()),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (ledgerEntryRepository.findByReversesEntryId(original.id).isNotEmpty()) {
            throw ApiException(
                ErrorCode.LEDGER_ALREADY_CORRECTED,
                Msg("error.ledger.alreadyUndone", original.id),
                HttpStatus.CONFLICT
            )
        }
        val member = original.member
            ?: throw ResourceNotFoundException(Msg("error.ledger.originalWithoutMember"), ErrorCode.NOT_FOUND)
        return appendWrite(
            AppendWriteCommand(
                scope = SCOPE_CORRECTION,
                key = key,
                entryType = LedgerEntryType.correction,
                member = member,
                event = original.event,
                drink = original.drink,
                food = original.food,
                amount = original.amount,
                currency = original.currency,
                accountingMode = original.accountingMode,
                source = null,
                actor = actor,
                reversesEntry = original,
                tallyCategory = original.tallyCategory,
                round = original.round,
                beneficiary = original.beneficiary,
                auditAction = AuditService.ACTION_LEDGER_CORRECTION,
                note = "tablet-undo; event=$eventId"
            )
        )
    }

    /**
     * PWA-Barcodekauf eines Mitglieds (TICKET-016). Der Client liefert nur Event und
     * gescannten Barcode; Käufer, Preis, Währung, Getränk und Abrechnungsmodus werden
     * serverseitig bestimmt: Käufer ist stets der angemeldete Benutzer, Preis/Währung
     * ermittelt [EventDrinkPricing] (Kategoriepreis > Event-Preis > Getränkepreis), der
     * Modus ist `credit` (persönliches Verzehrbudget).
     *
     * Der Kauf ist nur an einem aktiven Event, zu dem der Käufer gehört (eingeladen,
     * Veranstalter oder Vorstand/Admin), und für ein dort selbstbedienbares,
     * freigegebenes Getränk möglich. Es entsteht ein unveränderlicher Beleg-Snapshot.
     * Wiederholungen mit demselben Idempotency-Key erzeugen keine Doppelbuchung.
     */
    fun purchaseByBarcode(
        request: PurchaseRequest,
        idempotencyKey: String?,
        principal: UserPrincipal
    ): LedgerEntryDto {
        val caller = userService.getOrCreateUser(principal)
        requireMember(caller, principal)
        val key = requireIdempotencyKey(idempotencyKey)

        val event = requireEvent(parseId(request.eventId, "eventId"))
        if (event.status != EventStatus.active) {
            throw EventNotActiveException(
                Msg("error.ledger.barcodeEventNotActive"),
                ErrorCode.EVENT_NOT_ACTIVE
            )
        }
        if (!canBuyAt(caller, principal, event)) {
            throw AccessDeniedException(
                Msg("error.ledger.barcodeNotParticipant"),
                ErrorCode.ACCESS_DENIED
            )
        }

        val barcode = normalizeBarcode(request.barcode)
        val drink = resolveDrinkByBarcode(barcode)
        val eventDrink = eventDrinkRepository.findByEventIdAndDrinkId(event.id, drink.id).orElseThrow {
            ApiException(
                ErrorCode.DRINK_NOT_IN_EVENT,
                Msg("error.ledger.drinkNotInEvent", barcode),
                HttpStatus.NOT_FOUND
            )
        }
        if (!eventDrink.selfServiceEnabled) {
            throw ApiException(
                ErrorCode.SELF_SERVICE_DISABLED,
                Msg("error.ledger.selfServiceDisabled"),
                HttpStatus.FORBIDDEN
            )
        }

        val pricing = EventDrinkPricing.resolve(eventDrink)
        val currency = pricing.currency
        val unitPrice = pricing.unitPrice
        val costPrice = (eventDrink.costPrice ?: drink.costPrice).setScale(2)
        val profit = (unitPrice - costPrice).setScale(2)

        return appendWrite(
            AppendWriteCommand(
                scope = SCOPE_PURCHASE,
                key = key,
                entryType = LedgerEntryType.purchase,
                tallyCategory = pricing.tallyCategory,
                member = caller,
                event = event,
                drink = drink,
                food = null,
                amount = unitPrice,
                currency = currency,
                accountingMode = AccountingMode.credit,
                source = PurchaseSource.pwaBarcode,
                actor = caller,
                reversesEntry = null,
                auditAction = AuditService.ACTION_LEDGER_PURCHASE,
                note = "event=${event.id}; barcode=$barcode",
                snapshotFactory = {
                    PurchaseSnapshotEntity(
                        ledgerEntry = it,
                        itemType = "DRINK",
                        drinkName = drink.name,
                        foodName = null,
                        imageReference = eventDrink.imageSnapshot ?: drink.imageReference,
                        barcode = barcode,
                        unitPrice = unitPrice,
                        costPrice = costPrice,
                        profit = profit,
                        currency = currency,
                        catalogVersion = eventDrink.catalogVersion
                    )
                }
            )
        )
    }

    /**
     * Zeigt dem Mitglied vor dem Bezahlen, welches Getränk zum Barcode gehört, was
     * es an welchem laufenden Event kostet und wie viel Guthaben vorhanden ist. Es
     * gelten dieselben Regeln wie bei [purchaseByBarcode]; gebucht wird nichts.
     */
    @Transactional(readOnly = true)
    fun previewBarcodePurchase(request: PurchasePreviewRequest, principal: UserPrincipal): PurchasePreviewDto {
        val caller = userService.getOrCreateUser(principal)
        requireMember(caller, principal)
        val barcode = normalizeBarcode(request.barcode)
        val drink = resolveDrinkByBarcode(barcode)
        val requestedEventId = request.eventId?.trim()?.ifBlank { null }?.let { parseId(it, "eventId") }

        val options = eventDrinkRepository.findByDrinkId(drink.id)
            .filter { it.selfServiceEnabled }
            .mapNotNull { eventDrink -> eventDrink.event?.let { it to eventDrink } }
            .filter { (event, _) ->
                event.status == EventStatus.active &&
                    (requestedEventId == null || event.id == requestedEventId) &&
                    canBuyAt(caller, principal, event)
            }
            .sortedByDescending { (event, _) -> event.startsAt }
            .map { (event, eventDrink) ->
                val pricing = EventDrinkPricing.resolve(eventDrink)
                PurchaseOptionDto(
                    eventId = event.id.toString(),
                    eventTitle = event.title,
                    unitPrice = pricing.unitPrice,
                    currency = pricing.currency
                )
            }
        if (options.isEmpty()) {
            throw ApiException(
                ErrorCode.DRINK_NOT_IN_EVENT,
                Msg("error.ledger.noOpenEventForDrink", drink.name),
                HttpStatus.NOT_FOUND
            )
        }

        val balance = computeBalance(caller, ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(caller.id))
        return PurchasePreviewDto(
            barcode = barcode,
            drinkId = drink.id.toString(),
            drinkName = drink.name,
            imageReference = drink.imageReference,
            options = options,
            creditBalance = balance.creditBalance,
            balanceCurrency = balance.currency
        )
    }

    /**
     * Nimmt einen eigenen Barcodekauf zurück, so wie das Tablet einen eben
     * gesetzten Strich zurücknehmen darf: genau eine Gegenbuchung, nur für eigene
     * Barcodekäufe und nur innerhalb von [PURCHASE_UNDO_WINDOW]. Ältere Käufe
     * korrigiert der Vorstand. Wiederholungen mit demselben Idempotency-Key liefern
     * die bereits erzeugte Gegenbuchung.
     */
    fun undoBarcodePurchase(
        entryId: UUID,
        idempotencyKey: String?,
        principal: UserPrincipal,
        now: Instant = Instant.now()
    ): LedgerEntryDto {
        val caller = userService.getOrCreateUser(principal)
        requireMember(caller, principal)
        val key = requireIdempotencyKey(idempotencyKey)
        val original = ledgerEntryRepository.findById(entryId)
            .filter { it.member?.id == caller.id }
            .orElseThrow {
                ResourceNotFoundException(Msg("error.ledger.entryNotFound", entryId), ErrorCode.NOT_FOUND)
            }
        val replay = ledgerEntryRepository.findByIdempotencyKey(key).orElse(null)
        if (replay != null && replay.reversesEntry?.id == original.id) {
            return toDto(snapshots.attach(replay))
        }
        if (original.entryType != LedgerEntryType.purchase || original.source != PurchaseSource.pwaBarcode) {
            throw InvalidRequestException(
                Msg("error.ledger.undoOnlyBarcode"),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (original.createdAt.isBefore(now.minus(PURCHASE_UNDO_WINDOW))) {
            throw InvalidRequestException(
                Msg("error.ledger.purchaseUndoWindowExpired", PURCHASE_UNDO_WINDOW.toMinutes()),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (ledgerEntryRepository.findByReversesEntryId(original.id).isNotEmpty()) {
            throw ApiException(
                ErrorCode.LEDGER_ALREADY_CORRECTED,
                Msg("error.ledger.alreadyUndone", original.id),
                HttpStatus.CONFLICT
            )
        }
        return appendWrite(
            AppendWriteCommand(
                scope = SCOPE_CORRECTION,
                key = key,
                entryType = LedgerEntryType.correction,
                member = caller,
                event = original.event,
                drink = original.drink,
                food = original.food,
                amount = original.amount,
                currency = original.currency,
                accountingMode = original.accountingMode,
                source = null,
                actor = caller,
                reversesEntry = original,
                tallyCategory = original.tallyCategory,
                round = original.round,
                beneficiary = original.beneficiary,
                auditAction = AuditService.ACTION_LEDGER_CORRECTION,
                note = "member-undo; event=${original.event?.id ?: "-"}"
            )
        )
    }

    /**
     * Manueller Tablet-Kauf über die Strichliste (TICKET-017). Käufer, Getränk,
     * Preis, Währung und Abrechnungsmodus werden serverseitig vorgegeben: Der Käufer
     * ist ein bereits aufgelöstes Eventmitglied, Preis/Währung ermittelt
     * [EventDrinkPricing] (Kategoriepreis > Event-Preis > Getränkepreis), der Modus ist `credit` und die Herkunft `tabletManual`.
     *
     * Die fachliche Berechtigung (`purchase.tablet`), der aktive Eventstatus, die
     * Teilnahme des Käufers und die Tablet-Freigabe des Getränks werden im
     * [de.maurer.baseservice.service.TabletRecorderService] geprüft; hier entsteht
     * ausschließlich die unveränderliche Buchung samt Beleg-Snapshot. Wiederholungen
     * mit demselben Idempotency-Key erzeugen keine Doppelbuchung.
     */
    fun recordTabletPurchase(
        event: EventEntity,
        member: UserEntity,
        drink: DrinkCatalogEntity,
        eventDrink: EventDrinkEntity,
        actor: UserEntity,
        idempotencyKey: String?,
        round: RoundEntity? = null
    ): LedgerEntryDto {
        val key = requireIdempotencyKey(idempotencyKey)
        // Geht der Strich auf eine Runde, zahlt der Geber; getrunken hat [member].
        val payer = round?.sponsor ?: member
        val source = when (round?.kind) {
            null -> PurchaseSource.tabletManual
            RoundKind.round -> PurchaseSource.round
            RoundKind.evening -> PurchaseSource.evening
        }
        val pricing = EventDrinkPricing.resolve(eventDrink)
        val currency = pricing.currency
        val unitPrice = pricing.unitPrice
        val costPrice = (eventDrink.costPrice ?: drink.costPrice).setScale(2)
        val profit = (unitPrice - costPrice).setScale(2)

        return appendWrite(
            AppendWriteCommand(
                scope = SCOPE_PURCHASE,
                key = key,
                entryType = LedgerEntryType.purchase,
                tallyCategory = pricing.tallyCategory,
                round = round,
                beneficiary = if (round != null) member else null,
                member = payer,
                event = event,
                drink = drink,
                food = null,
                amount = unitPrice,
                currency = currency,
                accountingMode = AccountingMode.credit,
                source = source,
                actor = actor,
                reversesEntry = null,
                auditAction = AuditService.ACTION_LEDGER_PURCHASE,
                note = "event=${event.id}; tablet; member=${member.id}; round=${round?.id ?: "-"}",
                snapshotFactory = {
                    PurchaseSnapshotEntity(
                        ledgerEntry = it,
                        itemType = "DRINK",
                        drinkName = drink.name,
                        foodName = null,
                        imageReference = eventDrink.imageSnapshot ?: drink.imageReference,
                        barcode = null,
                        unitPrice = unitPrice,
                        costPrice = costPrice,
                        profit = profit,
                        currency = currency,
                        catalogVersion = eventDrink.catalogVersion
                    )
                }
            )
        )
    }

    /**
     * Manueller Tablet-Kauf für Speisen über die Strichliste mit hierarchischer Preisauflösung.
     */
    fun recordTabletFoodPurchase(
        event: EventEntity,
        member: UserEntity,
        food: FoodCatalogEntity,
        eventFood: EventFoodEntity,
        actor: UserEntity,
        idempotencyKey: String?
    ): LedgerEntryDto {
        val key = requireIdempotencyKey(idempotencyKey)
        val currency = eventFood.currency
        val unitPrice = (eventFood.price ?: food.defaultPrice).setScale(2)
        val costPrice = (eventFood.costPrice ?: food.costPrice).setScale(2)
        val profit = (unitPrice - costPrice).setScale(2)

        return appendWrite(
            AppendWriteCommand(
                scope = SCOPE_PURCHASE,
                key = key,
                entryType = LedgerEntryType.purchase,
                member = member,
                event = event,
                drink = null,
                food = food,
                amount = unitPrice,
                currency = currency,
                accountingMode = AccountingMode.credit,
                source = PurchaseSource.tabletManual,
                actor = actor,
                reversesEntry = null,
                auditAction = AuditService.ACTION_LEDGER_PURCHASE,
                note = "event=${event.id}; tablet_food; member=${member.id}",
                snapshotFactory = {
                    PurchaseSnapshotEntity(
                        ledgerEntry = it,
                        itemType = "FOOD",
                        drinkName = null,
                        foodName = food.name,
                        imageReference = null,
                        barcode = null,
                        unitPrice = unitPrice,
                        costPrice = costPrice,
                        profit = profit,
                        currency = currency,
                        catalogVersion = null
                    )
                }
            )
        )
    }

    private data class AppendWriteCommand(
        val scope: String,
        val key: String,
        val entryType: LedgerEntryType,
        val member: UserEntity,
        val event: EventEntity? = null,
        val drink: DrinkCatalogEntity? = null,
        val food: FoodCatalogEntity? = null,
        val amount: BigDecimal,
        val currency: String,
        val accountingMode: AccountingMode,
        val source: PurchaseSource? = null,
        val actor: UserEntity,
        val reversesEntry: LedgerEntryEntity? = null,
        val tallyCategory: TallyCategoryEntity? = null,
        val round: RoundEntity? = null,
        val beneficiary: UserEntity? = null,
        val auditAction: String,
        val note: String? = null,
        val snapshotFactory: ((LedgerEntryEntity) -> PurchaseSnapshotEntity)? = null
    )

    /**
     * Fügt eine Buchung idempotent an. Wiederholungen mit demselben Schlüssel und
     * identischen Kerndaten liefern die bestehende Buchung; abweichende Daten führen
     * zu einem `409 idempotency_conflict`.
     *
     * [cmd.snapshotFactory] erzeugt bei Käufen den unveränderlichen Beleg-Snapshot,
     * nachdem die Buchung gespeichert wurde.
     */
    private fun appendWrite(cmd: AppendWriteCommand): LedgerEntryDto {
        val existing = ledgerEntryRepository.findByIdempotencyKey(cmd.key).orElse(null)
        if (existing != null) {
            if (matchesReplay(existing, cmd.entryType, cmd.member, cmd.amount, cmd.currency)) {
                return toDto(snapshots.attach(existing))
            }
            throw IdempotencyConflictException(
                Msg("error.idempotency.conflict", cmd.key),
                ErrorCode.IDEMPOTENCY_CONFLICT
            )
        }

        val entry = LedgerEntryEntity(
            entryType = cmd.entryType,
            event = cmd.event,
            member = cmd.member,
            drink = cmd.drink,
            food = cmd.food,
            amount = cmd.amount.setScale(2),
            currency = cmd.currency,
            accountingMode = cmd.accountingMode,
            source = cmd.source,
            actor = cmd.actor,
            reversesEntry = cmd.reversesEntry,
            idempotencyKey = cmd.key,
            tallyCategory = cmd.tallyCategory,
            round = cmd.round,
            beneficiary = cmd.beneficiary
        )
        val saved = ledgerEntryRepository.save(entry)
        cmd.snapshotFactory?.let {
            val snapshot = purchaseSnapshotRepository.save(it(saved))
            saved.purchaseSnapshot = snapshot
        }
        recordIdempotency(cmd.scope, cmd.key)
        auditService.recordLedgerEntry(
            cmd.actor,
            cmd.auditAction,
            saved.id,
            "type=${cmd.entryType}; member=${cmd.member.id}; amount=${cmd.amount.setScale(2)} ${cmd.currency}; " +
                "reverses=${cmd.reversesEntry?.id ?: "-"}; note=${cmd.note?.trim()?.ifBlank { null } ?: "-"}"
        )
        return toDto(saved)
    }

    private fun matchesReplay(
        existing: LedgerEntryEntity,
        entryType: LedgerEntryType,
        member: UserEntity,
        amount: BigDecimal,
        currency: String
    ): Boolean =
        existing.entryType == entryType &&
            existing.member?.id == member.id &&
            existing.amount.compareTo(amount) == 0 &&
            existing.currency == currency

    private fun recordIdempotency(scope: String, key: String) {
        if (idempotencyRecordRepository.findByScopeAndIdempotencyKey(scope, key).isPresent) {
            return
        }
        idempotencyRecordRepository.save(
            IdempotencyRecordEntity(
                idempotencyKey = key,
                scope = scope,
                expiresAt = Instant.now().plus(IDEMPOTENCY_TTL)
            )
        )
    }

    private fun computeBalance(member: UserEntity, entries: List<LedgerEntryEntity>): MemberBalanceDto {
        val topupTotal = entries.filter { it.entryType == LedgerEntryType.topup }.sumOf { it.amount }
        val payoutTotal = entries.filter { it.entryType == LedgerEntryType.payout }.sumOf { it.amount }
        val purchaseTotal = entries
            .filter { it.entryType == LedgerEntryType.purchase && it.accountingMode == AccountingMode.credit }
            .sumOf { it.amount }
        val correctionTotal = entries
            .filter { it.entryType == LedgerEntryType.correction }
            .sumOf { balanceDelta(it) }
        val creditBalance = entries.sumOf { balanceDelta(it) }
        val currency = entries.firstOrNull()?.currency ?: DEFAULT_CURRENCY
        return MemberBalanceDto(
            memberId = member.id.toString(),
            currency = currency,
            creditBalance = creditBalance.setScale(2),
            topupTotal = topupTotal.setScale(2),
            payoutTotal = payoutTotal.setScale(2),
            purchaseTotal = purchaseTotal.setScale(2),
            correctionTotal = correctionTotal.setScale(2),
            entryCount = entries.size
        )
    }

    /** Signierter Effekt einer Buchung auf das Guthaben. */
    private fun balanceDelta(entry: LedgerEntryEntity): BigDecimal = when (entry.entryType) {
        LedgerEntryType.topup -> entry.amount
        LedgerEntryType.payout -> entry.amount.negate()
        LedgerEntryType.purchase ->
            if (entry.accountingMode == AccountingMode.credit) entry.amount.negate() else BigDecimal.ZERO
        LedgerEntryType.correction -> entry.reversesEntry?.let { balanceDelta(it).negate() } ?: BigDecimal.ZERO
    }

    private fun requireCanReadMember(caller: UserEntity, principal: UserPrincipal, memberId: UUID) {
        if (caller.id == memberId) return
        if (access.has(principal, caller, Permission.LEDGER_READ)) return
        throw AccessDeniedException(
            Msg("error.ledger.balanceViewDenied"),
            ErrorCode.ACCESS_DENIED
        )
    }

    private fun requireLedgerRead(caller: UserEntity, principal: UserPrincipal) {
        if (!access.has(principal, caller, Permission.LEDGER_READ)) {
            throw AccessDeniedException(
                Msg("error.ledger.cashDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    private fun requireLedgerWrite(caller: UserEntity, principal: UserPrincipal) {
        if (!access.has(principal, caller, Permission.LEDGER_CORRECT)) {
            throw AccessDeniedException(
                Msg("error.ledger.cashDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    /**
     * Barcodekäufe sind der Mitglieder-PWA vorbehalten: nur wer Mitglied (bzw.
     * Vorstand/Admin) ist, darf für das eigene Konto kaufen. Gäste und die technische
     * Tablet-Rolle sind ausgeschlossen (`deny by default`).
     */
    private fun requireMember(caller: UserEntity, principal: UserPrincipal) {
        if (!access.has(principal, caller, Permission.PURCHASE_SELF)) {
            throw AccessDeniedException(
                Msg("error.ledger.barcodeMembersOnly"),
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    /** Wer an einem Event kaufen darf: Event-Verwaltung (Vorstand), Veranstalter und Eingeladene. */
    private fun canBuyAt(caller: UserEntity, principal: UserPrincipal, event: EventEntity): Boolean =
        access.has(principal, caller, Permission.EVENT_MANAGE) ||
            event.owner?.id == caller.id ||
            eventParticipantRepository.findByEventIdAndUserId(event.id, caller.id).isPresent

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", id), ErrorCode.NOT_FOUND)
        }

    /**
     * Löst einen Barcode auf ein freigegebenes, aktives Getränk auf. Nicht freigegebene
     * oder inaktive Getränke werden wie ein unbekannter Barcode behandelt.
     */
    private fun resolveDrinkByBarcode(barcode: String): DrinkCatalogEntity {
        val barcodeEntity = drinkBarcodeRepository.findByBarcode(barcode)
            .filter { it.active }
            .orElseThrow {
                ResourceNotFoundException(Msg("error.drink.barcodeNotFound", barcode), ErrorCode.NOT_FOUND)
            }
        val drink = barcodeEntity.drink
            ?: throw ResourceNotFoundException(Msg("error.drink.barcodeNotFound", barcode), ErrorCode.NOT_FOUND)
        if (drink.status != DrinkStatus.approved || !drink.active) {
            throw ResourceNotFoundException(Msg("error.drink.barcodeNotFound", barcode), ErrorCode.NOT_FOUND)
        }
        return drink
    }

    private fun normalizeBarcode(value: String?): String {
        val normalized = value?.replace(WHITESPACE_REGEX, "").orEmpty()
        if (normalized.isBlank()) {
            throw InvalidRequestException(Msg("error.field.blank", "barcode"), ErrorCode.INVALID_REQUEST)
        }
        if (normalized.length > MAX_BARCODE_LENGTH) {
            throw InvalidRequestException(
                Msg("error.field.tooLong", "barcode", MAX_BARCODE_LENGTH),
                ErrorCode.INVALID_REQUEST
            )
        }
        return normalized
    }

    /** Auch frühere Mitglieder: Kontoauszüge bleiben nach dem Austritt lesbar. */
    private fun requireUser(id: UUID): UserEntity = members.requireKnownUser(id)

    private fun parseId(value: String?, field: String): UUID = Identifiers.parseUuid(value, field)

    private fun requirePositiveAmount(amount: BigDecimal?): BigDecimal {
        val value = amount ?: throw InvalidRequestException(Msg("error.field.required", "amount"), ErrorCode.INVALID_REQUEST)
        if (value.signum() <= 0) {
            throw InvalidRequestException(Msg("error.ledger.amountNotPositive"), ErrorCode.INVALID_REQUEST)
        }
        return value
    }

    private fun requireIdempotencyKey(value: String?): String {
        val key = value?.trim()
        if (key.isNullOrBlank()) {
            throw InvalidRequestException(
                Msg("error.idempotency.keyRequired"),
                ErrorCode.IDEMPOTENCY_KEY_REQUIRED
            )
        }
        if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
            throw InvalidRequestException(
                Msg("error.field.tooLong", "Idempotency-Key", MAX_IDEMPOTENCY_KEY_LENGTH),
                ErrorCode.INVALID_REQUEST
            )
        }
        return key
    }

    private fun normalizeCurrency(value: String?): String {
        val trimmed = value?.trim()
        if (trimmed.isNullOrBlank()) return DEFAULT_CURRENCY
        return trimmed.uppercase()
    }

    private fun toDto(entry: LedgerEntryEntity): LedgerEntryDto {
        val snapshot = entry.purchaseSnapshot?.let {
            PurchaseSnapshotDto(
                itemType = it.itemType,
                drinkName = it.drinkName,
                foodName = it.foodName,
                imageReference = it.imageReference,
                barcode = it.barcode,
                unitPrice = it.unitPrice,
                costPrice = it.costPrice,
                profit = it.profit,
                currency = it.currency,
                catalogVersion = it.catalogVersion
            )
        }
        return LedgerEntryDto(
            id = entry.id.toString(),
            entryType = entry.entryType.name,
            eventId = entry.event?.id?.toString(),
            memberId = entry.member?.id?.toString().orEmpty(),
            memberDisplayName = entry.member?.displayName.orEmpty(),
            drinkId = entry.drink?.id?.toString(),
            foodId = entry.food?.id?.toString(),
            amount = entry.amount,
            currency = entry.currency,
            accountingMode = entry.accountingMode.name,
            source = entry.source?.name,
            actorId = entry.actor?.id?.toString().orEmpty(),
            reversesEntryId = entry.reversesEntry?.id?.toString(),
            idempotencyKey = entry.idempotencyKey,
            createdAt = entry.createdAt,
            snapshot = snapshot,
            tallyCategoryId = entry.tallyCategory?.id?.toString(),
            tallyCategoryName = entry.tallyCategory?.name,
            roundId = entry.round?.id?.toString(),
            beneficiaryId = entry.beneficiary?.id?.toString(),
            beneficiaryDisplayName = entry.beneficiary?.displayName
        )
    }

    companion object {
        const val DEFAULT_CURRENCY = "EUR"
        const val MAX_IDEMPOTENCY_KEY_LENGTH = 128
        const val MAX_BARCODE_LENGTH = 128
        const val SCOPE_TOPUP = "ledger-topup"
        const val SCOPE_PAYOUT = "ledger-payout"
        const val SCOPE_CORRECTION = "ledger-correction"
        const val SCOPE_PURCHASE = "ledger-purchase"
        val IDEMPOTENCY_TTL: Duration = Duration.ofDays(30)

        /** Wie lange ein Tablet einen eigenen Strich selbst zurücknehmen darf. */
        val TABLET_UNDO_WINDOW: Duration = Duration.ofMinutes(10)

        /** Wie lange ein Mitglied einen eigenen Barcodekauf selbst zurücknehmen darf. */
        val PURCHASE_UNDO_WINDOW: Duration = TABLET_UNDO_WINDOW
        private val WHITESPACE_REGEX = Regex("\\s+")
    }
}
