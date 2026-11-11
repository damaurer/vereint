package de.maurer.baseservice.service

import de.maurer.baseservice.dto.StatisticsDeletedDto
import de.maurer.baseservice.dto.StatisticsSettingsDto
import de.maurer.baseservice.dto.UpdateStatisticsSettingsRequest
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.PermissionDeniedException
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StatisticRecordRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.stereotype.Service

/**
 * Schalter und Löschen der Statistik.
 *
 * - Nutzer: „Meine Statistik erfassen“ und „Meine erfassten Statistikdaten
 *   löschen“ (alle Gruppen, in denen Einträge der Person liegen).
 * - Gruppe: „Statistik in dieser Gruppe“ und „Statistikdaten der Gruppe
 *   löschen“ für alle mit `stammtisch.manage`.
 *
 * Ausschalten wirkt ab sofort und löscht nichts; Löschen ist ein eigener
 * Aufruf und landet im Audit-Protokoll der betroffenen Gruppe.
 */
@Service
class StatisticsSettingsService(
    private val userService: UserService,
    private val userRepository: UserRepository,
    private val stammtischRepository: StammtischRepository,
    private val recordRepository: StatisticRecordRepository,
    private val tenantTransactions: TenantTransactions,
    private val access: StammtischAccess,
    private val auditService: AuditService
) {

    fun mySettings(principal: UserPrincipal): StatisticsSettingsDto =
        StatisticsSettingsDto(userService.getOrCreateUser(principal).statisticsEnabled)

    fun updateMySettings(request: UpdateStatisticsSettingsRequest, principal: UserPrincipal): StatisticsSettingsDto {
        val enabled = requireEnabled(request)
        val caller = userService.getOrCreateUser(principal)
        val user = tenantTransactions.asSystem {
            val user = userRepository.findById(caller.id).orElseThrow()
            user.statisticsEnabled = enabled
            userRepository.save(user)
        }
        return StatisticsSettingsDto(user.statisticsEnabled)
    }

    /**
     * Löscht alle Einträge der Person, in jeder Gruppe (auch in Gruppen, die
     * sie verlassen hat). Die betroffenen Gruppen werden im System-Kontext
     * ermittelt; gelöscht wird danach je Gruppe in deren Kontext.
     */
    fun deleteMyRecords(principal: UserPrincipal): StatisticsDeletedDto {
        val caller = userService.getOrCreateUser(principal)
        val groups = tenantTransactions.readAsSystem { recordRepository.findStammtischIdsByActor(caller.id) }
        val deleted = groups.sumOf { stammtischId ->
            tenantTransactions.inStammtisch(stammtischId) {
                val count = recordRepository.deleteByActor(stammtischId, caller.id)
                val actor = userRepository.findById(caller.id).orElse(null)
                auditService.recordUserChange(actor, AuditService.ACTION_STATISTICS_DELETED_SELF, caller.id, null, count)
                count
            }
        }
        return StatisticsDeletedDto(deleted)
    }

    fun groupSettings(principal: UserPrincipal): StatisticsSettingsDto {
        userService.getOrCreateUser(principal)
        return StatisticsSettingsDto(currentGroup().statisticsEnabled)
    }

    fun updateGroupSettings(request: UpdateStatisticsSettingsRequest, principal: UserPrincipal): StatisticsSettingsDto {
        val enabled = requireEnabled(request)
        val caller = requireManager(principal)
        val stammtischId = TenantContext.requireStammtischId()
        return tenantTransactions.inStammtisch(stammtischId) {
            val group = stammtischRepository.findById(stammtischId).orElseThrow()
            val previous = group.statisticsEnabled
            group.statisticsEnabled = enabled
            stammtischRepository.save(group)
            if (previous != enabled) {
                val actor = userRepository.findById(caller).orElse(null)
                auditService.recordStammtischChange(actor, AuditService.ACTION_STATISTICS_SWITCHED, stammtischId, "statistics: $previous -> $enabled")
            }
            StatisticsSettingsDto(group.statisticsEnabled)
        }
    }

    fun deleteGroupRecords(principal: UserPrincipal): StatisticsDeletedDto {
        val caller = requireManager(principal)
        val stammtischId = TenantContext.requireStammtischId()
        return tenantTransactions.inStammtisch(stammtischId) {
            val count = recordRepository.deleteAllOfStammtisch(stammtischId)
            val actor = userRepository.findById(caller).orElse(null)
            auditService.recordStammtischChange(actor, AuditService.ACTION_STATISTICS_DELETED, stammtischId, "records=$count")
            StatisticsDeletedDto(count)
        }
    }

    private fun currentGroup() = stammtischRepository.findById(TenantContext.requireStammtischId()).orElseThrow()

    private fun requireManager(principal: UserPrincipal): java.util.UUID {
        val caller = userService.getOrCreateUser(principal)
        if (!access.has(principal, caller, Permission.STAMMTISCH_MANAGE)) {
            throw PermissionDeniedException(Msg("error.stammtisch.manageDenied"))
        }
        return caller.id
    }

    private fun requireEnabled(request: UpdateStatisticsSettingsRequest): Boolean =
        request.enabled ?: throw InvalidRequestException(Msg("error.field.required", "enabled"), ErrorCode.INVALID_REQUEST)
}
