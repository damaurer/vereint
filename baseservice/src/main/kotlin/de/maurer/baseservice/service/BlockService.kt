package de.maurer.baseservice.service

import de.maurer.baseservice.domain.UserBlockEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.BlockedUserDto
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DirectConversationRepository
import de.maurer.baseservice.repository.FriendshipRepository
import de.maurer.baseservice.repository.UserBlockRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.Identifiers
import de.maurer.baseservice.tenancy.SharedGroups
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Blockieren (#153), gilt über alle Gruppen.
 *
 * Wirkung für die blockierende Person: Nachrichten, Moments und Antworten der
 * blockierten Person sind in allen Chats und Moment-Listen ausgeblendet, ihr
 * Direktchat verschwindet aus der Liste, Push-Mitteilungen von ihr kommen
 * nicht mehr. In beide Richtungen gilt: keine Direktnachrichten und keine
 * Freundschaftsanfragen; eine bestehende Freundschaft endet beim Blockieren.
 * Die blockierte Person bekommt keine Mitteilung darüber.
 *
 * Blockieren lässt sich nur, wen man kennt: gemeinsame Gruppe, Freundschaft
 * oder Direktchat. Alle anderen Konten gelten wie bei Freundschaften als
 * „nicht gefunden“.
 */
@Service
@Transactional
class BlockService(
    private val blockRepository: UserBlockRepository,
    private val userRepository: UserRepository,
    private val friendshipRepository: FriendshipRepository,
    private val directConversationRepository: DirectConversationRepository,
    private val sharedGroups: SharedGroups,
    private val userService: UserService
) {

    @Transactional(readOnly = true)
    fun list(principal: UserPrincipal): List<BlockedUserDto> {
        val caller = userService.getOrCreateUser(principal)
        return blockRepository.findByBlockerId(caller.id).mapNotNull { block ->
            block.blocked?.let { BlockedUserDto(it.id.toString(), it.displayName, block.createdAt) }
        }
    }

    fun block(userIdValue: String?, principal: UserPrincipal): BlockedUserDto {
        val caller = userService.getOrCreateUser(principal)
        val targetId = Identifiers.parseUuid(userIdValue, "userId")
        if (targetId == caller.id) {
            throw InvalidRequestException(Msg("error.block.self"), ErrorCode.INVALID_REQUEST)
        }
        val target = requireKnown(caller, targetId)
        val block = blockRepository.findByBlockerIdAndBlockedId(caller.id, target.id).orElse(null)
            ?: blockRepository.save(UserBlockEntity(blocker = caller, blocked = target))
        friendshipRepository.findByPairKey(FriendService.pairKey(caller.id, target.id)).ifPresent {
            friendshipRepository.delete(it)
        }
        return BlockedUserDto(target.id.toString(), target.displayName, block.createdAt)
    }

    fun unblock(userIdValue: String?, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val targetId = Identifiers.parseUuid(userIdValue, "userId")
        blockRepository.findByBlockerIdAndBlockedId(caller.id, targetId).ifPresent { blockRepository.delete(it) }
    }

    /** Personen, die [userId] blockiert hat: deren Inhalte sieht [userId] nicht. */
    @Transactional(readOnly = true)
    fun hiddenFor(userId: UUID): Set<UUID> = blockRepository.findBlockedIds(userId).toSet()

    /** Personen, die [userId] blockiert haben: sie bekommen keine Push-Mitteilungen von [userId]. */
    @Transactional(readOnly = true)
    fun blockersOf(userId: UUID): Set<UUID> = blockRepository.findBlockerIds(userId).toSet()

    /** Ob eine der beiden Personen die andere blockiert hat. */
    @Transactional(readOnly = true)
    fun blockedEitherWay(a: UUID, b: UUID): Boolean = blockRepository.existsEitherWay(a, b)

    private fun requireKnown(caller: UserEntity, targetId: UUID): UserEntity {
        val known = sharedGroups.between(caller.id, targetId).isNotEmpty() ||
            friendshipRepository.findByPairKey(FriendService.pairKey(caller.id, targetId)).isPresent ||
            directConversationRepository.findByPairKey(FriendService.pairKey(caller.id, targetId)).isPresent
        val target = userRepository.findById(targetId).orElse(null)
        if (!known || target == null) {
            throw ResourceNotFoundException(Msg("error.user.notFound", targetId), ErrorCode.NOT_FOUND)
        }
        return target
    }
}
