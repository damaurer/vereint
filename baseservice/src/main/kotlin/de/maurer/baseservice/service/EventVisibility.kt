package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.MembershipView
import de.maurer.baseservice.tenancy.StammtischAccess
import org.springframework.stereotype.Component

/**
 * Welche Events einer Gruppe eine Person sieht, wenn gruppenübergreifend
 * gelesen wird (Kalender, übergreifende Event-Statistik): eigene Events,
 * Einladungen und mit `event.manage` alle Events der Gruppe; Entwürfe nur die
 * eigenen. Läuft im Kontext genau dieser Gruppe.
 */
@Component
class EventVisibility(
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val access: StammtischAccess
) {

    /** Rechte dieser Gruppe statt der gerade gewählten (wie nach dem StammtischContextFilter). */
    fun groupPrincipal(principal: UserPrincipal, membership: MembershipView): UserPrincipal = principal.copy(
        roles = membership.roles,
        permissions = membership.permissions,
        boardRole = membership.boardRole,
        stammtischId = membership.stammtischId.toString()
    )

    fun visibleEvents(groupPrincipal: UserPrincipal, caller: UserEntity): Collection<EventEntity> {
        val visible: Collection<EventEntity> = if (access.has(groupPrincipal, caller, Permission.EVENT_MANAGE)) {
            eventRepository.findAll()
        } else {
            val participations = eventParticipantRepository.findByUserId(caller.id)
            (eventRepository.findByOwnerId(caller.id) + participations.mapNotNull { it.event }).associateBy { it.id }.values
        }
        return visible.filter { it.status != EventStatus.draft || it.owner?.id == caller.id }
    }
}
