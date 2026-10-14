package de.maurer.baseservice.config

import de.maurer.baseservice.security.JwtAuthConverter
import de.maurer.baseservice.security.RestAccessDeniedHandler
import de.maurer.baseservice.security.RestAuthenticationEntryPoint
import de.maurer.baseservice.security.UserRole
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
@EnableConfigurationProperties(CorsProperties::class)
class SecurityConfig(
    private val jwtAuthConverter: JwtAuthConverter,
    private val restAuthenticationEntryPoint: RestAuthenticationEntryPoint,
    private val restAccessDeniedHandler: RestAccessDeniedHandler,
    private val corsProperties: CorsProperties
) {

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .csrf { it.disable() }
            .cors { it.configurationSource(corsConfigurationSource()) }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .exceptionHandling {
                it.authenticationEntryPoint(restAuthenticationEntryPoint)
                it.accessDeniedHandler(restAccessDeniedHandler)
            }
            .authorizeHttpRequests { authorize ->
                authorize
                    // Compose- und Kubernetes-Healthchecks bleiben ohne Authentifizierung erreichbar
                    .requestMatchers(
                        "/actuator/health",
                        "/actuator/health/liveness",
                        "/actuator/health/readiness",
                        "/actuator/info"
                    ).permitAll()
                    // Alle weiteren Actuator-Endpunkte nur mit Adminrolle
                    .requestMatchers("/actuator/**").hasRole(UserRole.ADMIN.uppercase())
                    .requestMatchers(
                        "/api/v1/health",
                        "/api/v1/info",
                        "/api/v1/auth/access/guest",
                        "/api/v1/invites/accept",
                        // Registrierung per Einladungslink: das Token im Body ist das Geheimnis
                        "/api/v1/member-invites/preview",
                        "/api/v1/member-invites/register",
                        // Gast-Chat: das eventgebundene Gast-Token im Header ist das Geheimnis
                        "/api/v1/events/*/chat/guest/**",
                        "/v3/api-docs/**",
                        "/swagger-ui/**",
                        "/swagger-ui.html"
                    ).permitAll()
                    // Deny by default: all other endpoints require explicit authentication
                    .anyRequest().authenticated()
            }
            .oauth2ResourceServer { oauth2 ->
                oauth2.jwt { jwt ->
                    jwt.jwtAuthenticationConverter(jwtAuthConverter)
                }
                oauth2.authenticationEntryPoint(restAuthenticationEntryPoint)
                oauth2.accessDeniedHandler(restAccessDeniedHandler)
            }

        return http.build()
    }

    @Bean
    fun corsConfigurationSource(): CorsConfigurationSource {
        val origins = corsProperties.sanitizedOrigins()
        val configuration = CorsConfiguration().apply {
            allowedOrigins = origins
            allowedMethods = corsProperties.allowedMethods
            allowedHeaders = corsProperties.allowedHeaders
            exposedHeaders = corsProperties.exposedHeaders
            // Credentials ausschließlich für die explizit konfigurierten eigenen Ursprünge
            allowCredentials = corsProperties.allowCredentials && origins.isNotEmpty()
            maxAge = corsProperties.maxAgeSeconds
        }

        return UrlBasedCorsConfigurationSource().apply {
            registerCorsConfiguration("/api/**", configuration)
        }
    }
}
