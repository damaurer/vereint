package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventFoodEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.FoodCatalogEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.PurchaseSource
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.EventDrinkDto
import de.maurer.baseservice.dto.EventFoodDto
import de.maurer.baseservice.dto.LedgerEntryDto
import de.maurer.baseservice.dto.TabletBoardColumnDto
import de.maurer.baseservice.dto.TabletBoardDrinkDto
import de.maurer.baseservice.dto.TabletBoardDto
import de.maurer.baseservice.dto.TabletBoardMemberDto
import de.maurer.baseservice.dto.TabletEventDto
import de.maurer.baseservice.dto.TabletItemsDto
import de.maurer.baseservice.dto.TabletMemberDto
import de.maurer.baseservice.dto.TabletPurchaseRequest
import de.maurer.baseservice.dto.TabletRevenuePurchaseRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventFoodRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.TallyCategoryRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.Identifiers
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischMembers
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.util.UUID

/**
 * Fachlicher Slice für die Tablet-Erfassung und den Recorder (TICKET-017).
 *
 * Der Tablet-Kontext nutzt eine dedizierte technische Identität (`tabletRecorder`).
 * Er darf aktive Events, die freigegebenen Eventmitglieder und die tabletfähigen
 * Eventgetränke sowie Eventspeisen lesen sowie manuelle Käufe über die Strichliste erfassen.
 */
