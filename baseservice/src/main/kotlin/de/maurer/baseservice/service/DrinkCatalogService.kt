package de.maurer.baseservice.service

import de.maurer.baseservice.domain.DrinkBarcodeEntity
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkBarcodeRepository
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.DrinkLibraryRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.Identifiers
import de.maurer.baseservice.tenancy.StammtischAccess
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.util.UUID

/**
 * Fachlicher Slice für den globalen Getränkekatalog und Barcodes (TICKET-012).
 *
 * Der Katalog ist global; Events referenzieren später eine eigene Auswahl
 * (TICKET-013). Neue Getränke werden vorgeschlagen (`proposed`) und ausschließlich
 * durch Vorstand und Administration freigegeben (`approved`) oder abgelehnt
 * (`rejected`). Alle Berechtigungen werden serverseitig geprüft; jeder Aufruf
 * folgt dem Prinzip `deny by default` (siehe `docs/fachkonzept.md`).
 */
@Service
@Transactional
class DrinkCatalogService(
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val drinkBarcodeRepository: DrinkBarcodeRepository,
    private val drinkLibraryRepository: DrinkLibraryRepository,
    private val access: StammtischAccess,
    private val userService: UserService
) {

    @Transactional(readOnly = true)
    fun listDrinks(principal: UserPrincipal, status: String?): List<DrinkSummaryDto> {
        val caller = userService.getOrCreateUser(principal)
        val privileged = isBoardOrAdmin(caller, principal)
        val requested = status?.let {
            DrinkStatus.fromValue(it)
                ?: throw InvalidRequestException(Msg("error.drink.invalidStatusFilter", it), ErrorCode.INVALID_REQUEST)
        }

        val drinks = when {
            privileged && requested != null -> drinkCatalogRepository.findByStatusOrderByNameAsc(requested)
            privileged -> drinkCatalogRepository.findAllByOrderByNameAsc()
            requested != null && requested != DrinkStatus.approved -> throw AccessDeniedException(
                Msg("error.drink.unapprovedViewDenied"),
                ErrorCode.ACCESS_DENIED
            )
            else -> drinkCatalogRepository.findByStatusOrderByNameAsc(DrinkStatus.approved)
        }

        return drinks.map { toSummaryDto(it) }
    }

    @Transactional(readOnly = true)
    fun getDrink(id: UUID, principal: UserPrincipal): DrinkDto {
        val caller = userService.getOrCreateUser(principal)
        val drink = requireDrink(id)
        if (!canViewDrink(caller, principal, drink)) {
            throw AccessDeniedException(
                Msg("error.drink.viewDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
        return toDrinkDto(drink)
    }

    @Transactional(readOnly = true)
    fun getDrinkByBarcode(barcode: String, principal: UserPrincipal): DrinkDto {
        val caller = userService.getOrCreateUser(principal)
        val normalized = normalizeBarcode(barcode)
        val barcodeEntity = drinkBarcodeRepository.findByBarcode(normalized)
            .filter { it.active }
            .orElseThrow { ResourceNotFoundException(Msg("error.drink.barcodeNotFound", normalized), ErrorCode.NOT_FOUND) }
        val drink = barcodeEntity.drink
            ?: throw ResourceNotFoundException(Msg("error.drink.barcodeNotFound", normalized), ErrorCode.NOT_FOUND)
        // Nicht freigegebene Getränke werden Unbeteiligten nicht offengelegt.
        if (!canViewDrink(caller, principal, drink)) {
            throw ResourceNotFoundException(Msg("error.drink.barcodeNotFound", normalized), ErrorCode.NOT_FOUND)
        }
        return toDrinkDto(drink)
    }

    fun proposeDrink(request: ProposeDrinkRequest, principal: UserPrincipal): DrinkDto {
        val caller = userService.getOrCreateUser(principal)
        if (!canPropose(caller, principal)) {
            throw AccessDeniedException(
                Msg("error.drink.proposeDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }

        val name = normalizeName(request.name)
        if (name.isBlank()) {
            throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
        }
        val price = request.defaultPrice
            ?: throw InvalidRequestException(Msg("error.field.required", "defaultPrice"), ErrorCode.INVALID_REQUEST)
        if (price.signum() < 0) {
            throw InvalidRequestException(Msg("error.field.negative", "defaultPrice"), ErrorCode.INVALID_REQUEST)
        }

        // Übernahme aus der gemeinsamen Getränkedatenbank: nur die Herkunft merken.
        val libraryDrinkId = request.libraryDrinkId?.trim()?.takeIf { it.isNotEmpty() }?.let { value ->
            val id = Identifiers.parseUuid(value, "libraryDrinkId")
            if (!drinkLibraryRepository.existsById(id)) {
                throw ResourceNotFoundException(Msg("error.drinkLibrary.notFound", id), ErrorCode.NOT_FOUND)
            }
            id
        }

        // Barcodes vor dem Speichern prüfen, damit ein belegter Code kein halb angelegtes Getränk hinterlässt.
        val barcodes = request.barcodes.orEmpty().map { normalizeBarcode(it) }.distinct()
        barcodes.forEach { requireBarcodeAvailable(it) }

        // Vorstand und Administration geben ihre eigenen Einträge nicht noch einmal frei.
        val privileged = isBoardOrAdmin(caller, principal)
        val drink = DrinkCatalogEntity(
            name = name,
            description = request.description?.trim()?.ifBlank { null },
            category = request.category?.trim()?.ifBlank { null },
            defaultPrice = price,
            costPrice = request.costPrice ?: BigDecimal.ZERO,
            currency = normalizeCurrency(request.currency),
            imageReference = request.imageReference?.trim()?.ifBlank { null },
            libraryDrinkId = libraryDrinkId,
            catalogVersion = 1,
            active = privileged,
            status = if (privileged) DrinkStatus.approved else DrinkStatus.proposed,
            proposedBy = caller,
            approvedBy = if (privileged) caller else null
        )
        val saved = drinkCatalogRepository.save(drink)

        barcodes.forEach { normalized ->
            drinkBarcodeRepository.save(DrinkBarcodeEntity(drink = saved, barcode = normalized, active = true))
        }

        return toDrinkDto(saved)
    }

    fun updateDrink(id: UUID, request: UpdateDrinkRequest, principal: UserPrincipal): DrinkDto {
        val caller = userService.getOrCreateUser(principal)
        val drink = requireDrink(id)
        val privileged = isBoardOrAdmin(caller, principal)
        requireManage(caller, drink, privileged)

        var snapshotRelevantChanged = false
        if (applyDrinkDetails(drink, request)) {
            snapshotRelevantChanged = true
        }
        if (applyDrinkPricing(drink, request)) {
            snapshotRelevantChanged = true
        }
        if (request.currency != null) {
            drink.currency = normalizeCurrency(request.currency)
        }
        if (request.active != null) {
            // Aktiv-/Inaktiv-Schaltung freigegebener Stammdaten ist Vorstand/Admin vorbehalten.
            if (!privileged) {
                throw AccessDeniedException(
                    Msg("error.drink.activeChangeDenied"),
                    ErrorCode.ACCESS_DENIED
                )
            }
            drink.active = request.active
        }

        // Katalogversion nur für bereits freigegebene Stammdaten fortschreiben, damit
        // historische Event-Snapshots (TICKET-013/016) die Änderung erkennen können.
        if (drink.status == DrinkStatus.approved && snapshotRelevantChanged) {
            drink.catalogVersion += 1
        }

        val saved = drinkCatalogRepository.save(drink)
        return toDrinkDto(saved)
    }

    private fun applyDrinkDetails(drink: DrinkCatalogEntity, request: UpdateDrinkRequest): Boolean {
        var changed = false
        if (request.name != null) {
            val name = normalizeName(request.name)
            if (name.isBlank()) {
                throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
            }
            if (name != drink.name) changed = true
            drink.name = name
        }
        if (request.description != null) {
            drink.description = request.description.trim().ifBlank { null }
        }
        if (request.category != null) {
            drink.category = request.category.trim().ifBlank { null }
        }
        if (request.imageReference != null) {
            val image = request.imageReference.trim().ifBlank { null }
            if (image != drink.imageReference) changed = true
            drink.imageReference = image
        }
        return changed
    }

    private fun applyDrinkPricing(drink: DrinkCatalogEntity, request: UpdateDrinkRequest): Boolean {
        var changed = false
        if (request.defaultPrice != null) {
            if (request.defaultPrice.signum() < 0) {
                throw InvalidRequestException(Msg("error.field.negative", "defaultPrice"), ErrorCode.INVALID_REQUEST)
            }
            if (request.defaultPrice.compareTo(drink.defaultPrice) != 0) changed = true
            drink.defaultPrice = request.defaultPrice
        }
        if (request.costPrice != null) {
            if (request.costPrice.signum() < 0) {
                throw InvalidRequestException(Msg("error.field.negative", "costPrice"), ErrorCode.INVALID_REQUEST)
            }
            if (request.costPrice.compareTo(drink.costPrice) != 0) changed = true
            drink.costPrice = request.costPrice
        }
        return changed
    }

    fun approveDrink(id: UUID, principal: UserPrincipal): DrinkDto {
        val caller = userService.getOrCreateUser(principal)
        requireBoardOrAdmin(caller, principal)
        val drink = requireDrink(id)

        drink.status = DrinkStatus.approved
        drink.approvedBy = caller
        drink.active = true
        val saved = drinkCatalogRepository.save(drink)
        return toDrinkDto(saved)
    }

    fun rejectDrink(id: UUID, principal: UserPrincipal): DrinkDto {
        val caller = userService.getOrCreateUser(principal)
        requireBoardOrAdmin(caller, principal)
        val drink = requireDrink(id)

        drink.status = DrinkStatus.rejected
        drink.approvedBy = caller
        drink.active = false
        val saved = drinkCatalogRepository.save(drink)
        return toDrinkDto(saved)
    }

    fun addBarcode(id: UUID, request: AddBarcodeRequest, principal: UserPrincipal): DrinkBarcodeDto {
        val caller = userService.getOrCreateUser(principal)
        val drink = requireDrink(id)
        requireManage(caller, drink, isBoardOrAdmin(caller, principal))

        val normalized = normalizeBarcode(request.barcode)
        requireBarcodeAvailable(normalized)

        val saved = drinkBarcodeRepository.save(
            DrinkBarcodeEntity(drink = drink, barcode = normalized, active = true)
        )
        return toBarcodeDto(saved)
    }

    fun removeBarcode(id: UUID, barcodeId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val drink = requireDrink(id)
        requireManage(caller, drink, isBoardOrAdmin(caller, principal))

        val barcode = drinkBarcodeRepository.findById(barcodeId).orElseThrow {
            ResourceNotFoundException(Msg("error.drink.barcodeIdNotFound", barcodeId), ErrorCode.NOT_FOUND)
        }
        if (barcode.drink?.id != drink.id) {
            throw ResourceNotFoundException(
                Msg("error.drink.barcodeNotAssigned", barcodeId),
                ErrorCode.NOT_FOUND
            )
        }
        drinkBarcodeRepository.delete(barcode)
    }

    private fun requireDrink(id: UUID): DrinkCatalogEntity =
        drinkCatalogRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.drink.notFound", id), ErrorCode.NOT_FOUND)
        }

    private fun requireBarcodeAvailable(barcode: String) {
        if (drinkBarcodeRepository.findByBarcode(barcode).isPresent) {
            throw InvalidRequestException(
                Msg("error.drink.barcodeTaken", barcode),
                ErrorCode.INVALID_REQUEST
            )
        }
    }

    /**
     * Verwalten darf, wer Vorstand/Admin ist; der Vorschlagende darf zusätzlich
     * das eigene, noch nicht freigegebene Getränk bearbeiten.
     */
    private fun requireManage(
        caller: UserEntity,
        drink: DrinkCatalogEntity,
        privileged: Boolean
    ) {
        val ownProposal = drink.status == DrinkStatus.proposed && drink.proposedBy?.id == caller.id
        if (!privileged && !ownProposal) {
            throw AccessDeniedException(
                Msg("error.drink.approvedChangeDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    private fun requireBoardOrAdmin(caller: UserEntity, principal: UserPrincipal) {
        if (!isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(
                Msg("error.drink.reviewDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    private fun canViewDrink(caller: UserEntity, principal: UserPrincipal, drink: DrinkCatalogEntity): Boolean {
        if (drink.status == DrinkStatus.approved) return true
        if (isBoardOrAdmin(caller, principal)) return true
        return drink.proposedBy?.id == caller.id
    }

    private fun canPropose(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.has(principal, caller, Permission.CATALOG_PROPOSE)

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.has(principal, caller, Permission.CATALOG_APPROVE)


    private fun normalizeName(value: String?): String =
        value?.trim()?.replace(WHITESPACE_REGEX, " ").orEmpty()

    private fun normalizeCurrency(value: String?): String {
        val trimmed = value?.trim()
        if (trimmed.isNullOrBlank()) return DEFAULT_CURRENCY
        return trimmed.uppercase()
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

    private fun toDrinkDto(drink: DrinkCatalogEntity): DrinkDto {
        val barcodes = drinkBarcodeRepository.findByDrinkId(drink.id)
            .sortedBy { it.barcode }
            .map { toBarcodeDto(it) }
        return DrinkDto(
            id = drink.id.toString(),
            name = drink.name,
            description = drink.description,
            category = drink.category,
            defaultPrice = drink.defaultPrice,
            costPrice = drink.costPrice,
            currency = drink.currency,
            imageReference = drink.imageReference,
            catalogVersion = drink.catalogVersion,
            status = drink.status.name,
            active = drink.active,
            proposedById = drink.proposedBy?.id?.toString(),
            approvedById = drink.approvedBy?.id?.toString(),
            barcodes = barcodes,
            createdAt = drink.createdAt,
            updatedAt = drink.updatedAt,
            libraryDrinkId = drink.libraryDrinkId?.toString()
        )
    }

    private fun toSummaryDto(drink: DrinkCatalogEntity): DrinkSummaryDto =
        DrinkSummaryDto(
            id = drink.id.toString(),
            name = drink.name,
            category = drink.category,
            defaultPrice = drink.defaultPrice,
            costPrice = drink.costPrice,
            currency = drink.currency,
            status = drink.status.name,
            active = drink.active,
            catalogVersion = drink.catalogVersion
        )

    private fun toBarcodeDto(barcode: DrinkBarcodeEntity): DrinkBarcodeDto =
        DrinkBarcodeDto(
            id = barcode.id.toString(),
            barcode = barcode.barcode,
            active = barcode.active
        )

    companion object {
        const val DEFAULT_CURRENCY = "EUR"
        const val MAX_BARCODE_LENGTH = 128
        private val WHITESPACE_REGEX = Regex("\\s+")
    }
}
