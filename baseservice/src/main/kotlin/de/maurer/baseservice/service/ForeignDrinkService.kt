package de.maurer.baseservice.service

import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.StatisticRecordEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.ForeignDrinkDto
import de.maurer.baseservice.dto.ForeignDrinkRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.DrinkLibraryRepository
import de.maurer.baseservice.repository.StatisticRecordRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Fremdgetränke (Issue #110): Wer an keinem laufenden Event mit
 * Selbstbedienung teilnimmt, kann ein gescanntes Getränk nur für die Statistik
 * erfassen. Es wird nichts gebucht; der Eintrag steht ausschließlich in
 * `statistic_records` der gewählten Gruppe, ohne Event. Er zählt in der
 * eigenen und in der Gruppenstatistik, in keiner Event-Statistik.
 *
 * Das Getränk darf aus dem Katalog der Gruppe stammen oder nur in der
 * Getränkedatenbank stehen. Ist die Statistik für die Person oder die Gruppe
 * ausgeschaltet, ist das Erfassen nicht möglich. Ein eigenes Fremdgetränk lässt
 * sich wie ein eigener Kauf [REMOVE_WINDOW] lang wieder entfernen.
 */
@Service
@Transactional
class ForeignDrinkService(
    private val userService: UserService,
    private val access: StammtischAccess,
    private val scanRules: BarcodeScanRules,
    private val recorder: StatisticsRecorder,
    private val recordRepository: StatisticRecordRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val drinkLibraryRepository: DrinkLibraryRepository
) {

    /**
     * Erfasst ein Fremdgetränk. Wiederholungen mit demselben Idempotency-Key
     * liefern den bereits erfassten Eintrag.
     */
    fun record(
        request: ForeignDrinkRequest,
        idempotencyKey: String?,
        principal: UserPrincipal,
        now: Instant = Instant.now()
    ): ForeignDrinkDto {
        val caller = requireMember(principal)
        val key = requireKey(idempotencyKey)
        val barcode = BarcodeScanRules.normalizeBarcode(request.barcode)
        val sourceId = UUID.nameUUIDFromBytes("foreign-drink:${caller.id}:$key".toByteArray(StandardCharsets.UTF_8))
        recordRepository.findFirstByFeatureAndSourceId(StatisticFeature.FOREIGN_DRINK, sourceId)
            ?.takeIf { it.actorUserId == caller.id }
            ?.let { return toDto(it) }

        val drink = scanRules.catalogDrink(barcode)
        val library = if (drink == null) scanRules.libraryDrink(barcode) else null
        if (drink == null && library == null) {
            throw ResourceNotFoundException(Msg("error.drink.barcodeNotFound", barcode), ErrorCode.NOT_FOUND)
        }
        if (scanRules.atSelfServiceEvent(caller)) {
            throw ApiException(
                ErrorCode.CREDIT_PURCHASE_AT_EVENT,
                Msg("error.statistics.foreignDrinkAtEvent"),
                HttpStatus.CONFLICT
            )
        }
        val record = recorder.foreignDrink(
            actor = caller,
            drinkId = drink?.id,
            libraryDrinkId = drink?.libraryDrinkId ?: library?.id,
            sourceId = sourceId,
            occurredAt = now
        ) ?: throw ApiException(
            ErrorCode.STATISTICS_DISABLED,
            Msg("error.statistics.foreignDrinkDisabled"),
            HttpStatus.CONFLICT
        )
        return toDto(record, drink?.name ?: library?.name)
    }

    /** Entfernt ein eigenes Fremdgetränk innerhalb von [REMOVE_WINDOW]. */
    fun remove(id: UUID, principal: UserPrincipal, now: Instant = Instant.now()) {
        val caller = requireMember(principal)
        val record = recordRepository.findById(id)
            .filter { it.feature == StatisticFeature.FOREIGN_DRINK && it.actorUserId == caller.id }
            .orElseThrow {
                ResourceNotFoundException(Msg("error.statistics.foreignDrinkNotFound", id), ErrorCode.NOT_FOUND)
            }
        if (record.occurredAt.isBefore(now.minus(REMOVE_WINDOW))) {
            throw InvalidRequestException(
                Msg("error.statistics.foreignDrinkRemoveExpired", REMOVE_WINDOW.toMinutes()),
                ErrorCode.INVALID_REQUEST
            )
        }
        recordRepository.delete(record)
    }

    private fun requireMember(principal: UserPrincipal): UserEntity {
        val caller = userService.getOrCreateUser(principal)
        if (!access.has(principal, caller, Permission.PURCHASE_SELF)) {
            throw AccessDeniedException(Msg("error.ledger.barcodeMembersOnly"), ErrorCode.ACCESS_DENIED)
        }
        return caller
    }

    private fun requireKey(value: String?): String {
        val key = value?.trim()
        if (key.isNullOrBlank()) {
            throw InvalidRequestException(Msg("error.idempotency.keyRequired"), ErrorCode.IDEMPOTENCY_KEY_REQUIRED)
        }
        if (key.length > LedgerService.MAX_IDEMPOTENCY_KEY_LENGTH) {
            throw InvalidRequestException(
                Msg("error.field.tooLong", "Idempotency-Key", LedgerService.MAX_IDEMPOTENCY_KEY_LENGTH),
                ErrorCode.INVALID_REQUEST
            )
        }
        return key
    }

    private fun toDto(record: StatisticRecordEntity, knownName: String? = null): ForeignDrinkDto {
        val name = knownName
            ?: record.drinkId?.let { id -> drinkCatalogRepository.findById(id).map { it.name }.orElse(null) }
            ?: record.libraryDrinkId?.let { id -> drinkLibraryRepository.findById(id).map { it.name }.orElse(null) }
            ?: StatisticsService.UNKNOWN_ITEM
        return ForeignDrinkDto(
            id = record.id.toString(),
            drinkName = name,
            drinkId = record.drinkId?.toString(),
            libraryDrinkId = record.libraryDrinkId?.toString(),
            occurredAt = record.occurredAt,
            removableUntil = record.occurredAt.plus(REMOVE_WINDOW)
        )
    }

    companion object {
        /** Wie lange sich ein eigenes Fremdgetränk selbst entfernen lässt (wie ein eigener Kauf). */
        val REMOVE_WINDOW: Duration = LedgerService.PURCHASE_UNDO_WINDOW
    }
}
