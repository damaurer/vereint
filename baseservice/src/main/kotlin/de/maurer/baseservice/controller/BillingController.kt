package de.maurer.baseservice.controller

import de.maurer.baseservice.billing.BillingService
import de.maurer.baseservice.billing.StammtischExportService
import de.maurer.baseservice.billing.StripeWebhookService
import de.maurer.baseservice.dto.BillingCheckoutRequest
import de.maurer.baseservice.dto.BillingOverviewDto
import de.maurer.baseservice.dto.BillingRedirectDto
import de.maurer.baseservice.security.AuthContext
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** Tarif des aktuellen Stammtischs, Zahlung über Stripe und Datenexport. */
@RestController
@RequestMapping("/api/v1/stammtisch")
@Tag(name = "Abrechnung", description = "Tarif, Zahlung und Datenexport des aktuellen Stammtischs")
class BillingController(
    private val billingService: BillingService,
    private val exportService: StammtischExportService,
    private val authContext: AuthContext
) {

    @GetMapping("/billing")
    @Operation(summary = "Tarif, Grenzen und Verbrauch", description = "Für alle Mitglieder lesbar")
    fun overview(): ResponseEntity<BillingOverviewDto> =
        ResponseEntity.ok(billingService.overview(authContext.getRequiredPrincipal()))

    @PostMapping("/billing/checkout")
    @Operation(summary = "Tarif buchen", description = "Liefert die Stripe-Zahlungsseite; erfordert billing.manage")
    fun checkout(@RequestBody request: BillingCheckoutRequest): ResponseEntity<BillingRedirectDto> =
        ResponseEntity.ok(billingService.checkout(request, authContext.getRequiredPrincipal()))

    @PostMapping("/billing/portal")
    @Operation(summary = "Zahlungsportal", description = "Zahlart, Rechnungen, Tarif wechseln oder kündigen; erfordert billing.manage")
    fun portal(): ResponseEntity<BillingRedirectDto> =
        ResponseEntity.ok(billingService.portal(authContext.getRequiredPrincipal()))

    @PostMapping("/billing/supporter")
    @Operation(summary = "Förderbeitrag", description = "Optionaler monatlicher Beitrag einer Person")
    fun supporter(): ResponseEntity<BillingRedirectDto> =
        ResponseEntity.ok(billingService.supporterCheckout(authContext.getRequiredPrincipal()))

    @GetMapping("/export")
    @Operation(summary = "Datenexport (JSON)", description = "Erfordert stammtisch.manage oder billing.manage")
    fun export(): ResponseEntity<Map<String, Any?>> {
        val export = exportService.export(authContext.getRequiredPrincipal())
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .header(
                HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment().filename(export.fileName).build().toString()
            )
            .body(export.content)
    }
}

/** Stripe-Webhooks. Öffentlich erreichbar; geschützt durch die Signaturprüfung. */
@RestController
@RequestMapping("/api/v1/billing/stripe")
@Tag(name = "Abrechnung")
class StripeWebhookController(private val webhookService: StripeWebhookService) {

    @PostMapping("/webhook")
    @Operation(summary = "Stripe-Webhook")
    fun webhook(
        @RequestBody payload: ByteArray,
        @RequestHeader(name = "Stripe-Signature", required = false) signature: String?
    ): ResponseEntity<Void> {
        webhookService.handle(payload, signature)
        return ResponseEntity.ok().build()
    }
}
