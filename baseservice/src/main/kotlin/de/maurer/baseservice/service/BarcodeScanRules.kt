package de.maurer.baseservice.service

import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkLibraryEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkBarcodeRepository
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.DrinkLibraryBarcodeRepository
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.support.Identifiers
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.util.UUID

/**
 * Gemeinsame Regeln für einen gescannten Strichcode (Issue #110).
 *
 * Wer an einem laufenden Event mit Selbstbedienung teilnimmt, kauft dort über
 * das Event ([LedgerService.purchaseByBarcode]); daran ändert sich nichts.
 * Sonst darf die Person wählen: mit Guthaben zum Katalogpreis bezahlen
 * ([LedgerService.purchaseWithCredit]) oder das Getränk nur als Fremdgetränk
 * in die Statistik aufnehmen ([ForeignDrinkService]).
 *
 * Statt zu scannen kann die Person das Getränk auch aus dem Katalog der Gruppe
 * wählen (Issue #122); dann trägt die Anfrage die Katalog-ID statt des
 * Strichcodes ([resolve]). Danach gelten dieselben Regeln.
 */
@Component
class BarcodeScanRules(
    private val drinkBarcodeRepository: DrinkBarcodeRepository,
    private val drinkLibraryBarcodeRepository: DrinkLibraryBarcodeRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository
) {

    /**
     * Getränk einer Anfrage: entweder gescannt ([barcode]) oder aus dem Katalog
     * gewählt ([drinkId]). Genau eines von beiden muss angegeben sein.
     *
     * Eine Katalog-ID muss zu einem freigegebenen, aktiven Getränk der
     * aktuellen Gruppe gehören; Getränke anderer Gruppen sind über die
     * Mandantentrennung (`stammtisch_id`, Row Level Security) nicht sichtbar
     * und gelten als nicht gefunden.
     */
    fun resolve(barcode: String?, drinkId: String?): SelectedDrink {
        val hasBarcode = !barcode.isNullOrBlank()
        val hasDrinkId = !drinkId.isNullOrBlank()
        if (hasBarcode == hasDrinkId) {
            throw InvalidRequestException(Msg("error.ledger.drinkSelection"), ErrorCode.INVALID_REQUEST)
        }
        if (hasDrinkId) {
            val id = Identifiers.parseUuid(drinkId, "drinkId")
            val drink = catalogDrink(id)
                ?: throw ResourceNotFoundException(Msg("error.drink.notFound", id), ErrorCode.NOT_FOUND)
            return SelectedDrink(barcode = null, catalog = drink, library = null)
        }
        val code = normalizeBarcode(barcode)
        val drink = catalogDrink(code)
        return SelectedDrink(barcode = code, catalog = drink, library = if (drink == null) libraryDrink(code) else null)
    }

    /** Freigegebenes, aktives Getränk der aktuellen Gruppe zur Katalog-ID; sonst `null`. */
    fun catalogDrink(id: UUID): DrinkCatalogEntity? =
        drinkCatalogRepository.findById(id).orElse(null)
            ?.takeIf { it.status == DrinkStatus.approved && it.active }

    /**
     * Getränke, die das Mitglied aus dem Katalog wählen kann (Issue #122):
     * freigegeben, aktiv und mit Preis; nach Namen sortiert.
     */
    fun payableCatalogDrinks(): List<DrinkCatalogEntity> =
        drinkCatalogRepository.findByStatusOrderByNameAsc(DrinkStatus.approved)
            .filter { it.active && it.defaultPrice > BigDecimal.ZERO }

    /** Freigegebenes, aktives Getränk aus dem Katalog der aktuellen Gruppe; sonst `null`. */
    fun catalogDrink(barcode: String): DrinkCatalogEntity? =
        drinkBarcodeRepository.findByBarcode(barcode)
            .filter { it.active }
            .map { it.drink }
            .orElse(null)
            ?.takeIf { it.status == DrinkStatus.approved && it.active }

    /** Eintrag der gemeinsamen Getränkedatenbank zum Strichcode; sonst `null`. */
    fun libraryDrink(barcode: String): DrinkLibraryEntity? =
        drinkLibraryBarcodeRepository.findByBarcode(barcode).map { it.drink }.orElse(null)

    /**
     * Ob [caller] gerade an einem laufenden Event mit Selbstbedienung teilnimmt:
     * als Veranstalter oder eingeladen (ohne Absage), und das Event bietet
     * mindestens ein Getränk zur Selbstbedienung an. Dann gibt es weder
     * Guthabenkauf ohne Event noch Fremdgetränk.
     */
    fun atSelfServiceEvent(caller: UserEntity): Boolean {
        val owned = eventRepository.findByStatus(EventStatus.active).filter { it.owner?.id == caller.id }
        val invited = eventParticipantRepository.findByUserId(caller.id)
            .filter { it.rsvp != RsvpStatus.declined }
            .mapNotNull { it.event }
            .filter { it.status == EventStatus.active }
        return (owned + invited).distinctBy { it.id }
            .any { event -> eventDrinkRepository.findByEventId(event.id).any { it.selfServiceEnabled } }
    }

    /**
     * Gewähltes Getränk: [catalog] aus dem Katalog der Gruppe oder [library] nur
     * aus der Getränkedatenbank. [barcode] ist `null`, wenn das Getränk aus dem
     * Katalog gewählt statt gescannt wurde.
     */
    data class SelectedDrink(
        val barcode: String?,
        val catalog: DrinkCatalogEntity?,
        val library: DrinkLibraryEntity?
    ) {
        /** Für Meldungen: Strichcode oder Katalog-ID. */
        val reference: String get() = barcode ?: catalog?.id?.toString().orEmpty()
    }

    companion object {
        const val MAX_BARCODE_LENGTH = 128
        private val WHITESPACE_REGEX = Regex("\\s+")

        /** Entfernt Leerzeichen; leer oder zu lang ist ein Fehler. */
        fun normalizeBarcode(value: String?): String {
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
    }
}
