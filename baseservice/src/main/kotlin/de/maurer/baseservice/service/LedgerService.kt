package de.maurer.baseservice.service

import de.maurer.baseservice.domain.AccountingMode
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.IdempotencyRecordEntity
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.PurchaseSnapshotEntity
import de.maurer.baseservice.domain.PurchaseSource
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.IdempotencyConflictException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
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
import de.maurer.baseservice.support.Identifiers
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
 * dasselbe Ergebnis oder einen kontrollierten Konflikt (siehe `docs/fachkonzept.md`).
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
    private val userRepository: UserRepository,
    private val userRoleRepository: UserRoleRepository,
    private val eventRepository: EventRepository,
    private val drinkBarcodeRepository: DrinkBarcodeRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val userService: UserService,
    private val auditService: AuditService
) {

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
        return ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(memberId).map { toDto(it) }
    }

    @Transactional(readOnly = true)
    fun getEventSummary(eventId: UUID, principal: UserPrincipal): EventLedgerSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        if (!isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(
                "Nur Vorstand und Administration dürfen die Eventabrechnung einsehen",
                ErrorCode.ACCESS_DENIED
            )
        }
        val entries = ledgerEntryRepository.findByEventId(eventId)
        val purchases = entries.filter { it.entryType == LedgerEntryType.purchase }
        val purchaseCorrections = entries.filter {
            it.entryType == LedgerEntryType.correction && it.reversesEntry?.entryType == LedgerEntryType.purchase
        }
        val revenueTotal = purchases.sumOf { it.amount } -
            purchaseCorrections.sumOf { it.reversesEntry?.amount ?: BigDecimal.ZERO }
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
            creditConsumptionTotal = creditConsumptionTotal.setScale(2),
            entryCount = entries.size
        )
    }

    fun topup(request: TopupRequest, idempotencyKey: String?, principal: UserPrincipal): LedgerEntryDto {
        val caller = userService.getOrCreateUser(principal)
        requireLedgerWrite(caller, principal)
        val key = requireIdempotencyKey(idempotencyKey)
        val amount = requirePositiveAmount(request.amount)
        val member = requireUser(parseId(request.memberId, "memberId"))
        val currency = normalizeCurrency(request.currency)
        return appendWrite(
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
    }

    fun payout(request: PayoutRequest, idempotencyKey: String?, principal: UserPrincipal): LedgerEntryDto {
        val caller = userService.getOrCreateUser(principal)
        requireLedgerWrite(caller, principal)
        val key = requireIdempotencyKey(idempotencyKey)
        val amount = requirePositiveAmount(request.amount)
        val member = requireUser(parseId(request.memberId, "memberId"))
        val currency = normalizeCurrency(request.currency)
        return appendWrite(
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
    }

    fun correct(request: CorrectionRequest, idempotencyKey: String?, principal: UserPrincipal): LedgerEntryDto {
        val caller = userService.getOrCreateUser(principal)
        requireLedgerWrite(caller, principal)
        val key = requireIdempotencyKey(idempotencyKey)
        val originalId = parseId(request.originalEntryId, "originalEntryId")
        val original = ledgerEntryRepository.findById(originalId).orElseThrow {
            ResourceNotFoundException("Buchung mit ID '$originalId' nicht gefunden", ErrorCode.NOT_FOUND)
        }
        if (original.entryType == LedgerEntryType.correction) {
            throw InvalidRequestException(
                "Eine Gegenbuchung kann nicht erneut korrigiert werden",
                ErrorCode.INVALID_REQUEST
            )
        }
        if (ledgerEntryRepository.findByReversesEntryId(originalId).isNotEmpty()) {
            throw ApiException(
                ErrorCode.LEDGER_ALREADY_CORRECTED,
                "Buchung '$originalId' wurde bereits korrigiert",
                HttpStatus.CONFLICT
            )
        }
        val member = original.member
            ?: throw ResourceNotFoundException("Ursprungsbuchung ohne Mitglied", ErrorCode.NOT_FOUND)
        return appendWrite(
            scope = SCOPE_CORRECTION,
            key = key,
            entryType = LedgerEntryType.correction,
            member = member,
            event = original.event,
            drink = original.drink,
            amount = original.amount,
            currency = original.currency,
            accountingMode = original.accountingMode,
            source = null,
            actor = caller,
            reversesEntry = original,
            auditAction = AuditService.ACTION_LEDGER_CORRECTION,
            note = request.reason
        )
    }

    /**
     * PWA-Barcodekauf eines Mitglieds (TICKET-016). Der Client liefert nur Event und
     * gescannten Barcode; Käufer, Preis, Währung, Getränk und Abrechnungsmodus werden
     * serverseitig bestimmt: Käufer ist stets der angemeldete Benutzer, Preis/Währung
     * stammen aus dem Eventgetränk, der Modus ist `credit` (persönliches Verzehrbudget).
     *
     * Der Kauf ist nur an einem aktiven Event und für ein dort selbstbedienbares,
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
                "Für dieses Event können derzeit keine Barcodekäufe gebucht werden",
                ErrorCode.EVENT_NOT_ACTIVE
            )
        }

        val barcode = normalizeBarcode(request.barcode)
        val drink = resolveDrinkByBarcode(barcode)
        val eventDrink = eventDrinkRepository.findByEventIdAndDrinkId(event.id, drink.id).orElseThrow {
            ApiException(
                ErrorCode.DRINK_NOT_IN_EVENT,
                "Das Getränk zu Barcode '$barcode' ist nicht Teil der Eventauswahl",
                HttpStatus.NOT_FOUND
            )
        }
        if (!eventDrink.selfServiceEnabled) {
            throw ApiException(
                ErrorCode.SELF_SERVICE_DISABLED,
                "Für dieses Getränk ist die Selbstbedienung im Event deaktiviert",
                HttpStatus.FORBIDDEN
            )
        }

        val currency = eventDrink.currency
        return appendWrite(
            scope = SCOPE_PURCHASE,
            key = key,
            entryType = LedgerEntryType.purchase,
            member = caller,
            event = event,
            drink = drink,
            amount = eventDrink.price,
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
                    drinkName = drink.name,
                    imageReference = eventDrink.imageSnapshot ?: drink.imageReference,
                    barcode = barcode,
                    unitPrice = eventDrink.price.setScale(2),
                    currency = currency,
                    catalogVersion = eventDrink.catalogVersion
                )
            }
        )
    }

    /**
     * Manueller Tablet-Kauf über die Strichliste (TICKET-017). Käufer, Getränk,
     * Preis, Währung und Abrechnungsmodus werden serverseitig vorgegeben: Der Käufer
     * ist ein bereits aufgelöstes Eventmitglied, Preis/Währung stammen aus dem
     * Eventgetränk, der Modus ist `credit` und die Herkunft `tabletManual`.
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
        idempotencyKey: String?
    ): LedgerEntryDto {
        val key = requireIdempotencyKey(idempotencyKey)
        val currency = eventDrink.currency
        return appendWrite(
            scope = SCOPE_PURCHASE,
            key = key,
            entryType = LedgerEntryType.purchase,
            member = member,
            event = event,
            drink = drink,
            amount = eventDrink.price,
            currency = currency,
            accountingMode = AccountingMode.credit,
            source = PurchaseSource.tabletManual,
            actor = actor,
            reversesEntry = null,
            auditAction = AuditService.ACTION_LEDGER_PURCHASE,
            note = "event=${event.id}; tablet; member=${member.id}",
            snapshotFactory = {
                PurchaseSnapshotEntity(
                    ledgerEntry = it,
                    drinkName = drink.name,
                    imageReference = eventDrink.imageSnapshot ?: drink.imageReference,
                    barcode = null,
                    unitPrice = eventDrink.price.setScale(2),
                    currency = currency,
                    catalogVersion = eventDrink.catalogVersion
                )
            }
        )
    }

    /**
     * Buchung einer Runde oder Abendaktion (TICKET-018). Getränk, Preis, Währung und
     * Herkunft (`round`/`evening`) werden serverseitig vorgegeben; der Abrechnungsmodus
     * ist stets `revenueOnly`, sodass kein persönliches Guthaben belastet wird und
     * ausschließlich der Eventumsatz steigt (siehe `docs/fachkonzept.md`).
     *
     * Die fachliche Berechtigung (`purchase.tablet`), der aktive Eventstatus, die
     * Mitgliedschaft des Begünstigten und die Tablet-Freigabe des Getränks werden im
     * [de.maurer.baseservice.service.TabletRecorderService] geprüft; hier entsteht
     * ausschließlich die unveränderliche Buchung samt Beleg-Snapshot. Wiederholungen
     * mit demselben Idempotency-Key erzeugen keine Doppelbuchung.
     */
    fun recordEventRevenuePurchase(
        event: EventEntity,
        member: UserEntity,
        drink: DrinkCatalogEntity,
        eventDrink: EventDrinkEntity,
        actor: UserEntity,
        source: PurchaseSource,
        idempotencyKey: String?
    ): LedgerEntryDto {
        if (source != PurchaseSource.round && source != PurchaseSource.evening) {
            throw InvalidRequestException(
                "source muss round oder evening sein",
                ErrorCode.INVALID_REQUEST
            )
        }
        val key = requireIdempotencyKey(idempotencyKey)
        val currency = eventDrink.currency
        return appendWrite(
            scope = SCOPE_PURCHASE,
            key = key,
            entryType = LedgerEntryType.purchase,
            member = member,
            event = event,
            drink = drink,
            amount = eventDrink.price,
            currency = currency,
            accountingMode = AccountingMode.revenueOnly,
            source = source,
            actor = actor,
            reversesEntry = null,
            auditAction = AuditService.ACTION_LEDGER_PURCHASE,
            note = "event=${event.id}; ${source.name}; member=${member.id}",
            snapshotFactory = {
                PurchaseSnapshotEntity(
                    ledgerEntry = it,
                    drinkName = drink.name,
                    imageReference = eventDrink.imageSnapshot ?: drink.imageReference,
                    barcode = null,
                    unitPrice = eventDrink.price.setScale(2),
                    currency = currency,
                    catalogVersion = eventDrink.catalogVersion
                )
            }
        )
    }

    /**
     * Fügt eine Buchung idempotent an. Wiederholungen mit demselben Schlüssel und
     * identischen Kerndaten liefern die bestehende Buchung; abweichende Daten führen
     * zu einem `409 idempotency_conflict`.
     *
     * [snapshotFactory] erzeugt bei Käufen den unveränderlichen Beleg-Snapshot,
     * nachdem die Buchung gespeichert wurde.
     */
    private fun appendWrite(
        scope: String,
        key: String,
        entryType: LedgerEntryType,
        member: UserEntity,
        event: EventEntity?,
        drink: DrinkCatalogEntity?,
        amount: BigDecimal,
        currency: String,
        accountingMode: AccountingMode,
        source: PurchaseSource?,
        actor: UserEntity,
        reversesEntry: LedgerEntryEntity?,
        auditAction: String,
        note: String?,
        snapshotFactory: ((LedgerEntryEntity) -> PurchaseSnapshotEntity)? = null
    ): LedgerEntryDto {
        val existing = ledgerEntryRepository.findByIdempotencyKey(key).orElse(null)
        if (existing != null) {
            if (matchesReplay(existing, entryType, member, amount, currency)) {
                return toDto(existing)
            }
            throw IdempotencyConflictException(
                "Idempotenzschlüssel '$key' wurde bereits für einen anderen Vorgang verwendet",
                ErrorCode.IDEMPOTENCY_CONFLICT
            )
        }

        val entry = LedgerEntryEntity(
            entryType = entryType,
            event = event,
            member = member,
            drink = drink,
            amount = amount.setScale(2),
            currency = currency,
            accountingMode = accountingMode,
            source = source,
            actor = actor,
            reversesEntry = reversesEntry,
            idempotencyKey = key
        )
        val saved = ledgerEntryRepository.save(entry)
        snapshotFactory?.let {
            val snapshot = purchaseSnapshotRepository.save(it(saved))
            saved.purchaseSnapshot = snapshot
        }
        recordIdempotency(scope, key)
        auditService.recordLedgerEntry(
            actor,
            auditAction,
            saved.id,
            "type=$entryType; member=${member.id}; amount=${amount.setScale(2)} $currency; " +
                "reverses=${reversesEntry?.id ?: "-"}; note=${note?.trim()?.ifBlank { null } ?: "-"}"
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
        if (isBoardOrAdmin(caller, principal)) return
        throw AccessDeniedException(
            "Keine Berechtigung zum Anzeigen dieses Guthabens",
            ErrorCode.ACCESS_DENIED
        )
    }

    private fun requireLedgerWrite(caller: UserEntity, principal: UserPrincipal) {
        if (!isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(
                "Nur Vorstand und Administration dürfen Kassenbuchungen vornehmen",
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
        val allowed = rolesOf(caller, principal).any {
            it == UserRole.MEMBER || it == UserRole.BOARD || it == UserRole.ADMIN
        }
        if (!allowed) {
            throw AccessDeniedException(
                "Nur Mitglieder dürfen Barcodekäufe für das eigene Konto ausführen",
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Event mit ID '$id' nicht gefunden", ErrorCode.NOT_FOUND)
        }

    /**
     * Löst einen Barcode auf ein freigegebenes, aktives Getränk auf. Nicht freigegebene
     * oder inaktive Getränke werden wie ein unbekannter Barcode behandelt.
     */
    private fun resolveDrinkByBarcode(barcode: String): DrinkCatalogEntity {
        val barcodeEntity = drinkBarcodeRepository.findByBarcode(barcode)
            .filter { it.active }
            .orElseThrow {
                ResourceNotFoundException("Kein Getränk zu Barcode '$barcode' gefunden", ErrorCode.NOT_FOUND)
            }
        val drink = barcodeEntity.drink
            ?: throw ResourceNotFoundException("Kein Getränk zu Barcode '$barcode' gefunden", ErrorCode.NOT_FOUND)
        if (drink.status != DrinkStatus.approved || !drink.active) {
            throw ResourceNotFoundException("Kein Getränk zu Barcode '$barcode' gefunden", ErrorCode.NOT_FOUND)
        }
        return drink
    }

    private fun normalizeBarcode(value: String?): String {
        val normalized = value?.replace(WHITESPACE_REGEX, "").orEmpty()
        if (normalized.isBlank()) {
            throw InvalidRequestException("barcode darf nicht leer sein", ErrorCode.INVALID_REQUEST)
        }
        if (normalized.length > MAX_BARCODE_LENGTH) {
            throw InvalidRequestException(
                "barcode darf höchstens $MAX_BARCODE_LENGTH Zeichen lang sein",
                ErrorCode.INVALID_REQUEST
            )
        }
        return normalized
    }

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        rolesOf(caller, principal).any { it == UserRole.BOARD || it == UserRole.ADMIN }

    private fun rolesOf(caller: UserEntity, principal: UserPrincipal): Set<String> {
        val dbRoles = userRoleRepository.findByIdUserId(caller.id).map { it.id.role.name }
        return principal.roles + dbRoles
    }

    private fun requireUser(id: UUID): UserEntity =
        userRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Benutzer mit ID '$id' nicht gefunden", ErrorCode.NOT_FOUND)
        }

    private fun parseId(value: String?, field: String): UUID = Identifiers.parseUuid(value, field)

    private fun requirePositiveAmount(amount: BigDecimal?): BigDecimal {
        val value = amount ?: throw InvalidRequestException("amount ist erforderlich", ErrorCode.INVALID_REQUEST)
        if (value.signum() <= 0) {
            throw InvalidRequestException("amount muss größer als 0 sein", ErrorCode.INVALID_REQUEST)
        }
        return value
    }

    private fun requireIdempotencyKey(value: String?): String {
        val key = value?.trim()
        if (key.isNullOrBlank()) {
            throw InvalidRequestException(
                "Header 'Idempotency-Key' ist für finanzielle Schreibvorgänge erforderlich",
                ErrorCode.IDEMPOTENCY_KEY_REQUIRED
            )
        }
        if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
            throw InvalidRequestException(
                "Idempotency-Key darf höchstens $MAX_IDEMPOTENCY_KEY_LENGTH Zeichen lang sein",
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
                drinkName = it.drinkName,
                imageReference = it.imageReference,
                barcode = it.barcode,
                unitPrice = it.unitPrice,
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
            amount = entry.amount,
            currency = entry.currency,
            accountingMode = entry.accountingMode.name,
            source = entry.source?.name,
            actorId = entry.actor?.id?.toString().orEmpty(),
            reversesEntryId = entry.reversesEntry?.id?.toString(),
            idempotencyKey = entry.idempotencyKey,
            createdAt = entry.createdAt,
            snapshot = snapshot
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
        private val WHITESPACE_REGEX = Regex("\\s+")
    }
}
