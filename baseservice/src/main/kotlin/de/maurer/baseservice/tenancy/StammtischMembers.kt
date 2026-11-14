package de.maurer.baseservice.tenancy

import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.UserRepository
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Personen des aktuellen Stammtischs.
 *
 * Konten (`users`) gelten für alle Stammtische. Wo eine Anfrage eine Person per
 * Id nennt (einladen, Guthaben buchen, Direktnachricht), muss sie über diese
 * Klasse gehen: Wer kein aktives Mitglied dieses Stammtischs ist, gilt als
 * „nicht gefunden“, damit keine Konten anderer Stammtische sichtbar werden.
 */
@Component
class StammtischMembers(
    private val memberRepository: StammtischMemberRepository,
    private val userRepository: UserRepository
) {

    /** Aktive Mitglieder mit aktivem Konto, nach Namen sortiert. */
    fun activeUsers(): List<UserEntity> =
        memberRepository.findByActiveTrue()
            .mapNotNull { it.user }
            .filter { !it.disabled }
            .sortedBy { it.displayName.lowercase() }

    fun activeUserIds(): Set<UUID> = memberRepository.findActiveUserIds().toSet()

    fun isActiveMember(userId: UUID): Boolean = memberRepository.isActiveMember(userId)

    /** Konto eines aktiven Mitglieds oder `404`. */
    fun requireActiveUser(userId: UUID): UserEntity {
        if (!memberRepository.isActiveMember(userId)) throw notFound(userId)
        return userRepository.findById(userId).orElseThrow { notFound(userId) }
    }

    /**
     * Konto einer Person, die irgendwann Mitglied dieses Stammtischs war (auch
     * ausgetreten). Für Buchungen und Verläufe, die erhalten bleiben.
     */
    fun requireKnownUser(userId: UUID): UserEntity {
        if (memberRepository.findByUserId(userId).isEmpty) throw notFound(userId)
        return userRepository.findById(userId).orElseThrow { notFound(userId) }
    }

    fun requireActiveUsers(userIds: Collection<UUID>): List<UserEntity> {
        val ids = userIds.distinct()
        val members = activeUserIds()
        ids.firstOrNull { it !in members }?.let { throw notFound(it) }
        val found = userRepository.findAllById(ids)
        if (found.size != ids.size) throw notFound((ids - found.map { it.id }.toSet()).first())
        return found
    }

    private fun notFound(userId: UUID) = ResourceNotFoundException(Msg("error.user.notFound", userId), ErrorCode.NOT_FOUND)
}
