package de.maurer.baseservice.service

import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.DrinkSublistEntity
import de.maurer.baseservice.domain.DrinkSublistItemEntity
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
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Fachlicher Slice für wiederverwendbare Getränke-Sublists (TICKET-013).
 *
 * Sublists sind Vorlagen, die eine Auswahl globaler (freigegebener) Getränke
 * mit optionalem Vorschlagspreis bündeln. Sie können mehrfach auf eigene Events
 * angewendet werden ([EventDrinkService.assignSublist]); dabei werden die
 * Einträge in die Eventauswahl kopiert, spätere Vorlagenänderungen wirken nicht
 * rückwirkend (siehe `docs/domains/drink-catalog-and-sublists.md`).
 *
 * Alle Berechtigungen werden serverseitig geprüft; jeder Aufruf folgt dem
 * Prinzip `deny by default`. Eine Sublist verwaltet ausschließlich ihr Ersteller
 * sowie Vorstand und Administration.
 */
@Service
@Transactional
class DrinkSublistService(
    private val drinkSublistRepository: DrinkSublistRepository,
    private val drinkSublistItemRepository: DrinkSublistItemRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val access: StammtischAccess,
    private val userService: UserService
) {

    @Transactional(readOnly = true)
    fun listSublists(principal: UserPrincipal): List<SublistSummaryDto> {
        val caller = userService.getOrCreateUser(principal)
        val sublists = if (isBoardOrAdmin(caller, principal)) {
            drinkSublistRepository.findAllByOrderByNameAsc()
        } else {
            drinkSublistRepository.findByCreatedById(caller.id).sortedBy { it.name }
        }
        return sublists.map { toSummaryDto(it) }
    }

    @Transactional(readOnly = true)
    fun getSublist(id: UUID, principal: UserPrincipal): SublistDto {
        val caller = userService.getOrCreateUser(principal)
        val sublist = requireSublist(id)
        requireManage(caller, principal, sublist)
        return toSublistDto(sublist)
    }

    fun createSublist(request: CreateSublistRequest, principal: UserPrincipal): SublistDto {
        val caller = userService.getOrCreateUser(principal)
        if (!canCreate(caller, principal)) {
            throw AccessDeniedException(
                Msg("error.sublist.createDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
        val name = request.name?.trim().orEmpty()
        if (name.isBlank()) {
            throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
        }
        val sublist = DrinkSublistEntity(
            name = name,
            description = request.description?.trim()?.ifBlank { null },
            createdBy = caller
        )
        val saved = drinkSublistRepository.save(sublist)
        return toSublistDto(saved)
    }

    fun updateSublist(id: UUID, request: UpdateSublistRequest, principal: UserPrincipal): SublistDto {
        val caller = userService.getOrCreateUser(principal)
        val sublist = requireSublist(id)
        requireManage(caller, principal, sublist)

        if (request.name != null) {
            val name = request.name.trim()
            if (name.isBlank()) {
                throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
            }
            sublist.name = name
        }
        if (request.description != null) {
            sublist.description = request.description.trim().ifBlank { null }
        }
        val saved = drinkSublistRepository.save(sublist)
        return toSublistDto(saved)
    }

    fun deleteSublist(id: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val sublist = requireSublist(id)
        requireManage(caller, principal, sublist)
        drinkSublistRepository.delete(sublist)
    }

    fun addItem(id: UUID, request: AddSublistItemRequest, principal: UserPrincipal): SublistItemDto {
        val caller = userService.getOrCreateUser(principal)
        val sublist = requireSublist(id)
        requireManage(caller, principal, sublist)

        val drinkId = parseId(request.drinkId, "drinkId")
        val drink = drinkCatalogRepository.findById(drinkId).orElseThrow {
            ResourceNotFoundException(Msg("error.drink.notFound", drinkId), ErrorCode.NOT_FOUND)
        }
        // Nur freigegebene globale Stammdaten dürfen in eine Vorlage aufgenommen werden.
        if (drink.status != DrinkStatus.approved) {
            throw InvalidRequestException(
                Msg("error.sublist.drinkNotApproved"),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (drinkSublistItemRepository.findBySublistIdAndDrinkId(sublist.id, drink.id).isPresent) {
            throw InvalidRequestException(
                Msg("error.sublist.drinkAlreadyAdded"),
                ErrorCode.INVALID_REQUEST
            )
        }
        val price = request.defaultPrice
        if (price != null && price.signum() < 0) {
            throw InvalidRequestException(Msg("error.field.negative", "defaultPrice"), ErrorCode.INVALID_REQUEST)
        }
        val item = DrinkSublistItemEntity(
            sublist = sublist,
            drink = drink,
            defaultPrice = price
        )
        val saved = drinkSublistItemRepository.save(item)
        return toItemDto(saved)
    }

    fun removeItem(id: UUID, itemId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val sublist = requireSublist(id)
        requireManage(caller, principal, sublist)

        val item = drinkSublistItemRepository.findById(itemId).orElseThrow {
            ResourceNotFoundException(Msg("error.sublist.itemNotFound", itemId), ErrorCode.NOT_FOUND)
        }
        if (item.sublist?.id != sublist.id) {
            throw ResourceNotFoundException(
                Msg("error.sublist.itemNotInSublist", itemId),
                ErrorCode.NOT_FOUND
            )
        }
        drinkSublistItemRepository.delete(item)
    }

    private fun requireSublist(id: UUID): DrinkSublistEntity =
        drinkSublistRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.sublist.notFound", id), ErrorCode.NOT_FOUND)
        }

    /** Verwalten und Einsehen darf ausschließlich der Ersteller sowie Vorstand/Admin. */
    private fun requireManage(caller: UserEntity, principal: UserPrincipal, sublist: DrinkSublistEntity) {
        if (!isBoardOrAdmin(caller, principal) && sublist.createdBy?.id != caller.id) {
            throw AccessDeniedException(
                Msg("error.sublist.manageDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    private fun canCreate(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.isMember(principal, caller)

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.has(principal, caller, Permission.CATALOG_APPROVE)


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

    private fun toSublistDto(sublist: DrinkSublistEntity): SublistDto {
        val items = drinkSublistItemRepository.findBySublistId(sublist.id)
            .sortedBy { it.drink?.name.orEmpty() }
            .map { toItemDto(it) }
        return SublistDto(
            id = sublist.id.toString(),
            name = sublist.name,
            description = sublist.description,
            createdById = sublist.createdBy?.id?.toString(),
            items = items,
            createdAt = sublist.createdAt,
            updatedAt = sublist.updatedAt
        )
    }

    private fun toSummaryDto(sublist: DrinkSublistEntity): SublistSummaryDto =
        SublistSummaryDto(
            id = sublist.id.toString(),
            name = sublist.name,
            description = sublist.description,
            itemCount = drinkSublistItemRepository.countBySublistId(sublist.id).toInt()
        )

    private fun toItemDto(item: DrinkSublistItemEntity): SublistItemDto {
        val drink: DrinkCatalogEntity? = item.drink
        return SublistItemDto(
            id = item.id.toString(),
            drinkId = drink?.id?.toString().orEmpty(),
            drinkName = drink?.name.orEmpty(),
            defaultPrice = item.defaultPrice
        )
    }
}
