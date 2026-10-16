package de.maurer.baseservice.service

import de.maurer.baseservice.billing.PlanLimits
import de.maurer.baseservice.domain.MemberInviteEntity
import de.maurer.baseservice.domain.MemberInviteRedemptionEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateMemberInviteRequest
import de.maurer.baseservice.dto.CreateMemberInviteResponse
import de.maurer.baseservice.dto.JoinStammtischResponse
import de.maurer.baseservice.dto.MemberInviteDto
import de.maurer.baseservice.dto.MemberInvitePreviewDto
import de.maurer.baseservice.dto.RegisterMemberRequest
import de.maurer.baseservice.dto.RegisterMemberResponse
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.EmailAlreadyRegisteredException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.InvitationExpiredException
import de.maurer.baseservice.error.InvitationRevokedException
import de.maurer.baseservice.error.InvitationUsedUpException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.identity.IdentityProvisioner
import de.maurer.baseservice.identity.NewAccount
import de.maurer.baseservice.repository.MemberInviteRedemptionRepository
import de.maurer.baseservice.repository.MemberInviteRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.support.SecureTokens
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantLookup
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Einladungslinks, mit denen sich neue Personen selbst als Mitglied registrieren.
 *
 * - Ein Link gehört zu genau einem Stammtisch. Erzeugen, Auflisten und
 *   Widerrufen erfordert dort `members.invite` (Standard: Vorstand und Admin).
 * - Der Link trägt ein zufälliges 256-Bit-Token; gespeichert wird nur dessen
 *   SHA-256-Hash. Er ist zeitlich begrenzt, hat eine Nutzungsgrenze (Standard 1)
 *   und lässt sich widerrufen.
 * - Registrieren kann man sich nur mit einem gültigen Token. Das neue Konto
 *   wird Mitglied dieses einen Stammtischs mit ausschließlich der Rolle
 *   `member`; Rollen aus der Anfrage gibt es nicht.
 * - Wer schon ein Konto hat, tritt mit demselben Link angemeldet bei ([join]).
 *
 * Die Registrierung sperrt die Einladung (`SELECT … FOR UPDATE`), legt das
 * Keycloak-Konto an und schreibt Profil, Rolle und Einlösung in derselben
 * Transaktion. Scheitert danach etwas, wird das Keycloak-Konto wieder gelöscht,
 * damit kein Login ohne Einladung übrig bleibt.
 */
