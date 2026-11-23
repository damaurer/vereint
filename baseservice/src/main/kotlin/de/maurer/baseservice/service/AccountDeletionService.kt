package de.maurer.baseservice.service

import de.maurer.baseservice.dto.AccountDeletedDto
import de.maurer.baseservice.dto.AccountDeletionBalanceDto
import de.maurer.baseservice.dto.AccountDeletionGroupDto
import de.maurer.baseservice.dto.AccountDeletionPreviewDto
import de.maurer.baseservice.dto.DeleteAccountRequest
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.LastAdminProtectedException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.identity.IdentityProvisioner
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischManagers
import de.maurer.baseservice.tenancy.TenantTransactions
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Service
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

/**
 * Selbstlöschung eines Kontos (#152), verlangt von Google Play und App Store.
 *
 * Ablauf:
 * 1. **Prüfen** je Gruppe mit aktiver Mitgliedschaft: Wer dort als Letzte
 *    Mitglieder oder Rollen verwaltet und nicht allein ist, muss das erst
 *    übergeben ([StammtischManagers.requireRemaining]). Ist die Person das
 *    einzige aktive Mitglied, wird die Gruppe archiviert.
 * 2. **Löschen** in einer Transaktion im System-Kontext über alle Gruppen:
 *    persönliche Inhalte (eigene Chat- und Direktnachrichten, Direktchats,
 *    Moments mit Antworten und Medien, Reaktionen, Freundschaften,
 *    Mitteilungen, Push-Abos, Statistikeinträge, Zusagen zu künftigen
 *    Events, Profilbild), Mitgliedschaften, Rollen und Rechte.
 * 3. **Platzhalter**: Die Zeile in `users` bleibt als „Gelöschtes Konto“ ohne
 *    E-Mail und dauerhaft gesperrt stehen. Buchungen, Runden, Events,
 *    Thekensitzungen und das Audit-Protokoll verweisen weiter auf sie; das
 *    Kassenbuch der Gruppe bleibt damit vollständig. Das Keycloak-Subject
 *    bleibt gespeichert, damit ein noch gültiges Token kein neues Konto anlegt.
 * 4. **Nach dem Commit**: Dateien im Speicher löschen, Audit-Eintrag je
 *    betroffener Gruppe ohne personenbezogene Angaben, Login in Keycloak löschen.
 *
 * Verschlüsselte Inhalte haben keinen Schlüssel pro Person; sie verschwinden
 * mit ihren Zeilen und Dateien. In Backups bleiben sie bis zu deren Ablauf.
 */
