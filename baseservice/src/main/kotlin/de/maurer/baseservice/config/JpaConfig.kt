package de.maurer.baseservice.config

import org.springframework.context.annotation.Configuration
import org.springframework.data.jpa.repository.config.EnableJpaAuditing

/**
 * Aktiviert JPA-Auditing, damit `createdAt`/`updatedAt` nicht mehr imperativ
 * gepflegt werden müssen (`@CreatedDate`/`@LastModifiedDate`).
 */
@Configuration
@EnableJpaAuditing
class JpaConfig
