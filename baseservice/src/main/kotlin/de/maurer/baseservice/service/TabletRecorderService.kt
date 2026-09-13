package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.PurchaseSource
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.EventDrinkDto
import de.maurer.baseservice.dto.LedgerEntryDto
import de.maurer.baseservice.dto.TabletEventDto
import de.maurer.baseservice.dto.TabletMemberDto
import de.maurer.baseservice.dto.TabletPurchaseRequest
import de.maurer.baseservice.dto.TabletRevenuePurchaseRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.Identifiers
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Fachlicher Slice für die Tablet-Erfassung und den Drink-Recorder (TICKET-017).
 *
 * Der Tablet-Kontext nutzt eine dedizierte technische Identität (`tabletRecorder`).
 * Er darf aktive Events, die freigegebenen Eventmitglieder und die tabletfähigen
 * Eventgetränke lesen sowie manuelle Käufe über die Strichliste erfassen. Er darf
 * keine PWA-Barcodekäufe auslösen und weder Käuferidentität noch Preis oder
 * Abrechnungsmodus autoritativ vorgeben: Der Käufer muss ein Eventmitglied sein,
 * Preis/Währung stammen aus dem Eventgetränk, der Modus ist stets `credit` und die
 * Herkunft `tabletManual` (siehe `docs/fachkonzept.md`, `docs/authentifizierung.md`).
 *
 * Jeder Zugriff wird serverseitig geprüft und folgt `deny by default`: Ohne die
 * fachliche Berechtigung `purchase.tablet` entsteht kein Zugriff.
 */