@Service
@Transactional
class TabletRecorderService(
    private val eventRepository: EventRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val eventFoodRepository: EventFoodRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val userRepository: UserRepository,
    private val access: StammtischAccess,
    private val members: StammtischMembers,
    private val userService: UserService,
    private val ledgerService: LedgerService,
    private val statisticsRecorder: StatisticsRecorder,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val tallyCategoryRepository: TallyCategoryRepository
) {

    @Transactional(readOnly = true)
    fun listActiveEvents(principal: UserPrincipal): List<TabletEventDto> {
        requireTabletRecorder(principal)
        return eventRepository.findByStatus(EventStatus.active)
            .sortedBy { it.startsAt }
            .map { toEventDto(it) }
    }

    @Transactional(readOnly = true)
    fun listEventMembers(eventId: UUID, principal: UserPrincipal): List<TabletMemberDto> {
        requireTabletRecorder(principal)
        val event = requireActiveEvent(eventId)

        val members = LinkedHashMap<UUID, UserEntity>()
        event.owner?.takeIf { !it.disabled }?.let { members[it.id] = it }
        eventParticipantRepository.findByEventId(eventId)
            .mapNotNull { it.user }
            .filter { !it.disabled }
            .forEach { members.putIfAbsent(it.id, it) }

        return members.values
            .sortedBy { it.displayName.lowercase() }
            .map { TabletMemberDto(memberId = it.id.toString(), displayName = it.displayName) }
    }

    /**
     * Strichliste nach Kategorien (Issue #80): eine Spalte je Strich-Kategorie
     * der Gruppe mit den dazu buchbaren Eventgetränken, eine Zeile je
     * Eventmitglied mit den Strichen des Abends, dazu Striche und Umsatz des
     * Events. Zurückgenommene Käufe zählen nicht.
     */
    @Transactional(readOnly = true)
    fun board(eventId: UUID, principal: UserPrincipal): TabletBoardDto {
        requireTabletRecorder(principal)
        requireActiveEvent(eventId)
        val tabletDrinks = eventDrinkRepository.findByEventId(eventId)
            .filter { it.tabletEnabled }
            .sortedBy { it.drink?.name?.lowercase().orEmpty() }
        val columns = tallyCategoryRepository.findByArchivedFalseOrderBySortOrderAscNameAsc().map { category ->
            TabletBoardColumnDto(
                categoryId = category.id.toString(),
                name = category.name,
                price = category.price.setScale(2),
                currency = category.currency,
                drinks = tabletDrinks
                    .filter { EventDrinkPricing.activeCategory(it)?.id == category.id }
                    .map { TabletBoardDrinkDto(eventDrinkId = it.id.toString(), drinkName = it.drink?.name.orEmpty()) }
            )
        }

        val entries = ledgerEntryRepository.findByEventId(eventId)
        val reversed = entries.mapNotNull { it.reversesEntry?.id }.toSet()
        val purchases = entries.filter { it.entryType == LedgerEntryType.purchase && it.id !in reversed }
        val byMember = purchases.groupBy { it.member?.id }

        val members = listEventMembers(eventId, principal).map { member ->
            val own = byMember[UUID.fromString(member.memberId)].orEmpty()
            val counts = own.mapNotNull { it.tallyCategory?.id?.toString() }
                .groupingBy { it }
                .eachCount()
            TabletBoardMemberDto(
                memberId = member.memberId,
                displayName = member.displayName,
                counts = counts,
                otherCount = own.count { it.tallyCategory == null }
            )
        }
        return TabletBoardDto(
            columns = columns,
            members = members,
            tallyCount = purchases.size,
            revenue = purchases.fold(BigDecimal.ZERO) { acc, entry -> acc + entry.amount }.setScale(2),
            currency = purchases.firstOrNull()?.currency ?: columns.firstOrNull()?.currency ?: DEFAULT_CURRENCY
        )
    }

    @Transactional(readOnly = true)
    fun listTabletDrinks(eventId: UUID, principal: UserPrincipal): List<EventDrinkDto> {
        requireTabletRecorder(principal)
        requireActiveEvent(eventId)
        return eventDrinkRepository.findByEventId(eventId)
            .filter { it.tabletEnabled }
            .sortedBy { it.drink?.name.orEmpty() }
            .map { toEventDrinkDto(it) }
    }

    @Transactional(readOnly = true)
    fun listTabletFood(eventId: UUID, principal: UserPrincipal): List<EventFoodDto> {
        requireTabletRecorder(principal)
        requireActiveEvent(eventId)
        return eventFoodRepository.findByEventId(eventId)
            .filter { it.tabletEnabled }
            .sortedBy { it.food?.name.orEmpty() }
            .map { toEventFoodDto(it) }
    }

    @Transactional(readOnly = true)
    fun listTabletItems(eventId: UUID, principal: UserPrincipal): TabletItemsDto {
        requireTabletRecorder(principal)
        requireActiveEvent(eventId)
        val drinks = eventDrinkRepository.findByEventId(eventId)
            .filter { it.tabletEnabled }
            .sortedBy { it.drink?.name.orEmpty() }
            .map { toEventDrinkDto(it) }
        val food = eventFoodRepository.findByEventId(eventId)
            .filter { it.tabletEnabled }
            .sortedBy { it.food?.name.orEmpty() }
            .map { toEventFoodDto(it) }
        return TabletItemsDto(drinks = drinks, food = food)
    }

    /**
     * Erfasst einen manuellen Kauf (Getränk oder Speise).
     */
    fun recordPurchase(
        eventId: UUID,
        request: TabletPurchaseRequest,
        idempotencyKey: String?,
        principal: UserPrincipal
    ): LedgerEntryDto {
        val actor = requireTabletRecorder(principal)
        val event = requireActiveEvent(eventId)

        val memberId = Identifiers.parseUuid(request.memberId, "memberId")
        val buyer = requireEventMember(event, memberId)

        val hasDrink = !request.eventDrinkId.isNullOrBlank()
        val hasFood = !request.eventFoodId.isNullOrBlank()

        if (hasDrink && hasFood) {
            throw InvalidRequestException(
                Msg("error.tablet.drinkOrFoodExclusive"),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (!hasDrink && !hasFood) {
            throw InvalidRequestException(
                Msg("error.tablet.drinkOrFoodRequired"),
                ErrorCode.INVALID_REQUEST
            )
        }

        return if (hasDrink) {
            val eventDrinkId = Identifiers.parseUuid(request.eventDrinkId, "eventDrinkId")
            val eventDrink = requireEventDrink(eventId, eventDrinkId)
            val drink = eventDrink.drink
                ?: throw ResourceNotFoundException(
                    Msg("error.eventDrink.noDrink", eventDrinkId),
                    ErrorCode.NOT_FOUND
                )

            ledgerService.recordTabletPurchase(
                event = event,
                member = buyer,
                drink = drink,
                eventDrink = eventDrink,
                actor = actor,
                idempotencyKey = idempotencyKey
            )
        } else {
            val eventFoodId = Identifiers.parseUuid(request.eventFoodId, "eventFoodId")
            val eventFood = requireEventFood(eventId, eventFoodId)
            val food = eventFood.food
                ?: throw ResourceNotFoundException(
                    Msg("error.eventFood.noFood", eventFoodId),
                    ErrorCode.NOT_FOUND
                )

            ledgerService.recordTabletFoodPurchase(
                event = event,
                member = buyer,
                food = food,
                eventFood = eventFood,
                actor = actor,
                idempotencyKey = idempotencyKey
            )
        }
    }

    /**
     * Nimmt einen eben am Tablet erfassten Strich zurück (Gegenbuchung). Die
     * fachlichen Grenzen (eigener Strich, dieses Event, Zeitfenster) prüft
     * [LedgerService.undoTabletPurchase].
     */
    fun undoPurchase(
        eventId: UUID,
        entryId: UUID,
        idempotencyKey: String?,
        principal: UserPrincipal
    ): LedgerEntryDto {
        val actor = requireTabletRecorder(principal)
        requireActiveEvent(eventId)
        return ledgerService.undoTabletPurchase(eventId, entryId, actor, idempotencyKey)
    }

    /**
     * Erfasst eine Runde (`source = round`) als Revenue-Only-Buchung für alle
     * angegebenen Eventmitglieder.
     */
    fun recordRound(
        eventId: UUID,
        request: TabletRevenuePurchaseRequest,
        idempotencyKey: String?,
        principal: UserPrincipal
    ): List<LedgerEntryDto> = recordRevenuePurchase(eventId, request, idempotencyKey, principal, PurchaseSource.round)

    /**
     * Erfasst eine Abendaktion (`source = evening`) als Revenue-Only-Buchung für alle
     * angegebenen Eventmitglieder.
     */
    fun recordEvening(
        eventId: UUID,
        request: TabletRevenuePurchaseRequest,
        idempotencyKey: String?,
        principal: UserPrincipal
    ): List<LedgerEntryDto> = recordRevenuePurchase(eventId, request, idempotencyKey, principal, PurchaseSource.evening)

    private fun recordRevenuePurchase(
        eventId: UUID,
        request: TabletRevenuePurchaseRequest,
        idempotencyKey: String?,
        principal: UserPrincipal,
        source: PurchaseSource
    ): List<LedgerEntryDto> {
        val actor = requireTabletRecorder(principal)
        val event = requireActiveEvent(eventId)
        val baseKey = requireBatchIdempotencyKey(idempotencyKey)

        val hasDrink = !request.eventDrinkId.isNullOrBlank()
        val hasFood = !request.eventFoodId.isNullOrBlank()

        if (hasDrink && hasFood) {
            throw InvalidRequestException(
                Msg("error.tablet.drinkOrFoodExclusive"),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (!hasDrink && !hasFood) {
            throw InvalidRequestException(
                Msg("error.tablet.drinkOrFoodRequired"),
                ErrorCode.INVALID_REQUEST
            )
        }

        val rawIds = request.memberIds.orEmpty()
        if (rawIds.isEmpty()) {
            throw InvalidRequestException(Msg("error.field.blank", "memberIds"), ErrorCode.INVALID_REQUEST)
        }
        val memberIds = rawIds.map { Identifiers.parseUuid(it, "memberIds") }.distinct()

        val entries = if (hasDrink) {
            val eventDrinkId = Identifiers.parseUuid(request.eventDrinkId, "eventDrinkId")
            val eventDrink = requireEventDrink(eventId, eventDrinkId)
            val drink = eventDrink.drink
                ?: throw ResourceNotFoundException(
                    Msg("error.eventDrink.noDrink", eventDrinkId),
                    ErrorCode.NOT_FOUND
                )

            memberIds.map { memberId ->
                val buyer = requireEventMember(event, memberId)
                val derivedKey = "$baseKey#${source.name}#$memberId"
                ledgerService.recordEventRevenuePurchase(
                    event = event,
                    member = buyer,
                    drink = drink,
                    eventDrink = eventDrink,
                    actor = actor,
                    source = source,
                    idempotencyKey = derivedKey
                )
            }
        } else {
            val eventFoodId = Identifiers.parseUuid(request.eventFoodId, "eventFoodId")
            val eventFood = requireEventFood(eventId, eventFoodId)
            val food = eventFood.food
                ?: throw ResourceNotFoundException(
                    Msg("error.eventFood.noFood", eventFoodId),
                    ErrorCode.NOT_FOUND
                )

            memberIds.map { memberId ->
                val buyer = requireEventMember(event, memberId)
                val derivedKey = "$baseKey#${source.name}#$memberId"
                ledgerService.recordEventRevenueFoodPurchase(
                    event = event,
                    member = buyer,
                    food = food,
                    eventFood = eventFood,
                    actor = actor,
                    source = source,
                    idempotencyKey = derivedKey
                )
            }
        }
        entries.firstOrNull()?.let {
            statisticsRecorder.round(actor, event, source.name, UUID.fromString(it.id), entries.size)
        }
        return entries
    }

    private fun requireTabletRecorder(principal: UserPrincipal): UserEntity {
        val actor = userService.getOrCreateUser(principal)
        if (!access.has(principal, actor, Permission.PURCHASE_TABLET)) {
            throw AccessDeniedException(
                Msg("error.tablet.recorderOnly"),
                ErrorCode.ACCESS_DENIED
            )
        }
        return actor
    }

    private fun requireBatchIdempotencyKey(value: String?): String {
        val key = value?.trim()
        if (key.isNullOrBlank()) {
            throw InvalidRequestException(
                Msg("error.idempotency.keyRequired"),
                ErrorCode.IDEMPOTENCY_KEY_REQUIRED
            )
        }
        if (key.length > MAX_BATCH_IDEMPOTENCY_KEY_LENGTH) {
            throw InvalidRequestException(
                Msg("error.idempotency.batchKeyTooLong", MAX_BATCH_IDEMPOTENCY_KEY_LENGTH),
                ErrorCode.INVALID_REQUEST
            )
        }
        return key
    }

    private fun requireActiveEvent(eventId: UUID): EventEntity {
        val event = eventRepository.findById(eventId).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", eventId), ErrorCode.NOT_FOUND)
        }
        if (event.status != EventStatus.active) {
            throw EventNotActiveException(
                Msg("error.tablet.eventNotActive"),
                ErrorCode.EVENT_NOT_ACTIVE
            )
        }
        return event
    }

    /** Der Käufer muss ein aktives Mitglied des Events sein (Owner oder Teilnehmer). */
    private fun requireEventMember(event: EventEntity, memberId: UUID): UserEntity {
        val buyer = userRepository.findById(memberId).orElseThrow {
            ResourceNotFoundException(Msg("error.user.notFound", memberId), ErrorCode.NOT_FOUND)
        }
        val isOwner = event.owner?.id == memberId
        val isParticipant = eventParticipantRepository.findByEventIdAndUserId(event.id, memberId).isPresent
        if (buyer.disabled || !members.isActiveMember(memberId) || (!isOwner && !isParticipant)) {
            throw InvalidRequestException(
                Msg("error.tablet.buyerNotMember"),
                ErrorCode.INVALID_REQUEST
            )
        }
        return buyer
    }

    private fun requireEventDrink(eventId: UUID, eventDrinkId: UUID): EventDrinkEntity {
        val eventDrink = eventDrinkRepository.findById(eventDrinkId).orElseThrow {
            ResourceNotFoundException(Msg("error.eventDrink.notFound", eventDrinkId), ErrorCode.NOT_FOUND)
        }
        if (eventDrink.event?.id != eventId) {
            throw ResourceNotFoundException(
                Msg("error.eventDrink.notInEvent", eventDrinkId),
                ErrorCode.NOT_FOUND
            )
        }
        if (!eventDrink.tabletEnabled) {
            throw InvalidRequestException(
                Msg("error.tablet.drinkDisabled"),
                ErrorCode.INVALID_REQUEST
            )
        }
        return eventDrink
    }

    private fun requireEventFood(eventId: UUID, eventFoodId: UUID): EventFoodEntity {
        val eventFood = eventFoodRepository.findById(eventFoodId).orElseThrow {
            ResourceNotFoundException(Msg("error.eventFood.notFound", eventFoodId), ErrorCode.NOT_FOUND)
        }
        if (eventFood.event?.id != eventId) {
            throw ResourceNotFoundException(
                Msg("error.eventFood.notInEvent", eventFoodId),
                ErrorCode.NOT_FOUND
            )
        }
        if (!eventFood.tabletEnabled) {
            throw InvalidRequestException(
                Msg("error.tablet.foodDisabled"),
                ErrorCode.INVALID_REQUEST
            )
        }
        return eventFood
    }

    private fun toEventDto(event: EventEntity): TabletEventDto =
        TabletEventDto(
            id = event.id.toString(),
            title = event.title,
            location = event.location,
            startsAt = event.startsAt,
            status = event.status.name
        )

    private fun toEventDrinkDto(eventDrink: EventDrinkEntity): EventDrinkDto {
        val drink = eventDrink.drink
        val costPrice = eventDrink.costPrice
        val effectiveCost = costPrice ?: drink?.costPrice ?: BigDecimal.ZERO
        return EventDrinkDto(
            id = eventDrink.id.toString(),
            eventId = eventDrink.event?.id?.toString().orEmpty(),
            drinkId = drink?.id?.toString().orEmpty(),
            drinkName = drink?.name.orEmpty(),
            price = eventDrink.price,
            costPrice = costPrice,
            effectiveCostPrice = effectiveCost,
            currency = eventDrink.currency,
            selfServiceEnabled = eventDrink.selfServiceEnabled,
            tabletEnabled = eventDrink.tabletEnabled,
            catalogVersion = eventDrink.catalogVersion,
            imageSnapshot = eventDrink.imageSnapshot,
            createdAt = eventDrink.createdAt,
            updatedAt = eventDrink.updatedAt,
            effectivePrice = EventDrinkPricing.resolve(eventDrink).unitPrice,
            tallyCategoryId = EventDrinkPricing.activeCategory(eventDrink)?.id?.toString(),
            tallyCategoryName = EventDrinkPricing.activeCategory(eventDrink)?.name
        )
    }

    private fun toEventFoodDto(eventFood: EventFoodEntity): EventFoodDto {
        val food = eventFood.food
        val price = eventFood.price
        val effectivePrice = price ?: food?.defaultPrice ?: BigDecimal.ZERO
        val costPrice = eventFood.costPrice
        val effectiveCost = costPrice ?: food?.costPrice ?: BigDecimal.ZERO

        return EventFoodDto(
            id = eventFood.id.toString(),
            eventId = eventFood.event?.id?.toString().orEmpty(),
            foodId = food?.id?.toString().orEmpty(),
            foodName = food?.name.orEmpty(),
            price = price,
            effectivePrice = effectivePrice,
            costPrice = costPrice,
            effectiveCostPrice = effectiveCost,
            currency = eventFood.currency,
            selfServiceEnabled = eventFood.selfServiceEnabled,
            tabletEnabled = eventFood.tabletEnabled,
            createdAt = eventFood.createdAt,
            updatedAt = eventFood.updatedAt
        )
    }

    companion object {
        const val MAX_BATCH_IDEMPOTENCY_KEY_LENGTH = 80
        const val DEFAULT_CURRENCY = "EUR"
    }
}
