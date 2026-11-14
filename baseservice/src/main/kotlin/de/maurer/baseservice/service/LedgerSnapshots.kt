package de.maurer.baseservice.service

import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.repository.PurchaseSnapshotRepository
import org.springframework.stereotype.Component

/**
 * Hängt die Beleg-Snapshots gesammelt an geladene Buchungen (eine Abfrage),
 * auch an die stornierten Ursprungsbuchungen von Korrekturen.
 */
@Component
class LedgerSnapshots(private val purchaseSnapshotRepository: PurchaseSnapshotRepository) {

    fun <T : Collection<LedgerEntryEntity>> attach(entries: T): T {
        val all = (entries + entries.mapNotNull { it.reversesEntry }).filter { it.purchaseSnapshot == null }
        if (all.isEmpty()) return entries
        val byEntry = purchaseSnapshotRepository.findByLedgerEntryIdIn(all.map { it.id }.toSet())
            .associateBy { it.ledgerEntry?.id }
        all.forEach { entry -> entry.purchaseSnapshot = byEntry[entry.id] }
        return entries
    }

    fun attach(entry: LedgerEntryEntity): LedgerEntryEntity = attach(listOf(entry)).first()
}
