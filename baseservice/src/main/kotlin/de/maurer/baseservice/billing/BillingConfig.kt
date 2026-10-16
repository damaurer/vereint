package de.maurer.baseservice.billing

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
@EnableConfigurationProperties(BillingProperties::class)
class BillingConfig {

    private val log = LoggerFactory.getLogger(BillingConfig::class.java)

    @Bean
    fun stripeClient(properties: BillingProperties, objectMapper: ObjectMapper): StripeClient {
        if (properties.stripeEnabled && !properties.configured) {
            log.warn("vereint.billing.stripe-enabled=true, aber Secret-Key oder Webhook-Secret fehlt; Online-Zahlung deaktiviert")
        }
        return StripeClient(properties, objectMapper)
    }
}
