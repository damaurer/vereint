package de.maurer.baseservice.service

import de.maurer.baseservice.billing.PlanLimits
import de.maurer.baseservice.domain.StammtischMemberEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.domain.UserRoleEntity
import de.maurer.baseservice.domain.UserRoleId
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischRoleRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Mitgliedschaften im aktuellen Stammtisch anlegen und beenden.
 *
 * Aufrufer laufen immer im Stammtisch-Kontext; Hibernate setzt
 * `stammtisch_id` der neuen Zeilen selbst.
 */
@Service
@Transactional
class MembershipService(
    private val memberRepository: StammtischMemberRepository,
    private val roleRepository: StammtischRoleRepository,
    private val userRoleRepository: UserRoleRepository,
    private val planLimits: PlanLimits
) {

    /**
     * Nimmt die Person in den aktuellen Stammtisch auf (oder reaktiviert eine
     * beendete Mitgliedschaft) und vergibt zusätzlich [roles]. Bestehende
     * Rollen bleiben erhalten. Liefert `true`, wenn die Person vorher kein
     * aktives Mitglied war. Neue Mitglieder zählen gegen die Grenze des Tarifs.
     */
    fun addMember(user: UserEntity, roles: Set<String> = setOf(UserRole.MEMBER)): Boolean {
        TenantContext.requireStammtischId()
        val existing = memberRepository.findByUserId(user.id).orElse(null)
        val wasActive = existing?.active == true
        if (!wasActive) planLimits.requireMemberSlot()
        val member = existing ?: StammtischMemberEntity(user = user)
        member.active = true
        memberRepository.save(member)

        val known = roleRepository.findAll().map { it.code }.toSet()
        val current = userRoleRepository.findByIdUserId(user.id).map { it.id.role }.toSet()
        roles.filter { it in known && it !in current }.forEach { role ->
            userRoleRepository.save(UserRoleEntity(UserRoleId(user.id, role), user))
        }
        userRoleRepository.flush()
        return !wasActive
    }

    /** Beendet die Mitgliedschaft; Buchungen und Verläufe bleiben erhalten, Rollen entfallen. */
    fun deactivate(user: UserEntity) {
        val member = memberRepository.findByUserId(user.id).orElse(null) ?: return
        member.active = false
        memberRepository.save(member)
        userRoleRepository.deleteByIdUserId(user.id)
        userRoleRepository.flush()
    }

    @Transactional(readOnly = true)
    fun isActiveMember(user: UserEntity): Boolean = memberRepository.isActiveMember(user.id)

    @Transactional(readOnly = true)
    fun membership(user: UserEntity): StammtischMemberEntity? = memberRepository.findByUserId(user.id).orElse(null)
}
