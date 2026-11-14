package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.MomentSessionEntity
import de.maurer.baseservice.domain.MomentVisibility
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Wer einen Moment sehen darf. Eigene Komponente, damit [MomentService] und
 * [ChatService] (Moment-Chat) dieselbe Regel nutzen, ohne sich gegenseitig zu
 * brauchen.
 *
 * - Vorstand/Admin: jeder Moment.
 * - `group`: jedes Mitglied der Gruppe.
 * - `event`: Event-Owner und Event-Teilnehmer.
 */
@Component
class MomentAccessPolicy(
    private val eventParticipantRepository: EventParticipantRepository,
    private val access: StammtischAccess
) {

    fun canView(caller: UserEntity, principal: UserPrincipal, session: MomentSessionEntity): Boolean =
        viewFilter(caller, principal)(session)

    /**
     * Prüfregel für viele Moments auf einmal: Rollen und Mitgliedschaft werden
     * nur einmal geladen, Event-Teilnahmen je Event höchstens einmal.
     */
    fun viewFilter(caller: UserEntity, principal: UserPrincipal): (MomentSessionEntity) -> Boolean {
        if (isBoardOrAdmin(caller, principal)) return { true }
        val groupMember = access.isMember(principal, caller)
        val eventMembership = HashMap<UUID, Boolean>()
        return { session ->
            val event = session.event
            val inEvent = { event != null && eventMembership.getOrPut(event.id) { isEventMember(caller, event) } }
            when (session.visibility) {
                MomentVisibility.group -> groupMember || inEvent()
                MomentVisibility.event -> inEvent()
            }
        }
    }

    fun canViewEvent(caller: UserEntity, principal: UserPrincipal, event: EventEntity): Boolean =
        isBoardOrAdmin(caller, principal) || isEventMember(caller, event)

    fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.has(principal, caller, Permission.EVENT_MANAGE)

    fun isGroupMember(caller: UserEntity, principal: UserPrincipal): Boolean =
        isBoardOrAdmin(caller, principal) || access.isMember(principal, caller)

    private fun isEventMember(caller: UserEntity, event: EventEntity): Boolean =
        event.owner?.id == caller.id ||
            eventParticipantRepository.findByEventIdAndUserId(event.id, caller.id).isPresent
}
