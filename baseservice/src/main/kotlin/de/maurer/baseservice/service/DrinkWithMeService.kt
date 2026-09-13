package de.maurer.baseservice.service

import de.maurer.baseservice.domain.DrinkWithMeSessionEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.DrinkWithMeSessionDto
import de.maurer.baseservice.dto.StartDrinkWithMeRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ConsentRequiredException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkWithMeSessionRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

/**
 * Fachlicher Slice für zeitlich begrenzte DrinkWithMe-Sessions und
 * Standortfreigaben (TICKET-021).
 *
 * DrinkWithMe erlaubt einem Eventmitglied, andere berechtigte Teilnehmer zum
 * gemeinsamen Trinken einzuladen und dabei – ausschließlich opt-in – den eigenen
 * Standort zu teilen. Jede Freigabe ist zweckgebunden, zeitlich begrenzt und nur
 * für berechtigte Teilnehmer sichtbar; eine Freigabe autorisiert keine Zahlung
 * (siehe `docs/fachkonzept.md`, Abschnitt „Chat, Notifications und DrinkWithMe").
 *
 * Jeder Zugriff wird serverseitig geprüft (`deny by default`): Nur Owner,
 * Teilnehmer sowie Vorstand/Administration eines Events erreichen die Sessions
 * des Events. Zustimmung, Ablauf, Sichtbarkeit und Widerruf werden erzwungen.
 */