@Service
class AccountDeletionService(
    private val userService: UserService,
    private val userRepository: UserRepository,
    private val stammtischRepository: StammtischRepository,
    private val memberRepository: StammtischMemberRepository,
    private val managers: StammtischManagers,
    private val ledgerService: LedgerService,
    private val tenantTransactions: TenantTransactions,
    private val jdbc: NamedParameterJdbcTemplate,
    private val mediaStore: MediaStore,
    private val identityProvisioner: IdentityProvisioner,
    private val auditService: AuditService
) {

    private val log = LoggerFactory.getLogger(AccountDeletionService::class.java)

    private data class GroupRef(val id: UUID, val name: String)

    private data class Plan(
        val blocking: List<GroupRef>,
        val archive: List<GroupRef>,
        val leave: List<GroupRef>
    )

    fun preview(principal: UserPrincipal): AccountDeletionPreviewDto {
        val user = userService.getOrCreateUser(principal)
        val plan = plan(user.id)
        val balances = (plan.blocking + plan.archive + plan.leave).mapNotNull { group ->
            val balance = tenantTransactions.readInStammtisch(group.id) { ledgerService.creditBalanceOf(user.id) }
            balance.takeIf { it.second.signum() != 0 }?.let {
                AccountDeletionBalanceDto(group.id.toString(), group.name, it.first, it.second)
            }
        }
        return AccountDeletionPreviewDto(
            blockingGroups = plan.blocking.map { it.toDto() },
            archivedGroups = plan.archive.map { it.toDto() },
            leftGroups = plan.leave.map { it.toDto() },
            balances = balances.sortedBy { it.groupName.lowercase() },
            loginDeletion = identityProvisioner.canDeleteAccounts,
            platformAdmin = principal.platformAdmin
        )
    }

    fun delete(request: DeleteAccountRequest, principal: UserPrincipal): AccountDeletedDto {
        if (request.confirm != true) {
            throw InvalidRequestException(Msg("error.account.confirmRequired"), ErrorCode.INVALID_REQUEST)
        }
        val user = userService.getOrCreateUser(principal)
        val plan = plan(user.id)
        if (plan.blocking.isNotEmpty()) {
            throw ApiException(
                ErrorCode.ACCOUNT_DELETION_BLOCKED,
                Msg("error.account.lastManager", plan.blocking.joinToString(", ") { it.name }),
                HttpStatus.CONFLICT
            )
        }

        val subject = user.keycloakSubject
        val touched = tenantTransactions.readAsSystem { groupsWithTraces(user.id) }
        val storageKeys = tenantTransactions.asSystem { wipe(user.id, plan.archive.map { it.id }) }

        storageKeys.forEach { mediaStore.delete(it) }
        audit(user.id, touched, plan.archive.map { it.id }.toSet())

        val loginDeleted = deleteLogin(subject)
        log.info(
            "account deleted user={} groups_left={} groups_archived={} files={} login_deleted={}",
            user.id, plan.leave.size, plan.archive.size, storageKeys.size, loginDeleted
        )
        return AccountDeletedDto(loginDeleted)
    }

    // --- Prüfen ---

    private fun plan(userId: UUID): Plan {
        val groups = tenantTransactions.readAsSystem {
            val ids = memberRepository.findByUserIdAndActiveTrue(userId).mapNotNull { it.stammtischId }
            stammtischRepository.findAllById(ids).filter { !it.archived }.map { GroupRef(it.id, it.name) }
        }.sortedBy { it.name.lowercase() }

        val blocking = mutableListOf<GroupRef>()
        val archive = mutableListOf<GroupRef>()
        val leave = mutableListOf<GroupRef>()
        groups.forEach { group ->
            tenantTransactions.readInStammtisch(group.id) {
                val others = memberRepository.findByActiveTrue()
                    .mapNotNull { it.user }
                    .count { it.id != userId && !it.disabled }
                when {
                    others == 0 -> archive += group
                    isLastManager(userId) -> blocking += group
                    else -> leave += group
                }
            }
        }
        return Plan(blocking, archive, leave)
    }

    private fun isLastManager(userId: UUID): Boolean = try {
        managers.requireRemaining(leaving = setOf(userId))
        false
    } catch (_: LastAdminProtectedException) {
        true
    }

    // --- Löschen ---

    /** Gruppen, in denen das Konto Spuren hat (auch frühere Mitgliedschaften); dort landet der Audit-Eintrag. */
    private fun groupsWithTraces(userId: UUID): Set<UUID> =
        jdbc.queryForList(
            "select distinct stammtisch_id from stammtisch_members where user_id = :u",
            params(userId),
            UUID::class.java
        ).filterNotNull().toSet()

    /** Löscht alle persönlichen Daten in einer Transaktion und liefert die Speicherschlüssel der Dateien. */
    private fun wipe(userId: UUID, archive: List<UUID>): List<String> {
        val p = params(userId).addValue("now", Timestamp.from(Instant.now()))
        val keys = mutableListOf<String>()

        // Eigene Moments samt Moment-Chats, Antworten und Medien.
        val moments = uuids("select id from moment_sessions where creator_user_id = :u", p)
        val momentChats = uuids(
            "select conversation_id from moment_sessions where creator_user_id = :u and conversation_id is not null", p
        )
        val mp = MapSqlParameterSource(p.values).addValue("moments", moments.ifEmpty { listOf(NONE) })
            .addValue("chats", momentChats.ifEmpty { listOf(NONE) })
        keys += strings("select storage_key from moment_media where owner_id = :u or moment_id in (:moments)", mp)
        keys += strings("select storage_key from chat_media where owner_id = :u or conversation_id in (:chats)", mp)
        keys += strings(
            """select storage_key from image_assets
               where (owner_id = :u and purpose = 'profile')
                  or (purpose = 'moment' and target_id in (:moments))""",
            mp
        )
        update(
            "delete from image_assets where (owner_id = :u and purpose = 'profile') or (purpose = 'moment' and target_id in (:moments))",
            mp
        )
        update("delete from moment_media where owner_id = :u or moment_id in (:moments)", mp)
        update("delete from moment_responses where user_id = :u", p)
        update("delete from moment_sessions where creator_user_id = :u", p)
        update("delete from conversations where id in (:chats)", mp)

        // Eigene Nachrichten in Gruppen-, Event- und Moment-Chats anderer.
        update("delete from chat_media where owner_id = :u", p)
        update("delete from chat_reactions where user_id = :u", p)
        update("delete from chat_messages where sender_id = :u", p)
        update("update conversations set pinned_text = null, pinned_by = null, pinned_at = null where pinned_by = :u", p)
        update("delete from conversation_members where user_id = :u", p)

        // Direktchats verschwinden ganz: Ohne die Person gibt es kein Gegenüber mehr.
        val directs = uuids("select conversation_id from direct_participants where user_id = :u", p)
        if (directs.isNotEmpty()) {
            val dp = MapSqlParameterSource("directs", directs)
            keys += strings("select storage_key from direct_media where conversation_id in (:directs)", dp)
            update("delete from direct_conversations where id in (:directs)", dp)
        }
        update("delete from direct_media where owner_id = :u", p)
        update("delete from direct_reactions where user_id = :u", p)

        // Persönliches.
        update("delete from friendships where requester_id = :u or addressee_id = :u", p)
        update("delete from notifications where user_id = :u", p)
        update("delete from push_subscriptions where user_id = :u", p)
        update("delete from statistic_records where actor_user_id = :u", p)
        update("delete from event_series_invitees where user_id = :u", p)
        update(
            "delete from event_participants where user_id = :u and event_id in (select id from events where starts_at > :now)",
            p
        )

        // Mitgliedschaften enden wie beim Austritt; Gruppen ohne weitere Mitglieder werden archiviert.
        update("delete from user_roles where user_id = :u", p)
        update("delete from user_permissions where user_id = :u", p)
        update("update stammtisch_members set active = false, board_role = null where user_id = :u", p)
        if (archive.isNotEmpty()) {
            update("update stammtische set archived = true where id in (:groups)", MapSqlParameterSource("groups", archive))
        }

        // Platzhalter statt Person.
        update(
            """update users set display_name = :name, email = null, disabled = true, deleted_at = :now,
                   terms_version = null, terms_accepted_at = null, statistics_enabled = false,
                   version = version + 1
               where id = :u""",
            MapSqlParameterSource(p.values).addValue("name", DELETED_DISPLAY_NAME)
        )
        return keys.distinct()
    }

    private fun audit(userId: UUID, groups: Set<UUID>, archived: Set<UUID>) {
        groups.forEach { stammtischId ->
            runCatching {
                tenantTransactions.inStammtisch(stammtischId) {
                    val actor = userRepository.findById(userId).orElse(null)
                    auditService.recordUserChange(
                        actor,
                        AuditService.ACTION_ACCOUNT_DELETED,
                        userId,
                        null,
                        if (stammtischId in archived) "deleted; group archived" else "deleted"
                    )
                }
            }.onFailure { log.warn("account deleted audit failed stammtisch={}: {}", stammtischId, it.message) }
        }
    }

    /**
     * Löscht das Login in Keycloak. Scheitert das, bleibt das App-Konto
     * trotzdem gelöscht und gesperrt; das Login muss dann in Keycloak entfernt werden.
     */
    private fun deleteLogin(subject: String): Boolean {
        if (!identityProvisioner.canDeleteAccounts) {
            log.warn("account deleted without keycloak admin access; remove login subject={} by hand", subject)
            return false
        }
        return try {
            identityProvisioner.deleteAccount(subject)
            true
        } catch (ex: RuntimeException) {
            log.error("account deleted but keycloak login removal failed subject={}: {}", subject, ex.message)
            false
        }
    }

    // --- SQL-Helfer ---

    private fun params(userId: UUID) = MapSqlParameterSource("u", userId)

    private fun uuids(sql: String, p: MapSqlParameterSource): List<UUID> = jdbc.queryForList(sql, p, UUID::class.java).filterNotNull()

    private fun strings(sql: String, p: MapSqlParameterSource): List<String> = jdbc.queryForList(sql, p, String::class.java).filterNotNull()

    private fun update(sql: String, p: MapSqlParameterSource): Int = jdbc.update(sql, p)

    private fun GroupRef.toDto() = AccountDeletionGroupDto(id.toString(), name)

    companion object {
        /** Name des Platzhalters für gelöschte Konten in Buchungen, Verläufen und Listen. */
        const val DELETED_DISPLAY_NAME = "Gelöschtes Konto"

        /** Platzhalter für leere `in (...)`-Listen. */
        private val NONE = UUID(0L, 0L)
    }
}
