package de.maurer.baseservice.security

import org.springframework.core.convert.converter.Converter
import org.springframework.security.authentication.AbstractAuthenticationToken
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

@Component
class JwtAuthConverter(
    private val claimExtractor: JwtClaimExtractor
) : Converter<Jwt, AbstractAuthenticationToken> {

    override fun convert(jwt: Jwt): AbstractAuthenticationToken {
        val principal = claimExtractor.toPrincipal(jwt)
        val authorities = toAuthorities(principal)

        return JwtAuthenticationToken(jwt, authorities, principal.subject).apply {
            details = principal
        }
    }

    private fun toAuthorities(principal: UserPrincipal): Collection<GrantedAuthority> {
        val authorities = mutableSetOf<GrantedAuthority>()

        principal.roles.forEach { role ->
            authorities.add(SimpleGrantedAuthority("ROLE_${role.uppercase()}"))
        }

        principal.permissions.forEach { permission ->
            authorities.add(SimpleGrantedAuthority("SCOPE_$permission"))
        }

        return authorities
    }
}
