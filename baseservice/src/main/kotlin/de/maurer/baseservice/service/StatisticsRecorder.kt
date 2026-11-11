package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.StatisticKind
import de.maurer.baseservice.domain.StatisticRecordEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StatisticRecordRepository
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID

/**
 * Zentrale Erfassung der Statistik. Die Fach-Services rufen ihn auf, sobald
 * eine Funktion ausgelöst oder beantwortet wurde; er schreibt einen Eintrag in
 * `statistic_records` der aktuellen Gruppe, im Rahmen der laufenden
 * Transaktion.
 *
 * Vor jedem Eintrag prüft er die Schalter in der Reihenfolge
 * **Nutzer > Gruppe > Event** ([decide]): Hat die Person ausgeschaltet, wird
 * über sie nirgends etwas erfasst; sonst entscheidet die Gruppe, danach das
 * Event. Es zählt die Einstellung zum Zeitpunkt der Erfassung. Ohne
 * Gruppenkontext (System-Aufgaben) erfasst er nichts.
 *
 * Gespeichert werden nur Zählwerte; Texte, Bilder oder Beträge nie.
 */
@Service
class StatisticsRecorder(
    private val recordRepository: StatisticRecordRepository,
    private val stammtischRepository: StammtischRepository
) {

    /** Ergebnis der Prüfung; nur [RECORD] schreibt einen Eintrag. */
    enum class Decision { RECORD, USER_DISABLED, GROUP_DISABLED, EVENT_DISABLED }

    /**
     * Schreibt einen Eintrag, wenn die Schalter es erlauben.
     *
     * @param actor Person, die ausgelöst bzw. geantwortet hat; `null` für Gäste.
     * @return `true`, wenn ein Eintrag entstanden ist.
     */
    fun record(
        feature: String,
        kind: String = StatisticKind.TRIGGERED,
        actor: UserEntity?,
        event: EventEntity? = null,
        variant: String? = null,
        respondsTo: UUID? = null,
        sourceId: UUID? = null,
        quantity: Int = 1,
        occurredAt: Instant = Instant.now()
    ): Boolean {
        val stammtischId = TenantContext.stammtischId() ?: return false
        val groupEnabled = stammtischRepository.findById(stammtischId).map { it.statisticsEnabled }.orElse(false)
        if (decide(actor?.statisticsEnabled, groupEnabled, event?.statisticsEnabled) != Decision.RECORD) return false
        recordRepository.save(
            StatisticRecordEntity(
                eventId = event?.id,
                actorUserId = actor?.id,
                feature = feature,
                kind = kind,
                variant = variant?.take(VARIANT_LENGTH),
                respondsTo = respondsTo,
                sourceId = sourceId,
                quantity = quantity.coerceAtLeast(0),
                occurredAt = occurredAt
            )
        )
        return true
    }

    /** Kauf oder Aufladung aus dem Kassenbuch; Stornos über [removePurchase]. */
    fun ledgerEntry(entry: LedgerEntryEntity) {
        when (entry.entryType) {
            LedgerEntryType.purchase -> record(
                feature = StatisticFeature.PURCHASE,
                actor = entry.member,
                event = entry.event,
                variant = entry.source?.name,
                sourceId = entry.id,
                occurredAt = entry.createdAt
            )
            LedgerEntryType.topup -> record(
                feature = StatisticFeature.TOP_UP,
                actor = entry.member,
                sourceId = entry.id,
                occurredAt = entry.createdAt
            )
            else -> Unit
        }
    }

    /**
     * Gegenbuchung: Der Eintrag des ursprünglichen Kaufs bzw. der Aufladung
     * zählt nicht mehr. Läuft unabhängig von den Schaltern, damit ein Storno
     * immer wirkt.
     */
    fun reverse(original: LedgerEntryEntity) {
        if (TenantContext.stammtischId() == null) return
        val feature = when (original.entryType) {
            LedgerEntryType.purchase -> StatisticFeature.PURCHASE
            LedgerEntryType.topup -> StatisticFeature.TOP_UP
            else -> return
        }
        recordRepository.deleteByFeatureAndSource(feature, original.id)
    }

    /** Eine Runde oder Abendaktion, einmal je Vorgang (Wiederholungen zählen nicht doppelt). */
    fun round(actor: UserEntity, event: EventEntity, variant: String, firstEntryId: UUID, members: Int) {
        if (TenantContext.stammtischId() == null) return
        if (recordRepository.existsByFeatureAndSourceId(StatisticFeature.ROUND, firstEntryId)) return
        record(
            feature = StatisticFeature.ROUND,
            actor = actor,
            event = event,
            variant = variant,
            sourceId = firstEntryId,
            quantity = members
        )
    }

    companion object {
        private const val VARIANT_LENGTH = 32

        /**
         * Gewichtung Nutzer > Gruppe > Event: Die höhere Ebene entscheidet
         * zuerst. `null` bei Nutzer oder Event heißt „keine Einstellung“ (Gast
         * bzw. kein Event) und erlaubt die Erfassung.
         */
        fun decide(userEnabled: Boolean?, groupEnabled: Boolean, eventEnabled: Boolean?): Decision = when {
            userEnabled == false -> Decision.USER_DISABLED
            !groupEnabled -> Decision.GROUP_DISABLED
            eventEnabled == false -> Decision.EVENT_DISABLED
            else -> Decision.RECORD
        }
    }
}