@Service
@Transactional
class DrinkWithMeService(
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val drinkWithMeSessionRepository: DrinkWithMeSessionRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userService: UserService
) {

    /**
     * Startet eine DrinkWithMe-Session für das aufrufende Mitglied. Die
     * Standortfreigabe ist opt-in: ohne ausdrückliche Zustimmung wird die Session
     * abgelehnt. Eine bereits aktive Session desselben Mitglieds für dasselbe
     * Event wird zuvor widerrufen, damit je Mitglied und Event höchstens eine
     * aktive Session existiert.
     */
    fun startSession(eventId: UUID, request: StartDrinkWithMeRequest, principal: UserPrincipal): DrinkWithMeSessionDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)
        requireEventActive(event)

        if (!request.consent) {
            throw ConsentRequiredException(
                "Für eine Standortfreigabe ist die ausdrückliche Zustimmung erforderlich",
                ErrorCode.CONSENT_REQUIRED
            )
        }
        requireCompleteCoordinates(request)

        val durationMinutes = request.durationMinutes
            ?: throw InvalidRequestException("durationMinutes ist erforderlich", ErrorCode.INVALID_REQUEST)

        // Bestehende aktive Session desselben Mitglieds ersetzen (höchstens eine aktive Session).
        drinkWithMeSessionRepository.findByEventIdAndUserIdAndActiveTrue(event.id, caller.id)
            .forEach { it.active = false }

        val now = Instant.now()
        val session = DrinkWithMeSessionEntity(
            user = caller,
            event = event,
            latitude = request.latitude,
            longitude = request.longitude,
            message = normalizeMessage(request.message),
            active = true,
            expiresAt = now.plusSeconds(durationMinutes.toLong() * 60L)
        )
        return toDto(drinkWithMeSessionRepository.save(session))
    }

    /**
     * Listet die aktiven, nicht abgelaufenen DrinkWithMe-Sessions eines Events für
     * berechtigte Teilnehmer. Abgelaufene Sessions werden dabei deaktiviert und
     * nicht mehr sichtbar gemacht.
     */
    fun listActiveSessions(eventId: UUID, principal: UserPrincipal): List<DrinkWithMeSessionDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)

        val now = Instant.now()
        return drinkWithMeSessionRepository.findByEventIdAndActiveTrue(event.id)
            .filter { session ->
                if (session.expiresAt.isBefore(now)) {
                    session.active = false
                    false
                } else {
                    true
                }
            }
            .sortedByDescending { it.createdAt }
            .map { toDto(it) }
    }

    /**
     * Widerruft eine DrinkWithMe-Session. Der Eigentümer darf ausschließlich die
     * eigene Session widerrufen; Vorstand und Administration dürfen jede Session
     * des Events widerrufen.
     */
    fun revokeSession(eventId: UUID, sessionId: UUID, principal: UserPrincipal): DrinkWithMeSessionDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)

        val session = drinkWithMeSessionRepository.findById(sessionId).orElseThrow {
            ResourceNotFoundException("DrinkWithMe-Session mit ID '$sessionId' nicht gefunden", ErrorCode.NOT_FOUND)
        }
        if (session.event?.id != event.id) {
            throw ResourceNotFoundException(
                "DrinkWithMe-Session mit ID '$sessionId' nicht gefunden",
                ErrorCode.NOT_FOUND
            )
        }

        val isOwnSession = session.user?.id == caller.id
        if (!isOwnSession && !isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(
                "Nur der Eigentümer sowie Vorstand und Administration dürfen eine DrinkWithMe-Session widerrufen",
                ErrorCode.ACCESS_DENIED
            )
        }

        session.active = false
        return toDto(session)
    }

    // --- Interne Helfer ---

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Event mit ID '$id' nicht gefunden", ErrorCode.NOT_FOUND)
        }

    /** Mitglieder erreichen DrinkWithMe als Owner, Teilnehmer oder Vorstand/Administration. */
    private fun requireMemberAccess(caller: UserEntity, principal: UserPrincipal, event: EventEntity) {
        val allowed = isBoardOrAdmin(caller, principal) ||
            event.owner?.id == caller.id ||
            eventParticipantRepository.findByEventIdAndUserId(event.id, caller.id).isPresent
        if (!allowed) {
            throw AccessDeniedException(
                "Nur Owner, Teilnehmer sowie Vorstand und Administration dürfen DrinkWithMe-Sessions des Events nutzen",
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    /** Beendete oder abgesagte Events erlauben keine neuen Standortfreigaben. */
    private fun requireEventActive(event: EventEntity) {
        if (event.status == EventStatus.cancelled ||
            event.status == EventStatus.archived ||
            event.status == EventStatus.completed
        ) {
            throw EventNotActiveException(
                "Für ein beendetes oder abgesagtes Event kann keine DrinkWithMe-Session gestartet werden",
                ErrorCode.EVENT_NOT_ACTIVE
            )
        }
    }

    /** Koordinaten sind optional, dürfen aber nur vollständig (beide Werte) übermittelt werden. */
    private fun requireCompleteCoordinates(request: StartDrinkWithMeRequest) {
        val hasLatitude = request.latitude != null
        val hasLongitude = request.longitude != null
        if (hasLatitude != hasLongitude) {
            throw InvalidRequestException(
                "latitude und longitude müssen gemeinsam übermittelt werden",
                ErrorCode.INVALID_REQUEST
            )
        }
    }

    private fun normalizeMessage(value: String?): String? = value?.trim()?.ifBlank { null }

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean {
        val dbRoles = userRoleRepository.findByIdUserId(caller.id).map { it.id.role.name }
        val roles = principal.roles + dbRoles
        return roles.any { it == UserRole.BOARD || it == UserRole.ADMIN }
    }

    private fun toDto(session: DrinkWithMeSessionEntity): DrinkWithMeSessionDto =
        DrinkWithMeSessionDto(
            id = session.id.toString(),
            eventId = session.event?.id?.toString().orEmpty(),
            userId = session.user?.id?.toString().orEmpty(),
            userName = session.user?.displayName ?: UNKNOWN_USER_NAME,
            latitude = session.latitude,
            longitude = session.longitude,
            message = session.message,
            active = session.active,
            expiresAt = session.expiresAt,
            createdAt = session.createdAt
        )

    companion object {
        const val UNKNOWN_USER_NAME = "Unbekannt"
    }
}