@Service
@Transactional
class TabletRecorderService(
    private val eventRepository: EventRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val userRepository: UserRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userService: UserService,
    private val ledgerService: LedgerService
) {

    @Transactional(readOnly = true)
    fun listActiveEvents(principal: UserPrincipal): List<TabletEventDto> {
        requireTabletRecorder(principal)
        return eventRepository.findByStatus(EventStatus.active)
            .sortedBy { it.startsAt }
            .map { toEventDto(it) }
    }

    @Transactional(readOnly = true)
    fun listEventMembers(eventId: UUID, principal: UserPrincipal): List<TabletMemberDto> {
        requireTabletRecorder(principal)
        val event = requireActiveEvent(eventId)

        val members = LinkedHashMap<UUID, UserEntity>()
        event.owner?.takeIf { !it.disabled }?.let { members[it.id] = it }
        eventParticipantRepository.findByEventId(eventId)
            .mapNotNull { it.user }
            .filter { !it.disabled }
            .forEach { members.putIfAbsent(it.id, it) }

        return members.values
            .sortedBy { it.displayName.lowercase() }
            .map { TabletMemberDto(memberId = it.id.toString(), displayName = it.displayName) }
    }

    @Transactional(readOnly = true)
    fun listTabletDrinks(eventId: UUID, principal: UserPrincipal): List<EventDrinkDto> {
        requireTabletRecorder(principal)
        requireActiveEvent(eventId)
        return eventDrinkRepository.findByEventId(eventId)
            .filter { it.tabletEnabled }
            .sortedBy { it.drink?.name.orEmpty() }
            .map { toEventDrinkDto(it) }
    }

    /**
     * Erfasst einen manuellen Kauf. Käufer, Getränk und Eventzugehörigkeit werden
     * geprüft; Preis, Währung, Abrechnungsmodus und Herkunft bestimmt der Server.
     */
    fun recordPurchase(
        eventId: UUID,
        request: TabletPurchaseRequest,
        idempotencyKey: String?,
        principal: UserPrincipal
    ): LedgerEntryDto {
        val actor = requireTabletRecorder(principal)
        val event = requireActiveEvent(eventId)

        val memberId = Identifiers.parseUuid(request.memberId, "memberId")
        val buyer = requireEventMember(event, memberId)

        val eventDrinkId = Identifiers.parseUuid(request.eventDrinkId, "eventDrinkId")
        val eventDrink = requireEventDrink(eventId, eventDrinkId)
        val drink = eventDrink.drink
            ?: throw ResourceNotFoundException(
                "Eventgetränk mit ID '$eventDrinkId' ist keinem Getränk zugeordnet",
                ErrorCode.NOT_FOUND
            )

        return ledgerService.recordTabletPurchase(
            event = event,
            member = buyer,
            drink = drink,
            eventDrink = eventDrink,
            actor = actor,
            idempotencyKey = idempotencyKey
        )
    }

    /**
     * Erfasst eine Runde (`source = round`) als Revenue-Only-Buchung für alle
     * angegebenen Eventmitglieder. Kein persönliches Guthaben wird belastet; nur der
     * Eventumsatz steigt (TICKET-018).
     */
    fun recordRound(
        eventId: UUID,
        request: TabletRevenuePurchaseRequest,
        idempotencyKey: String?,
        principal: UserPrincipal
    ): List<LedgerEntryDto> = recordRevenuePurchase(eventId, request, idempotencyKey, principal, PurchaseSource.round)

    /**
     * Erfasst eine Abendaktion (`source = evening`) als Revenue-Only-Buchung für alle
     * angegebenen Eventmitglieder. Kein persönliches Guthaben wird belastet; nur der
     * Eventumsatz steigt (TICKET-018).
     */
    fun recordEvening(
        eventId: UUID,
        request: TabletRevenuePurchaseRequest,
        idempotencyKey: String?,
        principal: UserPrincipal
    ): List<LedgerEntryDto> = recordRevenuePurchase(eventId, request, idempotencyKey, principal, PurchaseSource.evening)

    /**
     * Gemeinsamer Pfad für Runden und Abendaktionen: prüft Berechtigung, aktives
     * Event, tabletfähiges Getränk und die Mitgliedschaft jedes Begünstigten und
     * bucht je Mitglied genau eine unveränderliche Revenue-Only-Buchung. Der
     * gemeinsame `Idempotency-Key` wird je Mitglied und Herkunft zu einem global
     * eindeutigen Schlüssel abgeleitet, sodass Wiederholungen keine Doppelbuchung
     * erzeugen. Preis, Währung, Abrechnungsmodus (`revenueOnly`) und Herkunft
     * bestimmt ausschließlich der Server.
     */
    private fun recordRevenuePurchase(
        eventId: UUID,
        request: TabletRevenuePurchaseRequest,
        idempotencyKey: String?,
        principal: UserPrincipal,
        source: PurchaseSource
    ): List<LedgerEntryDto> {
        val actor = requireTabletRecorder(principal)
        val event = requireActiveEvent(eventId)
        val baseKey = requireBatchIdempotencyKey(idempotencyKey)

        val eventDrinkId = Identifiers.parseUuid(request.eventDrinkId, "eventDrinkId")
        val eventDrink = requireEventDrink(eventId, eventDrinkId)
        val drink = eventDrink.drink
            ?: throw ResourceNotFoundException(
                "Eventgetränk mit ID '$eventDrinkId' ist keinem Getränk zugeordnet",
                ErrorCode.NOT_FOUND
            )

        val rawIds = request.memberIds.orEmpty()
        if (rawIds.isEmpty()) {
            throw InvalidRequestException("memberIds darf nicht leer sein", ErrorCode.INVALID_REQUEST)
        }
        val memberIds = rawIds.map { Identifiers.parseUuid(it, "memberIds") }.distinct()

        return memberIds.map { memberId ->
            val buyer = requireEventMember(event, memberId)
            val derivedKey = "$baseKey#${source.name}#$memberId"
            ledgerService.recordEventRevenuePurchase(
                event = event,
                member = buyer,
                drink = drink,
                eventDrink = eventDrink,
                actor = actor,
                source = source,
                idempotencyKey = derivedKey
            )
        }
    }

    /**
     * Prüft und beschränkt den gemeinsamen Idempotenzschlüssel einer Runde/Abendaktion.
     * Aus ihm werden je Mitglied global eindeutige Ledger-Schlüssel abgeleitet
     * (`baseKey#source#memberId`); die Länge bleibt begrenzt, damit die abgeleiteten
     * Schlüssel die Grenze aus [LedgerService] nicht überschreiten.
     */
    private fun requireBatchIdempotencyKey(value: String?): String {
        val key = value?.trim()
        if (key.isNullOrBlank()) {
            throw InvalidRequestException(
                "Header 'Idempotency-Key' ist für finanzielle Schreibvorgänge erforderlich",
                ErrorCode.IDEMPOTENCY_KEY_REQUIRED
            )
        }
        if (key.length > MAX_BATCH_IDEMPOTENCY_KEY_LENGTH) {
            throw InvalidRequestException(
                "Idempotency-Key darf für Runden/Abendaktionen höchstens " +
                    "$MAX_BATCH_IDEMPOTENCY_KEY_LENGTH Zeichen lang sein",
                ErrorCode.INVALID_REQUEST
            )
        }
        return key
    }

    /**
     * Prüft die fachliche Tablet-Berechtigung (`purchase.tablet`). Sie entsteht über
     * die technische Rolle `tabletRecorder`, die Adminrolle oder das
     * `drinkRecorder`-Flag; Mitglieder und Vorstand ohne dieses Recht werden
     * abgewiesen. Gibt die aufgelöste Akteursidentität zurück.
     */
    private fun requireTabletRecorder(principal: UserPrincipal): UserEntity {
        val actor = userService.getOrCreateUser(principal)
        val dbRoles = userRoleRepository.findByIdUserId(actor.id).map { it.id.role.name }.toSet()
        val roles = principal.roles + dbRoles
        val drinkRecorder = principal.drinkRecorder || actor.drinkRecorder
        val permissions = principal.permissions + RolePermissionMatrix.derivePermissions(roles, drinkRecorder)
        if (!permissions.contains(Permission.PURCHASE_TABLET)) {
            throw AccessDeniedException(
                "Nur der Tablet-Recorder darf manuelle Käufe erfassen",
                ErrorCode.ACCESS_DENIED
            )
        }
        return actor
    }

    private fun requireActiveEvent(eventId: UUID): EventEntity {
        val event = eventRepository.findById(eventId).orElseThrow {
            ResourceNotFoundException("Event mit ID '$eventId' nicht gefunden", ErrorCode.NOT_FOUND)
        }
        if (event.status != EventStatus.active) {
            throw EventNotActiveException(
                "Für dieses Event können derzeit keine Tablet-Käufe erfasst werden",
                ErrorCode.EVENT_NOT_ACTIVE
            )
        }
        return event
    }

    /** Der Käufer muss ein aktives Mitglied des Events sein (Owner oder Teilnehmer). */
    private fun requireEventMember(event: EventEntity, memberId: UUID): UserEntity {
        val buyer = userRepository.findById(memberId).orElseThrow {
            ResourceNotFoundException("Benutzer mit ID '$memberId' nicht gefunden", ErrorCode.NOT_FOUND)
        }
        val isOwner = event.owner?.id == memberId
        val isParticipant = eventParticipantRepository.findByEventIdAndUserId(event.id, memberId).isPresent
        if (buyer.disabled || (!isOwner && !isParticipant)) {
            throw InvalidRequestException(
                "Der angegebene Käufer ist kein Mitglied dieses Events",
                ErrorCode.INVALID_REQUEST
            )
        }
        return buyer
    }

    private fun requireEventDrink(eventId: UUID, eventDrinkId: UUID): EventDrinkEntity {
        val eventDrink = eventDrinkRepository.findById(eventDrinkId).orElseThrow {
            ResourceNotFoundException("Eventgetränk mit ID '$eventDrinkId' nicht gefunden", ErrorCode.NOT_FOUND)
        }
        if (eventDrink.event?.id != eventId) {
            throw ResourceNotFoundException(
                "Eventgetränk mit ID '$eventDrinkId' ist diesem Event nicht zugeordnet",
                ErrorCode.NOT_FOUND
            )
        }
        if (!eventDrink.tabletEnabled) {
            throw InvalidRequestException(
                "Für dieses Getränk ist die Tablet-Erfassung im Event deaktiviert",
                ErrorCode.INVALID_REQUEST
            )
        }
        return eventDrink
    }

    private fun toEventDto(event: EventEntity): TabletEventDto =
        TabletEventDto(
            id = event.id.toString(),
            title = event.title,
            location = event.location,
            startsAt = event.startsAt,
            status = event.status.name
        )

    private fun toEventDrinkDto(eventDrink: EventDrinkEntity): EventDrinkDto {
        val drink = eventDrink.drink
        return EventDrinkDto(
            id = eventDrink.id.toString(),
            eventId = eventDrink.event?.id?.toString().orEmpty(),
            drinkId = drink?.id?.toString().orEmpty(),
            drinkName = drink?.name.orEmpty(),
            price = eventDrink.price,
            currency = eventDrink.currency,
            selfServiceEnabled = eventDrink.selfServiceEnabled,
            tabletEnabled = eventDrink.tabletEnabled,
            catalogVersion = eventDrink.catalogVersion,
            imageSnapshot = eventDrink.imageSnapshot,
            createdAt = eventDrink.createdAt,
            updatedAt = eventDrink.updatedAt
        )
    }

    companion object {
        /**
         * Obergrenze des gemeinsamen Runden-/Abendaktions-Schlüssels. Sie hält die
         * abgeleiteten Ledger-Schlüssel (`baseKey#source#memberId`) unter der Grenze
         * von [LedgerService.MAX_IDEMPOTENCY_KEY_LENGTH].
         */
        const val MAX_BATCH_IDEMPOTENCY_KEY_LENGTH = 80
    }
}
