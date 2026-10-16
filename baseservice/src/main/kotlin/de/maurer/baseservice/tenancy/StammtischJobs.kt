package de.maurer.baseservice.tenancy

import de.maurer.baseservice.repository.StammtischRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Hintergrundjobs laufen ohne Anfrage und damit ohne Stammtisch. Sie
 * arbeiten jeden Stammtisch einzeln in dessen eigenem Kontext ab, damit auch
 * Jobs die Trennung nicht umgehen. Ein Fehler in einem Stammtisch hält die
 * anderen nicht auf.
 */
@Component
class StammtischJobs(private val stammtischRepository: StammtischRepository) {

    private val log = LoggerFactory.getLogger(StammtischJobs::class.java)

    fun activeStammtischIds(): List<UUID> = TenantContext.runAsSystem {
        stammtischRepository.findAll().filter { !it.archived }.map { it.id }
    }

    fun forEachStammtisch(job: String, block: (UUID) -> Unit) {
        activeStammtischIds().forEach { id ->
            try {
                TenantContext.runIn(id) { block(id) }
            } catch (ex: RuntimeException) {
                log.warn("job {} failed stammtisch={}: {}", job, id, ex.message)
            }
        }
    }
}
