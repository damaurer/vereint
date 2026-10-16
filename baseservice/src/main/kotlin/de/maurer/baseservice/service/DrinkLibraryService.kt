package de.maurer.baseservice.service

import de.maurer.baseservice.domain.DrinkLibraryBarcodeEntity
import de.maurer.baseservice.domain.DrinkLibraryEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.dto.DrinkLibraryEntryDto
import de.maurer.baseservice.dto.SaveDrinkLibraryEntryRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkBarcodeRepository
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.DrinkLibraryBarcodeRepository
import de.maurer.baseservice.repository.DrinkLibraryRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Gemeinsame Getränkedatenbank.
 *
 * - Lesen: alle Angemeldeten. Im Stammtisch-Kontext zeigt jeder Eintrag, ob
 *   und als welches Getränk er im eigenen Katalog schon vorhanden ist.
 * - Übernehmen: über das normale Anlegen im Katalog mit `libraryDrinkId`
 *   (siehe [DrinkCatalogService.proposeDrink]); Preis und Sortiment legt der
 *   Stammtisch selbst fest.
 * - Teilen: ein freigegebenes Katalog-Getränk wird mit Name, Sorte,
 *   Beschreibung und Barcodes eingetragen (Katalogfreigabe im Stammtisch).
 *   Preise, Bilder und Personen verlassen den Stammtisch dabei nicht.
 * - Ändern und Löschen: nur die Plattform-Administration.
 */