@Service
class MemberInviteService(
    private val memberInviteRepository: MemberInviteRepository,
    private val redemptionRepository: MemberInviteRedemptionRepository,
    private val userRepository: UserRepository,
    private val stammtischRepository: StammtischRepository,
    private val membershipService: MembershipService,
    private val access: StammtischAccess,
    private val tenantLookup: TenantLookup,
    private val userService: UserService,
    private val auditService: AuditService,
    private val identityProvisioner: IdentityProvisioner,
    private val planLimits: PlanLimits,
    private val termsConsent: TermsConsent,
    transactionManager: PlatformTransactionManager,
    private val clock: Clock = Clock.systemUTC()
) {

    private val log = LoggerFactory.getLogger(MemberInviteService::class.java)
    private val transactionTemplate = TransactionTemplate(transactionManager)

    @Transactional
    fun createInvite(request: CreateMemberInviteRequest, principal: UserPrincipal): CreateMemberInviteResponse {
        val caller = requireBoardOrAdmin(principal)

        val rawToken = SecureTokens.generateToken()
        val days = request.expiresInDays ?: DEFAULT_EXPIRY_DAYS
        val invite = memberInviteRepository.save(
            MemberInviteEntity(
                tokenHash = SecureTokens.sha256Hex(rawToken),
                label = request.label?.trim()?.ifBlank { null },
                createdBy = caller,
                maxUses = request.maxUses ?: DEFAULT_MAX_USES,
                usesCount = 0,
                expiresAt = Instant.now(clock).plus(Duration.ofDays(days.toLong()))
            )
        )
        log.info("member_invite created id={} by={} maxUses={} expiresAt={}", invite.id, caller.id, invite.maxUses, invite.expiresAt)

        return CreateMemberInviteResponse(
            invite = toDto(invite, emptyList()),
            token = rawToken,
            registerPath = "$REGISTER_PATH_PREFIX$rawToken"
        )
    }

    @Transactional(readOnly = true)
    fun listInvites(principal: UserPrincipal): List<MemberInviteDto> {
        requireBoardOrAdmin(principal)

        val invites = memberInviteRepository.findAllByOrderByCreatedAtDesc().take(MAX_LISTED)
        val redemptions = if (invites.isEmpty()) {
            emptyMap()
        } else {
            redemptionRepository.findByInviteIdIn(invites.map { it.id })
                .sortedBy { it.redeemedAt }
                .groupBy({ it.invite!!.id }, { it.user?.displayName.orEmpty() })
        }
        return invites.map { toDto(it, redemptions[it.id].orEmpty()) }
    }

    @Transactional
    fun revokeInvite(id: UUID, principal: UserPrincipal): MemberInviteDto {
        val caller = requireBoardOrAdmin(principal)
        val invite = memberInviteRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.memberInvite.notFoundById", id), ErrorCode.NOT_FOUND)
        }
        if (!invite.revoked) {
            invite.revokedAt = Instant.now(clock)
            invite.revokedBy = caller
            memberInviteRepository.save(invite)
            log.info("member_invite revoked id={} by={}", invite.id, caller.id)
        }
        val registered = redemptionRepository.findByInviteIdIn(listOf(invite.id)).map { it.user?.displayName.orEmpty() }
        return toDto(invite, registered)
    }

    /** Öffentliche Prüfung, ob ein Link noch nutzbar ist (ohne ihn zu verbrauchen). */
    fun preview(rawToken: String?): MemberInvitePreviewDto {
        val tokenHash = hashOf(rawToken)
        return inStammtischOf(rawToken) { stammtischId ->
            transactionTemplate.execute {
                val invite = memberInviteRepository.findByTokenHash(tokenHash).orElseThrow { notFound() }
                requireUsable(invite)
                MemberInvitePreviewDto(
                    expiresAt = invite.expiresAt,
                    stammtischName = stammtischRepository.findById(stammtischId).map { it.name }.orElse("")
                )
            }!!
        }
    }

    /**
     * Angemeldete Person mit bestehendem Konto tritt dem Stammtisch des Links
     * bei. Wer schon Mitglied ist, verbraucht den Link nicht.
     */
    fun join(rawToken: String?, principal: UserPrincipal): JoinStammtischResponse {
        val tokenHash = hashOf(rawToken)
        val user = TenantContext.runWithoutTenant { userService.getOrCreateUser(principal) }
        return inStammtischOf(rawToken) { stammtischId ->
            transactionTemplate.execute {
                val invite = memberInviteRepository.findByTokenHashForUpdate(tokenHash).orElseThrow { notFound() }
                val name = stammtischRepository.findById(stammtischId).map { it.name }.orElse("")
                if (membershipService.isActiveMember(user)) {
                    return@execute JoinStammtischResponse(stammtischId.toString(), name, alreadyMember = true)
                }
                requireUsable(invite)
                membershipService.addMember(user)
                if (redemptionRepository.findByInviteIdIn(listOf(invite.id)).none { it.user?.id == user.id }) {
                    redemptionRepository.save(
                        MemberInviteRedemptionEntity(invite = invite, user = user, redeemedAt = Instant.now(clock))
                    )
                }
                invite.usesCount += 1
                memberInviteRepository.save(invite)
                auditService.recordUserChange(
                    invite.createdBy,
                    AuditService.ACTION_MEMBER_JOINED,
                    user.id,
                    null,
                    "invite=${invite.id}; roles=${UserRole.MEMBER}"
                )
                JoinStammtischResponse(stammtischId.toString(), name, alreadyMember = false)
            }!!
        }
    }

    /** Löst den Stammtisch des Links auf; unbekannte Links ergeben `404`. */
    private fun <T> inStammtischOf(rawToken: String?, block: (UUID) -> T): T {
        hashOf(rawToken)
        val stammtischId = tenantLookup.forMemberInviteToken(rawToken!!) ?: throw notFound()
        return TenantContext.runIn(stammtischId) { block(stammtischId) }
    }

    /**
     * Registriert eine neue Person als Mitglied. Unauthentifiziert; das Token
     * ist das Geheimnis.
     */
    fun register(request: RegisterMemberRequest): RegisterMemberResponse {
        val email = request.email?.trim()?.lowercase().orEmpty()
        val firstName = request.firstName?.trim().orEmpty()
        val lastName = request.lastName?.trim().orEmpty()
        val password = request.password.orEmpty()
        if (email.isEmpty() || firstName.isEmpty() || lastName.isEmpty()) {
            throw InvalidRequestException(Msg("error.memberInvite.fieldsRequired"), ErrorCode.INVALID_REQUEST)
        }
        if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
            throw InvalidRequestException(
                Msg("error.memberInvite.passwordLength", MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH),
                ErrorCode.INVALID_REQUEST
            )
        }
        termsConsent.require(request.acceptTerms)
        val tokenHash = hashOf(request.token)

        var createdSubject: String? = null
        try {
            return inStammtischOf(request.token) { stammtischId -> transactionTemplate.execute {
                val invite = memberInviteRepository.findByTokenHashForUpdate(tokenHash).orElseThrow { notFound() }
                requireUsable(invite)
                // Vor dem Anlegen des Kontos: ein voller Stammtisch nimmt niemanden auf.
                planLimits.requireMemberSlot()

                if (userRepository.existsByEmailIgnoreCase(email)) {
                    throw EmailAlreadyRegisteredException()
                }

                val subject = identityProvisioner.createAccount(NewAccount(email, firstName, lastName, password))
                createdSubject = subject

                val user = userRepository.saveAndFlush(
                    UserEntity(
                        id = UUID.randomUUID(),
                        keycloakSubject = subject,
                        displayName = "$firstName $lastName",
                        email = email,
                        disabled = false
                    ).also(termsConsent::record)
                )
                membershipService.addMember(user)
                redemptionRepository.save(
                    MemberInviteRedemptionEntity(invite = invite, user = user, redeemedAt = Instant.now(clock))
                )
                invite.usesCount += 1
                memberInviteRepository.save(invite)

                auditService.recordUserChange(
                    invite.createdBy,
                    AuditService.ACTION_MEMBER_REGISTERED,
                    user.id,
                    null,
                    "invite=${invite.id}; roles=${UserRole.MEMBER}"
                )
                RegisterMemberResponse(
                    email = email,
                    displayName = user.displayName,
                    stammtischId = stammtischId.toString()
                )
            }!! }
        } catch (ex: RuntimeException) {
            createdSubject?.let { subject ->
                try {
                    identityProvisioner.deleteAccount(subject)
                    log.warn("member_invite registration rolled back; keycloak account removed subject={}", subject)
                } catch (cleanup: RuntimeException) {
                    log.error(
                        "member_invite registration rolled back but keycloak account could not be removed subject={}",
                        subject
                    )
                }
            }
            throw ex
        }
    }

    private fun hashOf(rawToken: String?): String {
        val token = rawToken?.trim()
        if (token.isNullOrEmpty() || token.length > MAX_TOKEN_LENGTH) throw notFound()
        return SecureTokens.sha256Hex(token)
    }

    // Neutrale Meldung ohne Tokenwert; ungültige Links liefern 404.
    private fun notFound() = ResourceNotFoundException(Msg("error.memberInvite.notFound"), ErrorCode.NOT_FOUND)

    private fun requireUsable(invite: MemberInviteEntity) {
        if (invite.revoked) {
            throw InvitationRevokedException()
        }
        if (invite.isExpired(Instant.now(clock))) {
            throw InvitationExpiredException()
        }
        if (invite.exhausted) {
            throw InvitationUsedUpException()
        }
    }

    private fun requireBoardOrAdmin(principal: UserPrincipal): UserEntity {
        val caller = userService.getOrCreateUser(principal)
        if (!access.has(principal, caller, Permission.MEMBERS_INVITE)) {
            throw AccessDeniedException(
                Msg("error.memberInvite.manageDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
        return caller
    }

    private fun toDto(invite: MemberInviteEntity, registeredMembers: List<String>): MemberInviteDto {
        val status = when {
            invite.revoked -> STATUS_REVOKED
            invite.exhausted -> STATUS_USED
            invite.isExpired(Instant.now(clock)) -> STATUS_EXPIRED
            else -> STATUS_ACTIVE
        }
        return MemberInviteDto(
            id = invite.id.toString(),
            label = invite.label,
            status = status,
            maxUses = invite.maxUses,
            usesCount = invite.usesCount,
            expiresAt = invite.expiresAt,
            createdAt = invite.createdAt,
            createdByName = invite.createdBy?.displayName,
            revokedAt = invite.revokedAt,
            registeredMembers = registeredMembers
        )
    }

    companion object {
        const val DEFAULT_EXPIRY_DAYS = 7
        const val DEFAULT_MAX_USES = 1
        const val MIN_PASSWORD_LENGTH = 10
        const val MAX_PASSWORD_LENGTH = 128
        const val MAX_TOKEN_LENGTH = 256
        const val MAX_LISTED = 200

        /** Das Token steht im Fragment, damit es weder in Server-Logs noch im Referer landet. */
        const val REGISTER_PATH_PREFIX = "/register#"

        const val STATUS_ACTIVE = "active"
        const val STATUS_USED = "used"
        const val STATUS_EXPIRED = "expired"
        const val STATUS_REVOKED = "revoked"
    }
}
