package de.maurer.baseservice.service

import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.DrinkSublistEntity
import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.DrinkSublistItemRepository
import de.maurer.baseservice.repository.DrinkSublistRepository
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Fachlicher Slice für die eventbezogene Getränkeauswahl (TICKET-013).
 *
 * Eventgetränke sind Kopien globaler Stammdaten: Preis, Flags, Katalogversion und
 * Bildreferenz werden zum Zeitpunkt der Aufnahme als Snapshot festgehalten
 * (`event_drinks`). Beim Zuweisen einer Sublist werden deren Einträge in die
 * Eventauswahl kopiert; spätere Änderungen an Vorlage oder globalem Katalog wirken
 * nicht rückwirkend (siehe `docs/fachkonzept.md`).
 *
 * Owner-Rechte werden objektbezogen und serverseitig geprüft; jeder Aufruf folgt
 * dem Prinzip `deny by default`. Verwalten darf nur der Event-Owner sowie Vorstand
 * und Administration; sichtbar ist die Auswahl für alle, die das Event sehen dürfen.
 */
@Service
@Transactional
class EventDrinkService(
    private val eventDrinkRepository: EventDrinkRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val drinkSublistRepository: DrinkSublistRepository,
    private val drinkSublistItemRepository: DrinkSublistItemRepository,
    private val access: StammtischAccess,
    private val userService: UserService
) {

    @Transactional(readOnly = true)
    fun listEventDrinks(eventId: UUID, principal: UserPrincipal): List<EventDrinkDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        if (!canViewEvent(caller, principal, event)) {
            throw AccessDeniedException(
                Msg("error.eventDrink.viewDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
        return eventDrinkRepository.findByEventId(eventId)
            .sortedBy { it.drink?.name.orEmpty() }
            .map { toDto(it) }
    }

    fun addEventDrink(eventId: UUID, request: AddEventDrinkRequest, principal: UserPrincipal): EventDrinkDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val drinkId = parseId(request.drinkId, "drinkId")
        val drink = requireApprovedDrink(drinkId)

        if (eventDrinkRepository.findByEventIdAndDrinkId(eventId, drink.id).isPresent) {
            throw InvalidRequestException(
                Msg("error.eventDrink.alreadyAdded"),
                ErrorCode.INVALID_REQUEST
            )
        }

        val price = request.price ?: drink.defaultPrice
        if (price.signum() < 0) {
            throw InvalidRequestException(Msg("error.field.negative", "price"), ErrorCode.INVALID_REQUEST)
        }
        val costPrice = request.costPrice
        if (costPrice != null && costPrice.signum() < 0) {
            throw InvalidRequestException(Msg("error.field.negative", "costPrice"), ErrorCode.INVALID_REQUEST)
        }
        val eventDrink = EventDrinkEntity(
            event = event,
            drink = drink,
            price = price,
            costPrice = costPrice,
            currency = normalizeCurrency(request.currency) ?: drink.currency,
            selfServiceEnabled = request.selfServiceEnabled ?: true,
            tabletEnabled = request.tabletEnabled ?: true,
            catalogVersion = drink.catalogVersion,
            imageSnapshot = drink.imageReference
        )
        val saved = eventDrinkRepository.save(eventDrink)
        return toDto(saved)
    }

    fun updateEventDrink(
        eventId: UUID,
        eventDrinkId: UUID,
        request: UpdateEventDrinkRequest,
        principal: UserPrincipal
    ): EventDrinkDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val eventDrink = requireEventDrink(eventId, eventDrinkId)

        if (request.price != null) {
            if (request.price.signum() < 0) {
                throw InvalidRequestException(Msg("error.field.negative", "price"), ErrorCode.INVALID_REQUEST)
            }
            eventDrink.price = request.price
        }
        if (request.costPrice != null) {
            if (request.costPrice.signum() < 0) {
                throw InvalidRequestException(Msg("error.field.negative", "costPrice"), ErrorCode.INVALID_REQUEST)
            }
            eventDrink.costPrice = request.costPrice
        }
        normalizeCurrency(request.currency)?.let { eventDrink.currency = it }
        request.selfServiceEnabled?.let { eventDrink.selfServiceEnabled = it }
        request.tabletEnabled?.let { eventDrink.tabletEnabled = it }

        val saved = eventDrinkRepository.save(eventDrink)
        return toDto(saved)
    }

    fun removeEventDrink(eventId: UUID, eventDrinkId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val eventDrink = requireEventDrink(eventId, eventDrinkId)
        eventDrinkRepository.delete(eventDrink)
    }

    /**
     * Kopiert die Einträge einer Sublist in die Eventauswahl. Bereits vorhandene
     * Getränke werden übersprungen; nicht (mehr) freigegebene Getränke der Vorlage
     * werden ausgelassen. Rückgabe ist die vollständige, aktuelle Eventauswahl.
     */
    fun assignSublist(eventId: UUID, request: AssignSublistRequest, principal: UserPrincipal): List<EventDrinkDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val sublistId = parseId(request.sublistId, "sublistId")
        val sublist = requireUsableSublist(caller, principal, sublistId)

        val items = drinkSublistItemRepository.findBySublistId(sublist.id)
        for (item in items) {
            val drink = item.drink ?: continue
            if (drink.status != DrinkStatus.approved || !drink.active) continue
            if (eventDrinkRepository.findByEventIdAndDrinkId(eventId, drink.id).isPresent) continue

            val price = item.defaultPrice ?: drink.defaultPrice
            eventDrinkRepository.save(
                EventDrinkEntity(
                    event = event,
                    drink = drink,
                    price = price,
                    currency = drink.currency,
                    selfServiceEnabled = true,
                    tabletEnabled = true,
                    catalogVersion = drink.catalogVersion,
                    imageSnapshot = drink.imageReference
                )
            )
        }

        return eventDrinkRepository.findByEventId(eventId)
            .sortedBy { it.drink?.name.orEmpty() }
            .map { toDto(it) }
    }

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", id), ErrorCode.NOT_FOUND)
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
        return eventDrink
    }

    private fun requireApprovedDrink(drinkId: UUID): DrinkCatalogEntity {
        val drink = drinkCatalogRepository.findById(drinkId).orElseThrow {
            ResourceNotFoundException(Msg("error.drink.notFound", drinkId), ErrorCode.NOT_FOUND)
        }
        if (drink.status != DrinkStatus.approved || !drink.active) {
            throw InvalidRequestException(
                Msg("error.eventDrink.drinkNotApproved"),
                ErrorCode.INVALID_REQUEST
            )
        }
        return drink
    }

    /** Anwendbar ist eine Sublist ausschließlich für den Ersteller sowie Vorstand/Admin. */
    private fun requireUsableSublist(
        caller: UserEntity,
        principal: UserPrincipal,
        sublistId: UUID
    ): DrinkSublistEntity {
        val sublist = drinkSublistRepository.findById(sublistId).orElseThrow {
            ResourceNotFoundException(Msg("error.sublist.notFound", sublistId), ErrorCode.NOT_FOUND)
        }
        if (!isBoardOrAdmin(caller, principal) && sublist.createdBy?.id != caller.id) {
            throw AccessDeniedException(
                Msg("error.eventDrink.sublistAssignDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
        return sublist
    }

    /** Owner-Rechte gelten ausschließlich für eigene Events; Vorstand/Admin moderieren fremde Events. */
    private fun requireManage(caller: UserEntity, principal: UserPrincipal, event: EventEntity) {
        if (!isBoardOrAdmin(caller, principal) && event.owner?.id != caller.id) {
            throw AccessDeniedException(
                Msg("error.eventDrink.manageDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    private fun canViewEvent(caller: UserEntity, principal: UserPrincipal, event: EventEntity): Boolean {
        if (isBoardOrAdmin(caller, principal)) return true
        if (event.owner?.id == caller.id) return true
        return eventParticipantRepository.findByEventIdAndUserId(event.id, caller.id).isPresent
    }

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.has(principal, caller, Permission.EVENT_MANAGE)


    private fun normalizeCurrency(value: String?): String? {
        val trimmed = value?.trim()
        if (trimmed.isNullOrBlank()) return null
        return trimmed.uppercase()
    }

    private fun parseId(value: String?, field: String): UUID {
        val trimmed = value?.trim()
        if (trimmed.isNullOrEmpty()) {
            throw InvalidRequestException(Msg("error.field.blank", field), ErrorCode.INVALID_REQUEST)
        }
        return try {
            UUID.fromString(trimmed)
        } catch (_: IllegalArgumentException) {
            throw InvalidRequestException(
                Msg("error.field.invalidUuid", field, trimmed),
                ErrorCode.INVALID_REQUEST
            )
        }
    }

    private fun toDto(eventDrink: EventDrinkEntity): EventDrinkDto {
        val drink: DrinkCatalogEntity? = eventDrink.drink
        val costPrice = eventDrink.costPrice
        val effectiveCost = costPrice ?: drink?.costPrice ?: java.math.BigDecimal.ZERO
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
            updatedAt = eventDrink.updatedAt
        )
    }
}
