package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventFoodEntity
import de.maurer.baseservice.domain.FoodCatalogEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AddEventFoodRequest
import de.maurer.baseservice.dto.EventFoodDto
import de.maurer.baseservice.dto.UpdateEventFoodRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.EventFoodRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.FoodCatalogRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.util.UUID

/**
 * Fachlicher Service für das eventbezogene Speisenangebot mit Preisauflösung und Fallback.
 */
@Service
@Transactional
class EventFoodService(
    private val eventFoodRepository: EventFoodRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val foodCatalogRepository: FoodCatalogRepository,
    private val access: StammtischAccess,
    private val userService: UserService
) {

    @Transactional(readOnly = true)
    fun listEventFood(eventId: UUID, principal: UserPrincipal): List<EventFoodDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        if (!canViewEvent(caller, principal, event)) {
            throw AccessDeniedException(
                Msg("error.eventFood.viewDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
        return eventFoodRepository.findByEventId(eventId)
            .sortedBy { it.food?.name.orEmpty() }
            .map { toDto(it) }
    }

    fun addEventFood(eventId: UUID, request: AddEventFoodRequest, principal: UserPrincipal): EventFoodDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val foodId = parseId(request.foodId, "foodId")
        val food = requireFood(foodId)

        if (eventFoodRepository.findByEventIdAndFoodId(eventId, food.id).isPresent) {
            throw InvalidRequestException(
                Msg("error.eventFood.alreadyAdded"),
                ErrorCode.INVALID_REQUEST
            )
        }

        val price = request.price
        if (price != null && price.signum() < 0) {
            throw InvalidRequestException(Msg("error.field.negative", "price"), ErrorCode.INVALID_REQUEST)
        }
        val costPrice = request.costPrice
        if (costPrice != null && costPrice.signum() < 0) {
            throw InvalidRequestException(Msg("error.field.negative", "costPrice"), ErrorCode.INVALID_REQUEST)
        }

        val eventFood = EventFoodEntity(
            event = event,
            food = food,
            price = price,
            costPrice = costPrice,
            currency = normalizeCurrency(request.currency) ?: food.currency,
            selfServiceEnabled = request.selfServiceEnabled ?: true,
            tabletEnabled = request.tabletEnabled ?: true
        )
        val saved = eventFoodRepository.save(eventFood)
        return toDto(saved)
    }

    fun updateEventFood(
        eventId: UUID,
        eventFoodId: UUID,
        request: UpdateEventFoodRequest,
        principal: UserPrincipal
    ): EventFoodDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val eventFood = requireEventFood(eventId, eventFoodId)

        if (request.price != null) {
            if (request.price.signum() < 0) {
                throw InvalidRequestException(Msg("error.field.negative", "price"), ErrorCode.INVALID_REQUEST)
            }
            eventFood.price = request.price
        }
        if (request.costPrice != null) {
            if (request.costPrice.signum() < 0) {
                throw InvalidRequestException(Msg("error.field.negative", "costPrice"), ErrorCode.INVALID_REQUEST)
            }
            eventFood.costPrice = request.costPrice
        }
        normalizeCurrency(request.currency)?.let { eventFood.currency = it }
        request.selfServiceEnabled?.let { eventFood.selfServiceEnabled = it }
        request.tabletEnabled?.let { eventFood.tabletEnabled = it }

        val saved = eventFoodRepository.save(eventFood)
        return toDto(saved)
    }

    fun removeEventFood(eventId: UUID, eventFoodId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val eventFood = requireEventFood(eventId, eventFoodId)
        eventFoodRepository.delete(eventFood)
    }

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", id), ErrorCode.NOT_FOUND)
        }

    private fun requireFood(id: UUID): FoodCatalogEntity =
        foodCatalogRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.food.notFound", id), ErrorCode.NOT_FOUND)
        }

    private fun requireEventFood(eventId: UUID, eventFoodId: UUID): EventFoodEntity {
        val entity = eventFoodRepository.findById(eventFoodId).orElseThrow {
            ResourceNotFoundException(Msg("error.eventFood.notFound", eventFoodId), ErrorCode.NOT_FOUND)
        }
        if (entity.event?.id != eventId) {
            throw ResourceNotFoundException(
                Msg("error.eventFood.wrongEvent", eventFoodId, eventId),
                ErrorCode.NOT_FOUND
            )
        }
        return entity
    }

    private fun requireManage(caller: UserEntity, principal: UserPrincipal, event: EventEntity) {
        if (!isBoardOrAdmin(caller, principal) && event.owner?.id != caller.id) {
            throw AccessDeniedException(
                Msg("error.eventFood.manageDenied"),
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

    private fun toDto(eventFood: EventFoodEntity): EventFoodDto {
        val food: FoodCatalogEntity? = eventFood.food
        val price = eventFood.price
        val effectivePrice = price ?: food?.defaultPrice ?: BigDecimal.ZERO
        val costPrice = eventFood.costPrice
        val effectiveCostPrice = costPrice ?: food?.costPrice ?: BigDecimal.ZERO

        return EventFoodDto(
            id = eventFood.id.toString(),
            eventId = eventFood.event?.id?.toString().orEmpty(),
            foodId = food?.id?.toString().orEmpty(),
            foodName = food?.name.orEmpty(),
            price = price,
            effectivePrice = effectivePrice,
            costPrice = costPrice,
            effectiveCostPrice = effectiveCostPrice,
            currency = eventFood.currency,
            selfServiceEnabled = eventFood.selfServiceEnabled,
            tabletEnabled = eventFood.tabletEnabled,
            createdAt = eventFood.createdAt,
            updatedAt = eventFood.updatedAt
        )
    }
}
