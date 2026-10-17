package de.maurer.baseservice.service

import de.maurer.baseservice.domain.FriendshipEntity
import de.maurer.baseservice.domain.FriendshipStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.FriendContactDto
import de.maurer.baseservice.dto.FriendsOverviewDto
import de.maurer.baseservice.dto.SharedGroupDto
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.FriendshipRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.Identifiers
import de.maurer.baseservice.tenancy.GroupContact
import de.maurer.baseservice.tenancy.SharedGroup
import de.maurer.baseservice.tenancy.SharedGroups
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

/**
 * Gruppenübergreifende Freundesliste.
 *
 * - Freundschaft entsteht per Anfrage und Annahme. Anfragen gehen nur an
 *   Personen, mit denen man eine Gruppe teilt; eine freie Suche über alle
 *   Konten gibt es nicht. Wer keine Gruppe teilt, gilt als „nicht gefunden“.
 * - Fragen sich zwei Personen gegenseitig an, sind sie sofort befreundet.
 * - Freundschaften bleiben, wenn jemand eine Gruppe verlässt.
 * - Jede Zeile sehen nur die beiden Beteiligten.
 */
@Service
@Transactional
class FriendService(
    private val friendshipRepository: FriendshipRepository,
    private val userRepository: UserRepository,
    private val userService: UserService,
    private val sharedGroups: SharedGroups
) {

    @Transactional(readOnly = true)
    fun overview(principal: UserPrincipal): FriendsOverviewDto {
        val caller = userService.getOrCreateUser(principal)
        val shared = sharedGroups.contactsOf(caller.id).associateBy { it.user.id }
        val rows = friendshipRepository.findInvolving(caller.id)
            .mapNotNull { friendship -> friendship.other(caller.id)?.takeIf { !it.disabled }?.let { friendship to it } }
        fun toDto(friendship: FriendshipEntity, other: UserEntity) =
            toContact(other, statusOf(friendship, caller.id), friendship.acceptedAt ?: friendship.createdAt, shared[other.id])
        return FriendsOverviewDto(
            friends = rows.filter { it.first.status == FriendshipStatus.accepted }.map { toDto(it.first, it.second) }.sortedByName(),
            incoming = rows.filter { statusOf(it.first, caller.id) == STATUS_INCOMING }.map { toDto(it.first, it.second) }.sortedByName(),
            outgoing = rows.filter { statusOf(it.first, caller.id) == STATUS_OUTGOING }.map { toDto(it.first, it.second) }.sortedByName()
        )
    }

    /**
     * Personen, die man anschreiben oder als Freund hinzufügen kann: alle aus
     * den eigenen Gruppen plus Freunde, mit denen man keine Gruppe mehr teilt.
     */
    @Transactional(readOnly = true)
    fun contacts(principal: UserPrincipal): List<FriendContactDto> = contactsOf(userService.getOrCreateUser(principal))

    @Transactional(readOnly = true)
    fun contactsOf(caller: UserEntity): List<FriendContactDto> {
        val shared = sharedGroups.contactsOf(caller.id)
        val friendships = friendshipRepository.findInvolving(caller.id)
            .mapNotNull { friendship -> friendship.other(caller.id)?.let { it.id to friendship } }
            .toMap()
        val fromGroups = shared.map { contact ->
            val friendship = friendships[contact.user.id]
            toContact(
                contact.user,
                friendship?.let { statusOf(it, caller.id) } ?: STATUS_NONE,
                friendship?.acceptedAt,
                contact
            )
        }
        val sharedIds = shared.map { it.user.id }.toSet()
        val friendsOnly = friendships.values
            .filter { it.status == FriendshipStatus.accepted }
            .mapNotNull { it.other(caller.id) }
            .filter { it.id !in sharedIds && !it.disabled }
            .map { other -> toContact(other, STATUS_FRIEND, friendships[other.id]?.acceptedAt, null) }
        return (fromGroups + friendsOnly).sortedByName()
    }

    /** Schickt eine Anfrage; liegt schon eine Anfrage der anderen Person vor, gilt sie als angenommen. */
    fun request(userIdValue: String?, principal: UserPrincipal): FriendContactDto {
        val caller = userService.getOrCreateUser(principal)
        val targetId = Identifiers.parseUuid(userIdValue, "userId")
        if (targetId == caller.id) {
            throw InvalidRequestException(Msg("error.friend.self"), ErrorCode.INVALID_REQUEST)
        }
        val groups = sharedGroups.between(caller.id, targetId)
        val existing = friendshipRepository.findByPairKey(pairKey(caller.id, targetId)).orElse(null)
        // Ohne gemeinsame Gruppe und ohne bestehende Beziehung bleibt das Konto unsichtbar.
        if (groups.isEmpty() && existing == null) throw notFound(targetId)
        val target = requireActiveUser(targetId)

        val friendship = when {
            existing == null -> friendshipRepository.save(
                FriendshipEntity(pairKey = pairKey(caller.id, target.id), requester = caller, addressee = target)
            )
            existing.status == FriendshipStatus.pending && existing.addressee?.id == caller.id -> existing.apply {
                status = FriendshipStatus.accepted
                acceptedAt = Instant.now()
            }
            else -> existing
        }
        return toContact(target, statusOf(friendship, caller.id), friendship.acceptedAt, groups)
    }

    fun accept(userIdValue: String?, principal: UserPrincipal): FriendContactDto {
        val caller = userService.getOrCreateUser(principal)
        val otherId = Identifiers.parseUuid(userIdValue, "userId")
        val friendship = friendshipRepository.findByPairKey(pairKey(caller.id, otherId))
            .filter { it.status == FriendshipStatus.pending && it.addressee?.id == caller.id }
            .orElseThrow { ResourceNotFoundException(Msg("error.friend.requestNotFound"), ErrorCode.NOT_FOUND) }
        friendship.status = FriendshipStatus.accepted
        friendship.acceptedAt = Instant.now()
        val other = requireActiveUser(otherId)
        return toContact(other, STATUS_FRIEND, friendship.acceptedAt, sharedGroups.between(caller.id, otherId))
    }

    /** Lehnt eine Anfrage ab, zieht die eigene zurück oder beendet eine Freundschaft. */
    fun remove(userIdValue: String?, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val otherId = Identifiers.parseUuid(userIdValue, "userId")
        val friendship = friendshipRepository.findByPairKey(pairKey(caller.id, otherId))
            .orElseThrow { ResourceNotFoundException(Msg("error.friend.notFound"), ErrorCode.NOT_FOUND) }
        friendshipRepository.delete(friendship)
    }

    @Transactional(readOnly = true)
    fun areFriends(userId: UUID, otherId: UUID): Boolean =
        friendshipRepository.findByPairKey(pairKey(userId, otherId))
            .map { it.status == FriendshipStatus.accepted }
            .orElse(false)

    private fun requireActiveUser(userId: UUID): UserEntity =
        userRepository.findById(userId).filter { !it.disabled }.orElseThrow { notFound(userId) }

    private fun statusOf(friendship: FriendshipEntity, callerId: UUID): String = when {
        friendship.status == FriendshipStatus.accepted -> STATUS_FRIEND
        friendship.requester?.id == callerId -> STATUS_OUTGOING
        else -> STATUS_INCOMING
    }

    private fun toContact(user: UserEntity, status: String, since: Instant?, contact: GroupContact?) =
        toContact(user, status, since, contact?.groups.orEmpty())

    private fun toContact(user: UserEntity, status: String, since: Instant?, groups: List<SharedGroup>) = FriendContactDto(
        userId = user.id.toString(),
        displayName = user.displayName,
        friendStatus = status,
        since = since,
        sharedGroups = groups.map { SharedGroupDto(id = it.id.toString(), name = it.name) },
        canMessage = status == STATUS_FRIEND || groups.isNotEmpty()
    )

    private fun List<FriendContactDto>.sortedByName() = sortedBy { it.displayName.lowercase() }

    private fun notFound(userId: UUID) = ResourceNotFoundException(Msg("error.user.notFound", userId), ErrorCode.NOT_FOUND)

    companion object {
        const val STATUS_FRIEND = "friend"
        const val STATUS_INCOMING = "incoming"
        const val STATUS_OUTGOING = "outgoing"
        const val STATUS_NONE = "none"

        /** Sortierte Konto-IDs, gleich aufgebaut wie der Schlüssel der Direktnachrichten. */
        fun pairKey(a: UUID, b: UUID): String = listOf(a, b).map { it.toString() }.sorted().joinToString(":")
    }
}
