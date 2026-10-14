package de.maurer.baseservice.config

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling

/**
 * Hintergrundaufgaben (z. B. Event-Einladungen und -Erinnerungen). In Tests
 * mit `vereint.scheduling.enabled=false` abschaltbar, damit nichts zeitgesteuert
 * dazwischenfunkt.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "vereint.scheduling", name = ["enabled"], havingValue = "true", matchIfMissing = true)
class SchedulingConfig
