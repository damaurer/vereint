package de.maurer.baseservice

import de.maurer.baseservice.error.*
import de.maurer.baseservice.web.RequestIdFilter
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.context.WebApplicationContext

data class TestValidationPayload(
    @field:NotBlank(message = "name darf nicht leer sein")
    val name: String? = null
)

data class TestLocalizedValidationPayload(
    @field:NotBlank(message = "name {validation.notBlank}")
    val name: String? = null
)

@RestController
@RequestMapping("/api/v1/test-errors")
class TestErrorController {

    @GetMapping("/not-found")
    fun notFound(): Nothing = throw ResourceNotFoundException("Event 42 not found")

    @GetMapping("/permission-denied")
    fun permissionDenied(): Nothing = throw PermissionDeniedException("Missing permission catalog.approve")

    @GetMapping("/idempotency-conflict")
    fun idempotencyConflict(): Nothing = throw IdempotencyConflictException("Transaction already processed")

    @GetMapping("/account-disabled")
    fun accountDisabled(): Nothing = throw AccountDisabledException("User account was suspended")

    @GetMapping("/event-not-active")
    fun eventNotActive(): Nothing = throw EventNotActiveException("Event is closed")

    @GetMapping("/invitation-expired")
    fun invitationExpired(): Nothing = throw InvitationExpiredException("Link is expired")

    @GetMapping("/optimistic-lock")
    fun optimisticLock(): Nothing =
        throw org.springframework.orm.ObjectOptimisticLockingFailureException("UserEntity", "usr-1")

    @GetMapping("/invalid-request")
    fun invalidRequest(): Nothing = throw InvalidRequestException(
        "amount muss größer als 0 sein",
        details = listOf("amount: muss größer als 0 sein")
    )

    @GetMapping("/data-integrity")
    fun dataIntegrity(): Nothing =
        throw org.springframework.dao.DataIntegrityViolationException("duplicate key value violates unique constraint")

    @GetMapping("/ledger-correction-conflict")
    fun ledgerCorrectionConflict(): Nothing =
        throw org.springframework.dao.DataIntegrityViolationException(
            "could not execute statement",
            java.sql.SQLException(
                "ERROR: duplicate key value violates unique constraint \"uk_ledger_entries_reverses_entry\""
            )
        )

    @GetMapping("/constraint-violation")
    fun constraintViolation(): Nothing =
        throw jakarta.validation.ConstraintViolationException("barcode must not be blank", emptySet())

    @GetMapping("/boom")
    fun boom(): Nothing = throw IllegalStateException("unexpected failure that must not leak to the client")

    @GetMapping("/translated")
    fun translated(): Nothing = throw ResourceNotFoundException(Msg("error.event.notFound", "42"))

    @PostMapping("/validate-localized")
    fun validateLocalized(@Valid @RequestBody payload: TestLocalizedValidationPayload): String = payload.name ?: ""

    @PostMapping("/validate")
    fun validate(@Valid @RequestBody payload: TestValidationPayload): String = payload.name ?: ""
}

