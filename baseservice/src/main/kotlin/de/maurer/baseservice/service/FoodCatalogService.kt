package de.maurer.baseservice.service

import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.domain.FoodCatalogEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateFoodRequest
import de.maurer.baseservice.dto.FoodDto
import de.maurer.baseservice.dto.FoodSummaryDto
import de.maurer.baseservice.dto.UpdateFoodRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.FoodCatalogRepository
import de.maurer.baseservice.security.UserPrincipal
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.util.UUID

/**
 * Fachlicher Service für den globalen Speisenkatalog auf Vereinsebene.
 */
@Service
@Transactional
class FoodCatalogService(
    private val foodCatalogRepository: FoodCatalogRepository,
    private val access: StammtischAccess,
    private val userService: UserService
) {

    @Transactional(readOnly = true)
    fun listFoods(principal: UserPrincipal, activeOnly: Boolean?): List<FoodSummaryDto> {
        val caller = userService.getOrCreateUser(principal)
        val privileged = isBoardOrAdmin(caller, principal)

        val foods = when {
            privileged && activeOnly == false -> foodCatalogRepository.findAllByOrderByNameAsc()
            privileged && activeOnly == true -> foodCatalogRepository.findByActiveTrueOrderByNameAsc()
            privileged -> foodCatalogRepository.findAllByOrderByNameAsc()
            else -> foodCatalogRepository.findByActiveTrueOrderByNameAsc()
        }

        return foods.map { toSummaryDto(it) }
    }

    @Transactional(readOnly = true)
    fun getFood(id: UUID, principal: UserPrincipal): FoodDto {
        val caller = userService.getOrCreateUser(principal)
        val food = requireFood(id)
        if (!food.active && !isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(
                Msg("error.food.inactiveViewDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
        return toFoodDto(food)
    }

    fun createFood(request: CreateFoodRequest, principal: UserPrincipal): FoodDto {
        val caller = userService.getOrCreateUser(principal)
        if (!isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(
                Msg("error.food.createDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }

        val name = normalizeName(request.name)
        if (name.isBlank()) {
            throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
        }
        val defaultPrice = request.defaultPrice
            ?: throw InvalidRequestException(Msg("error.field.required", "defaultPrice"), ErrorCode.INVALID_REQUEST)
        if (defaultPrice.signum() < 0) {
            throw InvalidRequestException(Msg("error.field.negative", "defaultPrice"), ErrorCode.INVALID_REQUEST)
        }
        val costPrice = request.costPrice ?: BigDecimal.ZERO
        if (costPrice.signum() < 0) {
            throw InvalidRequestException(Msg("error.field.negative", "costPrice"), ErrorCode.INVALID_REQUEST)
        }

        val food = FoodCatalogEntity(
            name = name,
            description = request.description?.trim()?.ifBlank { null },
            category = request.category?.trim()?.ifBlank { null },
            defaultPrice = defaultPrice,
            costPrice = costPrice,
            currency = normalizeCurrency(request.currency),
            active = true,
            createdBy = caller
        )
        val saved = foodCatalogRepository.save(food)
        return toFoodDto(saved)
    }

    fun updateFood(id: UUID, request: UpdateFoodRequest, principal: UserPrincipal): FoodDto {
        val caller = userService.getOrCreateUser(principal)
        if (!isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(
                Msg("error.food.updateDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }

        val food = requireFood(id)

        if (request.name != null) {
            val name = normalizeName(request.name)
            if (name.isBlank()) {
                throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
            }
            food.name = name
        }
        if (request.description != null) {
            food.description = request.description.trim().ifBlank { null }
        }
        if (request.category != null) {
            food.category = request.category.trim().ifBlank { null }
        }
        if (request.defaultPrice != null) {
            if (request.defaultPrice.signum() < 0) {
                throw InvalidRequestException(Msg("error.field.negative", "defaultPrice"), ErrorCode.INVALID_REQUEST)
            }
            food.defaultPrice = request.defaultPrice
        }
        if (request.costPrice != null) {
            if (request.costPrice.signum() < 0) {
                throw InvalidRequestException(Msg("error.field.negative", "costPrice"), ErrorCode.INVALID_REQUEST)
            }
            food.costPrice = request.costPrice
        }
        if (request.currency != null) {
            food.currency = normalizeCurrency(request.currency)
        }
        if (request.active != null) {
            food.active = request.active
        }

        val saved = foodCatalogRepository.save(food)
        return toFoodDto(saved)
    }

    private fun requireFood(id: UUID): FoodCatalogEntity =
        foodCatalogRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.food.notFound", id), ErrorCode.NOT_FOUND)
        }

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.has(principal, caller, Permission.CATALOG_APPROVE)


    private fun normalizeName(value: String?): String =
        value?.trim()?.replace(WHITESPACE_REGEX, " ").orEmpty()

    private fun normalizeCurrency(value: String?): String {
        val trimmed = value?.trim()
        if (trimmed.isNullOrBlank()) return DEFAULT_CURRENCY
        return trimmed.uppercase()
    }

    private fun toFoodDto(food: FoodCatalogEntity): FoodDto =
        FoodDto(
            id = food.id.toString(),
            name = food.name,
            description = food.description,
            category = food.category,
            defaultPrice = food.defaultPrice,
            costPrice = food.costPrice,
            currency = food.currency,
            active = food.active,
            createdById = food.createdBy?.id?.toString(),
            createdAt = food.createdAt,
            updatedAt = food.updatedAt
        )

    private fun toSummaryDto(food: FoodCatalogEntity): FoodSummaryDto =
        FoodSummaryDto(
            id = food.id.toString(),
            name = food.name,
            category = food.category,
            defaultPrice = food.defaultPrice,
            costPrice = food.costPrice,
            currency = food.currency,
            active = food.active
        )

    companion object {
        const val DEFAULT_CURRENCY = "EUR"
        private val WHITESPACE_REGEX = Regex("\\s+")
    }
}
