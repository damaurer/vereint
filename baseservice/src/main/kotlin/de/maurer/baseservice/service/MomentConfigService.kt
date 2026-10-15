package de.maurer.baseservice.service

import de.maurer.baseservice.domain.MomentReactionEntity
import de.maurer.baseservice.domain.MomentTypeEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.*
import de.maurer.baseservice.repository.MomentReactionRepository
import de.maurer.baseservice.repository.MomentTypeRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Moment-Typen und Reaktionen, die der Vorstand selbst festlegt.
 *
 * Lesen dürfen alle Angemeldeten (die App braucht Namen und Emojis auch für
 * ausgemusterte Einträge alter Moments). Anlegen und Ändern dürfen nur Vorstand
 * und Administration. Gelöscht wird nichts: Ausmustern (`active = false`)
 * verhindert die weitere Verwendung, bestehende Moments und Beiträge bleiben
 * unverändert.
 */
@Service
@Transactional
class MomentConfigService(
    private val momentTypeRepository: MomentTypeRepository,
    private val momentReactionRepository: MomentReactionRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userService: UserService,
    private val auditService: AuditService
) {

    @Transactional(readOnly = true)
    fun getConfig(): MomentConfigDto {
        val reactions = momentReactionRepository.findAllByOrderBySortOrderAscNameAsc()
        val types = momentTypeRepository.findAllByOrderBySortOrderAscNameAsc()
        return MomentConfigDto(
            types = types.map { toTypeDto(it, reactions) },
            reactions = reactions.map { toReactionDto(it) },
            mediaLimits = MomentMediaService.limits()
        )
    }

    fun createType(request: SaveMomentTypeRequest, principal: UserPrincipal): MomentTypeDto {
        val caller = requireBoardOrAdmin(principal)
        val id = UUID.randomUUID()
        val type = MomentTypeEntity(id = id, code = id.toString(), sortOrder = momentTypeRepository.findMaxSortOrder() + 10)
        applyType(type, request)
        val saved = momentTypeRepository.save(type)
        auditService.recordMomentConfigChange(caller, AuditService.ACTION_MOMENT_TYPE_SAVED, saved.id, "name=${saved.name}; active=${saved.active}")
        return toTypeDto(saved, momentReactionRepository.findAllByOrderBySortOrderAscNameAsc())
    }

    fun updateType(id: UUID, request: SaveMomentTypeRequest, principal: UserPrincipal): MomentTypeDto {
        val caller = requireBoardOrAdmin(principal)
        val type = momentTypeRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.momentType.notFound", id), ErrorCode.NOT_FOUND)
        }
        applyType(type, request)
        val saved = momentTypeRepository.save(type)
        auditService.recordMomentConfigChange(caller, AuditService.ACTION_MOMENT_TYPE_SAVED, saved.id, "name=${saved.name}; active=${saved.active}")
        return toTypeDto(saved, momentReactionRepository.findAllByOrderBySortOrderAscNameAsc())
    }

    fun createReaction(request: SaveMomentReactionRequest, principal: UserPrincipal): MomentReactionDto {
        val caller = requireBoardOrAdmin(principal)
        val id = UUID.randomUUID()
        val reaction = MomentReactionEntity(id = id, code = id.toString(), sortOrder = momentReactionRepository.findMaxSortOrder() + 10)
        applyReaction(reaction, request)
        val saved = momentReactionRepository.save(reaction)
        auditService.recordMomentConfigChange(caller, AuditService.ACTION_MOMENT_REACTION_SAVED, saved.id, "name=${saved.name}; active=${saved.active}")
        return toReactionDto(saved)
    }

    fun updateReaction(id: UUID, request: SaveMomentReactionRequest, principal: UserPrincipal): MomentReactionDto {
        val caller = requireBoardOrAdmin(principal)
        val reaction = momentReactionRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.momentReaction.notFound", id), ErrorCode.NOT_FOUND)
        }
        applyReaction(reaction, request)
        val saved = momentReactionRepository.save(reaction)
        auditService.recordMomentConfigChange(caller, AuditService.ACTION_MOMENT_REACTION_SAVED, saved.id, "name=${saved.name}; active=${saved.active}")
        return toReactionDto(saved)
    }

    /** Aktiver Typ zum Starten eines Moments; ausgemusterte oder unbekannte Typen werden abgelehnt. */
    @Transactional(readOnly = true)
    fun requireActiveType(code: String): MomentTypeEntity {
        val type = momentTypeRepository.findByCode(code).orElse(null)
        if (type == null || !type.active) {
            throw InvalidRequestException(Msg("error.momentType.notAvailable"), ErrorCode.INVALID_REQUEST)
        }
        return type
    }

    /** Prüft, ob [reactionCode] in Moments vom Typ [typeCode] gerade wählbar ist. */
    @Transactional(readOnly = true)
    fun requireAllowedReaction(typeCode: String, reactionCode: String): MomentReactionEntity {
        val reaction = momentReactionRepository.findByCode(reactionCode).orElse(null)
        if (reaction == null || !reaction.active) {
            throw InvalidRequestException(Msg("error.momentReaction.notAvailable"), ErrorCode.INVALID_REQUEST)
        }
        // Moments mit unbekanntem Typ (Altdaten) erlauben alle aktiven Reaktionen.
        val type = momentTypeRepository.findByCode(typeCode).orElse(null)
        if (type != null && !type.allReactions && type.reactions.none { it.id == reaction.id }) {
            throw InvalidRequestException(Msg("error.momentReaction.notAllowedForType"), ErrorCode.INVALID_REQUEST)
        }
        return reaction
    }

    /** Namen und Emojis für Codes; unbekannte Codes fehlen in der Map. */
    @Transactional(readOnly = true)
    fun labels(): MomentLabels = MomentLabels(
        types = momentTypeRepository.findAll().associate { it.code to (it.name to it.emoji) },
        reactions = momentReactionRepository.findAll().associate { it.code to (it.name to it.emoji) }
    )

    private fun applyType(type: MomentTypeEntity, request: SaveMomentTypeRequest) {
        val name = request.name.trim()
        val emoji = request.emoji.trim()
        if (name.isEmpty()) throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
        if (emoji.isEmpty()) throw InvalidRequestException(Msg("error.field.blank", "emoji"), ErrorCode.INVALID_REQUEST)
        val duplicate = momentTypeRepository.findAll().any { it.id != type.id && it.name.equals(name, ignoreCase = true) }
        if (duplicate) throw InvalidRequestException(Msg("error.momentType.duplicateName", name), ErrorCode.INVALID_REQUEST)

        val selected = if (request.allReactions) {
            emptySet()
        } else {
            val ids = request.reactionIds.map { parseId(it) }.toSet()
            val found = momentReactionRepository.findAllById(ids)
            if (found.size != ids.size) {
                throw InvalidRequestException(Msg("error.momentReaction.unknown"), ErrorCode.INVALID_REQUEST)
            }
            if (found.none { it.active }) {
                throw InvalidRequestException(Msg("error.momentType.noReactions"), ErrorCode.INVALID_REQUEST)
            }
            found.toSet()
        }

        type.name = name
        type.emoji = emoji
        type.description = request.description?.trim()?.ifBlank { null }
        type.active = request.active
        type.allReactions = request.allReactions
        type.reactions.clear()
        type.reactions.addAll(selected)
    }

    private fun applyReaction(reaction: MomentReactionEntity, request: SaveMomentReactionRequest) {
        val name = request.name.trim()
        val emoji = request.emoji.trim()
        if (name.isEmpty()) throw InvalidRequestException(Msg("error.field.blank", "name"), ErrorCode.INVALID_REQUEST)
        if (emoji.isEmpty()) throw InvalidRequestException(Msg("error.field.blank", "emoji"), ErrorCode.INVALID_REQUEST)
        val duplicate = momentReactionRepository.findAll().any { it.id != reaction.id && it.name.equals(name, ignoreCase = true) }
        if (duplicate) throw InvalidRequestException(Msg("error.momentReaction.duplicateName", name), ErrorCode.INVALID_REQUEST)
        reaction.name = name
        reaction.emoji = emoji
        reaction.active = request.active
    }

    private fun parseId(value: String): UUID = try {
        UUID.fromString(value.trim())
    } catch (_: IllegalArgumentException) {
        throw InvalidRequestException(Msg("error.field.invalidUuid", "reactionIds", value), ErrorCode.INVALID_REQUEST)
    }

    private fun requireBoardOrAdmin(principal: UserPrincipal): UserEntity {
        val caller = userService.getOrCreateUser(principal)
        val dbRoles = userRoleRepository.findByIdUserId(caller.id).map { it.id.role.name }
        val roles = principal.roles + dbRoles
        if (roles.none { it == UserRole.BOARD || it == UserRole.ADMIN }) {
            throw AccessDeniedException(Msg("error.momentConfig.manageDenied"), ErrorCode.ACCESS_DENIED)
        }
        return caller
    }

    private fun toTypeDto(type: MomentTypeEntity, allReactions: List<MomentReactionEntity>): MomentTypeDto {
        val allowed = if (type.allReactions) allReactions.filter { it.active } else allReactions.filter { r -> r.active && type.reactions.any { it.id == r.id } }
        return MomentTypeDto(
            id = type.id.toString(),
            code = type.code,
            name = type.name,
            emoji = type.emoji,
            description = type.description,
            active = type.active,
            allReactions = type.allReactions,
            reactionIds = allReactions.filter { r -> type.reactions.any { it.id == r.id } }.map { it.id.toString() },
            allowedReactionCodes = allowed.map { it.code }
        )
    }

    private fun toReactionDto(reaction: MomentReactionEntity) = MomentReactionDto(
        id = reaction.id.toString(),
        code = reaction.code,
        name = reaction.name,
        emoji = reaction.emoji,
        active = reaction.active
    )
}

/** Anzeigenamen und Emojis zu Typ- und Reaktionscodes. */
class MomentLabels(
    val types: Map<String, Pair<String, String>>,
    val reactions: Map<String, Pair<String, String>>
) {
    fun typeName(code: String): String = types[code]?.first ?: code
    fun typeEmoji(code: String): String? = types[code]?.second
    fun reactionName(code: String?): String? = code?.let { reactions[it]?.first ?: it }
    fun reactionEmoji(code: String?): String? = code?.let { reactions[it]?.second }

    companion object {
        val EMPTY = MomentLabels(emptyMap(), emptyMap())
    }
}