@SpringBootTest
@ActiveProfiles("test")
class GlobalExceptionHandlerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `handles ResourceNotFoundException as RFC 7807 problem detail`() {
        mockMvc.perform(get("/api/v1/test-errors/not-found").with(jwt()))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.code").value(ErrorCode.NOT_FOUND))
            .andExpect(jsonPath("$.detail").value("Event 42 not found"))
            .andExpect(jsonPath("$.status").value(404))
            .andExpect(jsonPath("$.title").value("Not Found"))
            .andExpect(jsonPath("$.type").value("${ApiProblem.TYPE_BASE}/${ErrorCode.NOT_FOUND}"))
            .andExpect(jsonPath("$.instance").value("/api/v1/test-errors/not-found"))
            .andExpect(jsonPath("$.traceId").exists())
            .andExpect(jsonPath("$.timestamp").exists())
            .andExpect(header().exists(RequestIdFilter.HEADER_NAME))
    }

    @Test
    fun `handles PermissionDeniedException with 403 status`() {
        mockMvc.perform(get("/api/v1/test-errors/permission-denied").with(jwt()))
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.code").value(ErrorCode.PERMISSION_DENIED))
            .andExpect(jsonPath("$.status").value(403))
    }

    @Test
    fun `handles IdempotencyConflictException with 409 status`() {
        mockMvc.perform(get("/api/v1/test-errors/idempotency-conflict").with(jwt()))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value(ErrorCode.IDEMPOTENCY_CONFLICT))
            .andExpect(jsonPath("$.status").value(409))
    }

    @Test
    fun `handles AccountDisabledException with 403 status`() {
        mockMvc.perform(get("/api/v1/test-errors/account-disabled").with(jwt()))
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.code").value(ErrorCode.ACCOUNT_DISABLED))
            .andExpect(jsonPath("$.status").value(403))
    }

    @Test
    fun `handles EventNotActiveException with 400 status`() {
        mockMvc.perform(get("/api/v1/test-errors/event-not-active").with(jwt()))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value(ErrorCode.EVENT_NOT_ACTIVE))
            .andExpect(jsonPath("$.status").value(400))
    }

    @Test
    fun `handles InvitationExpiredException with 410 status`() {
        mockMvc.perform(get("/api/v1/test-errors/invitation-expired").with(jwt()))
            .andExpect(status().isGone)
            .andExpect(jsonPath("$.code").value(ErrorCode.INVITATION_EXPIRED))
            .andExpect(jsonPath("$.status").value(410))
    }

    @Test
    fun `maps optimistic locking conflicts to 409`() {
        mockMvc.perform(get("/api/v1/test-errors/optimistic-lock").with(jwt()))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value(ErrorCode.CONCURRENT_MODIFICATION))
            .andExpect(jsonPath("$.status").value(409))
    }

    @Test
    fun `reports bean validation errors as 400 with field details`() {
        mockMvc.perform(
            post("/api/v1/test-errors/validate")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"  \"}")
                .with(jwt())
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value(ErrorCode.VALIDATION_FAILED))
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.details[0]").value("name: name darf nicht leer sein"))
    }

    @Test
    fun `handles InvalidRequestException with 400 status and detail list`() {
        mockMvc.perform(get("/api/v1/test-errors/invalid-request").with(jwt()))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_REQUEST))
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.details[0]").value("amount: muss größer als 0 sein"))
            .andExpect(jsonPath("$.traceId").exists())
            .andExpect(header().exists(RequestIdFilter.HEADER_NAME))
    }

    @Test
    fun `maps data integrity violations to 409`() {
        mockMvc.perform(get("/api/v1/test-errors/data-integrity").with(jwt()))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value(ErrorCode.DATA_INTEGRITY_VIOLATION))
            .andExpect(jsonPath("$.status").value(409))
    }

    @Test
    fun `maps a concurrent second correction of the same entry to ledger_already_corrected`() {
        mockMvc.perform(get("/api/v1/test-errors/ledger-correction-conflict").with(jwt()))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value(ErrorCode.LEDGER_ALREADY_CORRECTED))
            .andExpect(jsonPath("$.status").value(409))
    }

    @Test
    fun `maps constraint violations to 400 validation failure`() {
        mockMvc.perform(get("/api/v1/test-errors/constraint-violation").with(jwt()))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value(ErrorCode.VALIDATION_FAILED))
            .andExpect(jsonPath("$.status").value(400))
    }

    @Test
    fun `maps unexpected exceptions to 500 without leaking internal details`() {
        mockMvc.perform(get("/api/v1/test-errors/boom").with(jwt()))
            .andExpect(status().isInternalServerError)
            .andExpect(jsonPath("$.code").value(ErrorCode.INTERNAL_ERROR))
            .andExpect(jsonPath("$.status").value(500))
            .andExpect(jsonPath("$.detail").value("Ein interner Serverfehler ist aufgetreten"))
            .andExpect(
                content().string(
                    org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("unexpected failure that must not leak")
                    )
                )
            )
            .andExpect(jsonPath("$.traceId").exists())
            .andExpect(header().exists(RequestIdFilter.HEADER_NAME))
    }
    @Test
    fun `delivers translated details in the requested language, German by default`() {
        mockMvc.perform(get("/api/v1/test-errors/translated").with(jwt()))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.code").value(ErrorCode.NOT_FOUND))
            .andExpect(jsonPath("$.detail").value("Event mit ID '42' nicht gefunden"))
        mockMvc.perform(get("/api/v1/test-errors/translated").header("Accept-Language", "de").with(jwt()))
            .andExpect(jsonPath("$.detail").value("Event mit ID '42' nicht gefunden"))
        mockMvc.perform(get("/api/v1/test-errors/translated").header("Accept-Language", "en").with(jwt()))
            .andExpect(jsonPath("$.code").value(ErrorCode.NOT_FOUND))
            .andExpect(jsonPath("$.detail").value("Event with ID '42' not found"))
        mockMvc.perform(get("/api/v1/test-errors/translated").header("Accept-Language", "fr-FR").with(jwt()))
            .andExpect(jsonPath("$.detail").value("Event mit ID '42' nicht gefunden"))
    }

    @Test
    fun `translates generic texts and bean validation messages`() {
        mockMvc.perform(get("/api/v1/test-errors/boom").header("Accept-Language", "en-GB,en;q=0.9").with(jwt()))
            .andExpect(jsonPath("$.detail").value("An internal server error occurred"))
        mockMvc.perform(
            post("/api/v1/test-errors/validate-localized")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"  \"}")
                .with(jwt())
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.details[0]").value("name: name darf nicht leer sein"))
        mockMvc.perform(
            post("/api/v1/test-errors/validate-localized")
                .header("Accept-Language", "en")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"  \"}")
                .with(jwt())
        )
            .andExpect(jsonPath("$.detail").value("Validation failed for request parameters"))
            .andExpect(jsonPath("$.details[0]").value("name: name must not be blank"))
    }
}
