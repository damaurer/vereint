package de.maurer.baseservice.tenancy

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ApiProblem
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.ErrorMessageResolver
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.web.RequestIdFilter
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

/**
 * Legt für jede angemeldete Anfrage den Stammtisch fest.
 *
 * 1. Der BFF schickt den gewählten Stammtisch im Header `X-Stammtisch-Id`.
 *    Fehlt er und ist die Person in genau einem Stammtisch, gilt dieser.
 * 2. Ist die Person dort kein aktives Mitglied, antwortet der Filter mit `403`.
 * 3. Die Rollen und Berechtigungen im Principal werden durch die des
 *    Stammtischs ersetzt. Keycloak-Rollen aus dem Token zählen nicht mehr; nur
 *    die Realm-Rolle `admin` wird zur Plattform-Administration.
 * 4. Fachliche Endpunkte ohne Stammtisch beantwortet der Filter mit `409`.
 *    Nur die in [isStammtischFree] gelisteten Pfade laufen ohne Stammtisch.
 */
@Component
class StammtischContextFilter(
    private val userService: UserService,
    private val memberships: StammtischMemberships,
    private val messages: ErrorMessageResolver
) : OncePerRequestFilter() {

    private val objectMapper: ObjectMapper = jacksonObjectMapper().findAndRegisterModules()

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val authentication = SecurityContextHolder.getContext().authentication as? JwtAuthenticationToken
        val tokenPrincipal = authentication?.details as? UserPrincipal
        if (authentication == null || tokenPrincipal == null) {
            TenantContext.runWithoutTenant { chain.doFilter(request, response) }
            return
        }

        val requested = request.getHeader(HEADER)?.trim()?.takeIf { it.isNotEmpty() }?.let { value ->
            runCatching { UUID.fromString(value) }.getOrElse {
                writeProblem(request, response, HttpStatus.BAD_REQUEST, ErrorCode.INVALID_REQUEST, "error.stammtisch.accessDenied")
                return
            }
        }

        val platformAdmin = tokenPrincipal.roles.contains(UserRole.ADMIN)
        val user = try {
            TenantContext.runWithoutTenant { userService.getOrCreateUser(tokenPrincipal) }
        } catch (ex: ApiException) {
            // Deaktivierte Konten erhalten keinerlei Rechte; die Endpunkte melden den Grund.
            null
        }
        val available = user?.let { memberships.memberships(it.id) }.orEmpty()
        val selected = when {
            requested != null -> available.firstOrNull { it.stammtischId == requested } ?: run {
                writeProblem(
                    request, response, HttpStatus.FORBIDDEN,
                    ErrorCode.STAMMTISCH_ACCESS_DENIED, "error.stammtisch.accessDenied"
                )
                return
            }
            available.size == 1 -> available.single()
            else -> null
        }

        if (selected == null && user != null && !isStammtischFree(request)) {
            writeProblem(request, response, HttpStatus.CONFLICT, ErrorCode.STAMMTISCH_REQUIRED, "error.stammtisch.required")
            return
        }

        val principal = tokenPrincipal.copy(
            roles = selected?.roles.orEmpty(),
            permissions = selected?.permissions.orEmpty(),
            boardRole = selected?.boardRole,
            drinkRecorder = selected?.roles?.contains(RolePermissionMatrix.ROLE_TABLET_RECORDER) == true,
            eventScopes = emptySet(),
            platformAdmin = platformAdmin,
            stammtischId = selected?.stammtischId?.toString()
        )
        val context = SecurityContextHolder.getContext()
        val previousAuthentication = context.authentication
        context.authentication = JwtAuthenticationToken(authentication.token, authoritiesOf(principal), principal.subject)
            .apply { details = principal }

        val run = { chain.doFilter(request, response) }
        try {
            if (selected != null) TenantContext.runIn(selected.stammtischId, run) else TenantContext.runWithoutTenant(run)
        } finally {
            context.authentication = previousAuthentication
        }
    }

    private fun authoritiesOf(principal: UserPrincipal): Collection<GrantedAuthority> {
        val authorities = mutableSetOf<GrantedAuthority>()
        principal.roles.forEach { authorities.add(SimpleGrantedAuthority("ROLE_${it.uppercase()}")) }
        principal.permissions.forEach { authorities.add(SimpleGrantedAuthority("SCOPE_$it")) }
        if (principal.platformAdmin) authorities.add(SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))
        return authorities
    }

    private fun writeProblem(
        request: HttpServletRequest,
        response: HttpServletResponse,
        status: HttpStatus,
        code: String,
        messageKey: String
    ) {
        val traceId = RequestIdFilter.currentTraceId(request)
        val body = ApiProblem.asMap(
            status = status,
            code = code,
            message = messages.resolve(messageKey, request),
            instance = request.requestURI,
            traceId = traceId
        )
        response.status = status.value()
        response.contentType = MediaType.APPLICATION_PROBLEM_JSON_VALUE
        response.characterEncoding = "UTF-8"
        response.setHeader(RequestIdFilter.HEADER_NAME, traceId)
        response.writer.write(objectMapper.writeValueAsString(body))
    }

    companion object {
        const val HEADER = "X-Stammtisch-Id"

        /** Endpunkte, die ohne gewählten Stammtisch funktionieren (Konto, Plattform, Push-Geräte). */
        private val STAMMTISCH_FREE_PREFIXES = listOf(
            "/api/v1/auth/",
            "/api/v1/stammtische",
            "/api/v1/platform/",
            "/api/v1/drink-library",
            "/api/v1/member-invites/preview",
            "/api/v1/member-invites/register",
            "/api/v1/member-invites/join",
            "/api/v1/notifications/vapid-public-key",
            "/api/v1/notifications/subscriptions",
            "/api/v1/health",
            "/api/v1/info",
            "/actuator/"
        )

        private val STAMMTISCH_FREE_EXACT = setOf("/api/v1/auth", "/api/v1/users/me")

        fun isStammtischFree(request: HttpServletRequest): Boolean {
            val path = request.requestURI.removePrefix(request.contextPath)
            if (!path.startsWith("/api/") && !path.startsWith("/actuator")) return true
            return path in STAMMTISCH_FREE_EXACT || STAMMTISCH_FREE_PREFIXES.any { path.startsWith(it) }
        }
    }
}
