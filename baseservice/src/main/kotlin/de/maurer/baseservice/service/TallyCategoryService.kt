package de.maurer.baseservice.service

import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.TallyCategoryEntity
import de.maurer.baseservice.dto.CreateTallyCategoryRequest
import de.maurer.baseservice.dto.ReorderTallyCategoriesRequest
import de.maurer.baseservice.dto.TallyCategoryDrinkDto
import de.maurer.baseservice.dto.TallyCategoryDto
import de.maurer.baseservice.dto.UpdateTallyCategoryRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.TallyCategoryRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.Identifiers
import de.maurer.baseservice.tenancy.StammtischAccess
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.util.UUID

/**
 * Strich-Kategorien der Gruppe (Issue #80): die Spalten der Strichliste am
 * Thekenterminal mit ihrem Preis je Strich.
 *
 * Lesen dürfen alle, die den Katalog sehen oder am Terminal buchen; anlegen,
 * ändern, sortieren und löschen nur, wer den Katalog pflegt
 * (`catalog.approve`). Gelöschte Kategorien werden archiviert, ihre Getränke
 * fallen auf „Ohne“ zurück; Buchungen behalten den Verweis.
 */
@Service
@Transactional
class TallyCategoryService(
    private val tallyCategoryRepository: TallyCategoryRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val access: StammtischAccess,
    private val userService: UserService
) {

    @Transactional(readOnly = true)
    fun list(principal: UserPrincipal): List<TallyCategoryDto> {
        val caller = userService.getOrCreateUser(principal)
        if (!access.hasAny(
                principal,
                caller,
                Permission.CATALOG_PROPOSE,
                Permission.CATALOG_APPROVE,
                Permission.PURCHASE_TABLET
            )
        ) {
            throw AccessDeniedException(Msg("error.tallyCategory.viewDenied"), ErrorCode.ACCESS_DENIED)
        }
        val categories = activeCategories()
        val drinks = drinkCatalogRepository.findAllByOrderByNameAsc()
            .filter { it.status == DrinkStatus.approved && it.active && it.tallyCategory != null }
            .groupBy { it.tallyCategory!!.id }
        return categories.map { toDto(it, drinks[it.id].orEmpty()) }
    }

    fun create(request: CreateTallyCategoryRequest, principal: UserPrincipal): TallyCategoryDto {
        requireManage(principal)
        val name = normalizeName(request.name)
        val price = requirePrice(request.price)
        requireUniqueName(name, null)
        val nextOrder = (activeCategories().maxOfOrNull { it.sortOrder } ?: -1) + 1
        val saved = tallyCategoryRepository.save(
            TallyCategoryEntity(name = name, price = price, sortOrder = nextOrder)
        )
        return toDto(saved, emptyList())
    }

    fun update(id: UUID, request: UpdateTallyCategoryRequest, principal: UserPrincipal): TallyCategoryDto {
        requireManage(principal)
        val category = requireCategory(id)
        request.name?.let {
            val name = normalizeName(it)
            requireUniqueName(name, category.id)
            category.name = name
        }
        request.price?.let { category.price = requirePrice(it) }
        val saved = tallyCategoryRepository.save(category)
        return toDto(saved, drinksOf(saved))
    }

    /** Neue Reihenfolge = Spaltenreihenfolge am Terminal; fehlende Kategorien hängen hinten an. */
    fun reorder(request: ReorderTallyCategoriesRequest, principal: UserPrincipal): List<TallyCategoryDto> {
        requireManage(principal)
        val ids = request.ids.orEmpty().map { Identifiers.parseUuid(it, "ids") }.distinct()
        val categories = activeCategories()
        val byId = categories.associateBy { it.id }
        ids.forEach { if (it !in byId) throw notFound(it) }
        val ordered = ids.mapNotNull { byId[it] } + categories.filter { it.id !in ids }
        ordered.forEachIndexed { index, category -> category.sortOrder = index }
        tallyCategoryRepository.saveAll(ordered)
        return list(principal)
    }

    fun delete(id: UUID, principal: UserPrincipal) {
        requireManage(principal)
        val category = requireCategory(id)
        drinkCatalogRepository.findByTallyCategoryId(category.id).forEach {
            it.tallyCategory = null
            drinkCatalogRepository.save(it)
        }
        category.archived = true
        tallyCategoryRepository.save(category)
    }

    /**
     * Ordnet ein Getränk einer Kategorie zu (`""` bzw. blank = ohne Kategorie).
     * Wird aus [DrinkCatalogService] beim Speichern eines Getränks aufgerufen.
     */
    fun resolveForAssignment(value: String): TallyCategoryEntity? {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return null
        return requireCategory(Identifiers.parseUuid(trimmed, "tallyCategoryId"))
    }

    private fun activeCategories(): List<TallyCategoryEntity> =
        tallyCategoryRepository.findByArchivedFalseOrderBySortOrderAscNameAsc()

    private fun drinksOf(category: TallyCategoryEntity): List<DrinkCatalogEntity> =
        drinkCatalogRepository.findByTallyCategoryId(category.id)
            .filter { it.status == DrinkStatus.approved && it.active }
            .sortedBy { it.name.lowercase() }

    private fun requireCategory(id: UUID): TallyCategoryEntity =
        tallyCategoryRepository.findById(id).filter { !it.archived }.orElseThrow { notFound(id) }

    private fun notFound(id: UUID) =
        ResourceNotFoundException(Msg("error.tallyCategory.notFound", id), ErrorCode.NOT_FOUND)

    private fun requireManage(principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        if (!access.has(principal, caller, Permission.CATALOG_APPROVE)) {
            throw AccessDeniedException(Msg("error.tallyCategory.manageDenied"), ErrorCode.ACCESS_DENIED)
        }
    }

    private fun requireUniqueName(name: String, ownId: UUID?) {
        if (activeCategories().any { it.id != ownId && it.name.equals(name, ignoreCase = true) }) {
            throw InvalidRequestException(Msg("error.tallyCategory.nameTaken", name), ErrorCode.INVALID_REQUEST)
        }
    }

    private fun normalizeName(value: String?): String {
        val name = value?.trim()?.replace(WHITESPACE_REGEX, " ").orEmpty()
        if (name.isBlank()) {
            throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
        }
        if (name.length > MAX_NAME_LENGTH) {
            throw InvalidRequestException(Msg("error.field.tooLong", "name", MAX_NAME_LENGTH), ErrorCode.INVALID_REQUEST)
        }
        return name
    }

    private fun requirePrice(value: BigDecimal?): BigDecimal {
        val price = value ?: throw InvalidRequestException(Msg("error.field.required", "price"), ErrorCode.INVALID_REQUEST)
        if (price.signum() < 0) {
            throw InvalidRequestException(Msg("error.field.negative", "price"), ErrorCode.INVALID_REQUEST)
        }
        return price.setScale(2, java.math.RoundingMode.HALF_UP)
    }

    private fun toDto(category: TallyCategoryEntity, drinks: List<DrinkCatalogEntity>): TallyCategoryDto =
        TallyCategoryDto(
            id = category.id.toString(),
            name = category.name,
            price = category.price.setScale(2),
            currency = category.currency,
            sortOrder = category.sortOrder,
            drinks = drinks.map {
                TallyCategoryDrinkDto(
                    id = it.id.toString(),
                    name = it.name,
                    defaultPrice = it.defaultPrice,
                    currency = it.currency
                )
            }
        )

    companion object {
        const val MAX_NAME_LENGTH = 64
        private val WHITESPACE_REGEX = Regex("\\s+")
    }
}
