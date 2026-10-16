package de.maurer.baseservice.service

import de.maurer.baseservice.domain.StammtischEntity
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.dto.PlatformStammtischDto
import de.maurer.baseservice.dto.UpdatePlatformStammtischRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.tenancy.StammtischSeeder
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.stereotype.Service
import java.util.UUID

/**
 * Plattform-Administration: Stammtische anlegen, umbenennen und archivieren.
 *
 * Plattform-Admins sind Personen mit der Keycloak-Realm-Rolle `admin`. Sie
 * sehen nur Name, Status und Mitgliederzahl jedes Stammtischs, keine Inhalte;
 * in einen Stammtisch hinein kommen auch sie nur als dessen Mitglied.
 */
@Service
class PlatformService(
    private val stammtischRepository: StammtischRepository,
    private val memberRepository: StammtischMemberRepository,
    private val userRepository: UserRepository,
    private val userService: UserService,
    private val membershipService: MembershipService,
    private val seeder: StammtischSeeder,
    private val auditService: AuditService,
    private val tenantTransactions: TenantTransactions
) {

    fun list(principal: UserPrincipal): List<PlatformStammtischDto> {
        requirePlatformAdmin(principal)
        val stammtische = tenantTransactions.readAsSystem { stammtischRepository.findAllByOrderByNameAsc() }
        return stammtische.map { toDto(it) }
    }

    /**
     * Legt einen Stammtisch mit Systemrollen und Moment-Startbestand an. Admin
     * wird das Konto zu `adminEmail`, sonst die anlegende Person.
     */
    fun create(request: CreateStammtischRequest, principal: UserPrincipal): PlatformStammtischDto {
        requirePlatformAdmin(principal)
        val name = requireName(request.name)
        val creator = TenantContext.runWithoutTenant { userService.getOrCreateUser(principal) }
        val admin = request.adminEmail?.trim()?.takeIf { it.isNotEmpty() }?.let { email ->
            tenantTransactions.readAsSystem { userRepository.findFirstByEmailIgnoreCase(email).orElse(null) }
                ?.takeIf { !it.disabled }
        } ?: creator

        val stammtisch = tenantTransactions.asSystem {
            stammtischRepository.saveAndFlush(StammtischEntity(name = name))
        }
        tenantTransactions.inStammtisch(stammtisch.id) {
            seeder.seed()
            membershipService.addMember(admin, setOf(UserRole.MEMBER, UserRole.ADMIN))
            auditService.recordStammtischChange(
                creator,
                AuditService.ACTION_STAMMTISCH_CREATED,
                stammtisch.id,
                "name=$name; admin=${admin.id}"
            )
        }
        return toDto(stammtisch)
    }

    fun update(id: UUID, request: UpdatePlatformStammtischRequest, principal: UserPrincipal): PlatformStammtischDto {
        requirePlatformAdmin(principal)
        val updated = tenantTransactions.asSystem {
            val stammtisch = stammtischRepository.findById(id).orElseThrow {
                ResourceNotFoundException(Msg("error.stammtisch.notFound"), ErrorCode.NOT_FOUND)
            }
            request.name?.let { stammtisch.name = requireName(it) }
            request.archived?.let { stammtisch.archived = it }
            stammtischRepository.saveAndFlush(stammtisch)
        }
        return toDto(updated)
    }

    private fun toDto(stammtisch: StammtischEntity) = PlatformStammtischDto(
        id = stammtisch.id.toString(),
        name = stammtisch.name,
        archived = stammtisch.archived,
        memberCount = tenantTransactions.readInStammtisch(stammtisch.id) { memberRepository.countByActiveTrue() },
        createdAt = stammtisch.createdAt
    )

    private fun requireName(value: String?): String {
        val name = value?.trim().orEmpty()
        if (name.isBlank()) {
            throw InvalidRequestException(Msg("error.stammtisch.nameBlank"), ErrorCode.INVALID_REQUEST)
        }
        return name.take(StammtischService.MAX_NAME_LENGTH)
    }

    private fun requirePlatformAdmin(principal: UserPrincipal) {
        if (!principal.platformAdmin) {
            throw AccessDeniedException(Msg("error.stammtisch.platformAdminRequired"), ErrorCode.ACCESS_DENIED)
        }
    }
}