@Service
@Transactional
class DrinkLibraryService(
    private val libraryRepository: DrinkLibraryRepository,
    private val libraryBarcodeRepository: DrinkLibraryBarcodeRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val drinkBarcodeRepository: DrinkBarcodeRepository,
    private val access: StammtischAccess,
    private val userService: UserService
) {

    @Transactional(readOnly = true)
    fun search(principal: UserPrincipal, query: String?, barcode: String?): List<DrinkLibraryEntryDto> {
        userService.getOrCreateUser(principal)
        val entries = when {
            !barcode.isNullOrBlank() ->
                libraryBarcodeRepository.findByBarcode(normalizeBarcode(barcode)).map { listOfNotNull(it.drink) }.orElse(emptyList())
            else -> libraryRepository.search(query?.trim().orEmpty().take(MAX_QUERY_LENGTH), PageRequest.of(0, MAX_RESULTS))
        }
        return toDtos(entries)
    }

    @Transactional(readOnly = true)
    fun get(id: UUID, principal: UserPrincipal): DrinkLibraryEntryDto {
        userService.getOrCreateUser(principal)
        return toDtos(listOf(requireEntry(id))).single()
    }

    /** Prüft beim Übernehmen in einen Katalog, dass der Eintrag existiert. */
    @Transactional(readOnly = true)
    fun requireExists(id: UUID) {
        requireEntry(id)
    }

    /**
     * Trägt ein freigegebenes Getränk des aktuellen Stammtischs in die
     * gemeinsame Datenbank ein. Gibt es dort schon einen Eintrag mit einem
     * seiner Barcodes, wird nur verknüpft.
     */
    fun shareFromCatalog(catalogDrinkId: UUID, principal: UserPrincipal): DrinkLibraryEntryDto {
        val caller = userService.getOrCreateUser(principal)
        access.require(principal, caller, Permission.CATALOG_APPROVE, Msg("error.drinkLibrary.shareDenied"))
        val drink = drinkCatalogRepository.findById(catalogDrinkId).orElseThrow {
            ResourceNotFoundException(Msg("error.drink.notFound", catalogDrinkId), ErrorCode.NOT_FOUND)
        }
        if (drink.status != DrinkStatus.approved) {
            throw InvalidRequestException(Msg("error.drinkLibrary.notApproved"), ErrorCode.INVALID_REQUEST)
        }
        drink.libraryDrinkId?.let { existing ->
            libraryRepository.findById(existing).orElse(null)?.let { return toDtos(listOf(it)).single() }
        }

        val barcodes = drinkBarcodeRepository.findByDrinkId(drink.id).filter { it.active }.map { it.barcode }.distinct()
        val known = libraryBarcodeRepository.findByBarcodeIn(barcodes)
        val entry = known.firstNotNullOfOrNull { it.drink } ?: run {
            val created = DrinkLibraryEntity(
                name = drink.name,
                description = drink.description,
                category = drink.category
            )
            barcodes.forEach { created.barcodes.add(DrinkLibraryBarcodeEntity(drink = created, barcode = it)) }
            libraryRepository.saveAndFlush(created)
        }
        drink.libraryDrinkId = entry.id
        drinkCatalogRepository.save(drink)
        return toDtos(listOf(entry)).single()
    }

    fun update(id: UUID, request: SaveDrinkLibraryEntryRequest, principal: UserPrincipal): DrinkLibraryEntryDto {
        requirePlatformAdmin(principal)
        val entry = requireEntry(id)
        request.name?.let {
            val name = it.trim()
            if (name.isBlank()) throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
            entry.name = name
        }
        request.description?.let { entry.description = it.trim().ifBlank { null } }
        request.category?.let { entry.category = it.trim().ifBlank { null } }
        request.barcodes?.let { values ->
            val barcodes = values.map { normalizeBarcode(it) }.distinct()
            libraryBarcodeRepository.findByBarcodeIn(barcodes).firstOrNull { it.drink?.id != entry.id }?.let {
                throw InvalidRequestException(Msg("error.drink.barcodeTaken", it.barcode), ErrorCode.INVALID_REQUEST)
            }
            entry.barcodes.removeIf { it.barcode !in barcodes }
            val present = entry.barcodes.map { it.barcode }.toSet()
            barcodes.filter { it !in present }.forEach { entry.barcodes.add(DrinkLibraryBarcodeEntity(drink = entry, barcode = it)) }
        }
        return toDtos(listOf(libraryRepository.saveAndFlush(entry))).single()
    }

    /** Entfernt einen Eintrag; Kataloge der Stammtische behalten ihre Kopie. */
    fun delete(id: UUID, principal: UserPrincipal) {
        requirePlatformAdmin(principal)
        libraryRepository.delete(requireEntry(id))
    }

    private fun toDtos(entries: List<DrinkLibraryEntity>): List<DrinkLibraryEntryDto> {
        if (entries.isEmpty()) return emptyList()
        val ids = entries.map { it.id }
        val barcodes = libraryBarcodeRepository.findByDrinkIdIn(ids).groupBy({ it.drink!!.id }, { it.barcode })
        // Nur im Stammtisch-Kontext: welche Einträge der eigene Katalog schon enthält.
        val adopted = if (TenantContext.stammtischId() != null) {
            drinkCatalogRepository.findByLibraryDrinkIdIn(ids).associate { it.libraryDrinkId to it.id }
        } else {
            emptyMap()
        }
        return entries.map { entry ->
            DrinkLibraryEntryDto(
                id = entry.id.toString(),
                name = entry.name,
                description = entry.description,
                category = entry.category,
                barcodes = barcodes[entry.id].orEmpty().sorted(),
                catalogDrinkId = adopted[entry.id]?.toString()
            )
        }
    }

    private fun requireEntry(id: UUID): DrinkLibraryEntity = libraryRepository.findById(id).orElseThrow {
        ResourceNotFoundException(Msg("error.drinkLibrary.notFound", id), ErrorCode.NOT_FOUND)
    }

    private fun requirePlatformAdmin(principal: UserPrincipal) {
        if (!principal.platformAdmin) {
            throw AccessDeniedException(Msg("error.stammtisch.platformAdminRequired"), ErrorCode.ACCESS_DENIED)
        }
    }

    private fun normalizeBarcode(value: String): String {
        val normalized = value.replace(Regex("\\s+"), "")
        if (normalized.isBlank() || normalized.length > DrinkCatalogService.MAX_BARCODE_LENGTH) {
            throw InvalidRequestException(Msg("error.field.blank", "barcode"), ErrorCode.INVALID_REQUEST)
        }
        return normalized
    }

    companion object {
        private const val MAX_RESULTS = 50
        private const val MAX_QUERY_LENGTH = 100
    }
}
