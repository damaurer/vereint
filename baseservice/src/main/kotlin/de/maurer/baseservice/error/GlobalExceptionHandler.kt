package de.maurer.baseservice.error

import de.maurer.baseservice.web.RequestIdFilter
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.ConstraintViolationException
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.http.HttpStatusCode
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.access.AccessDeniedException as SpringAccessDeniedException
import org.springframework.security.core.AuthenticationException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.HandlerMethodValidationException
import org.springframework.web.servlet.resource.NoResourceFoundException

/**
 * Einheitliches Fehlerformat nach RFC 7807 (`ProblemDetail`) mit den VEREINT-Extensions
 * `code` und `traceId`. Der `traceId`-Wert entspricht dem Response-Header `X-Request-Id`.
 *
 * Der `detail`-Text wird in der Sprache der Anfrage (`Accept-Language`) geliefert; der
 * `code` bleibt sprachunabhängig. Interne Exception-Texte (z. B. von Spring Security)
 * gelangen nicht in die Antwort, sondern werden durch übersetzte Standardtexte ersetzt.
 */
@RestControllerAdvice
class GlobalExceptionHandler(
    private val messages: ErrorMessageResolver
) {

    private val log = LoggerFactory.getLogger(GlobalExceptionHandler::class.java)

    @ExceptionHandler(ApiException::class)
    fun handleApiException(ex: ApiException, request: HttpServletRequest): ResponseEntity<ProblemDetail> =
        problem(ex.status, ex.errorCode, messages.resolve(ex, request), request, ex.details)

    @ExceptionHandler(SpringAccessDeniedException::class)
    fun handleSpringAccessDenied(
        ex: SpringAccessDeniedException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> = problem(
        HttpStatus.FORBIDDEN,
        ErrorCode.PERMISSION_DENIED,
        messages.resolve("error.security.accessDenied", request),
        request
    )

    @ExceptionHandler(AuthenticationException::class)
    fun handleAuthenticationException(
        ex: AuthenticationException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> = problem(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.ACCESS_DENIED,
        messages.resolve("error.security.authenticationRequired", request),
        request
    )

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidationException(
        ex: MethodArgumentNotValidException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> {
        val details = ex.bindingResult.fieldErrors.map { "${it.field}: ${it.defaultMessage}" } +
            ex.bindingResult.globalErrors.map { "${it.objectName}: ${it.defaultMessage}" }
        return problem(
            HttpStatus.BAD_REQUEST,
            ErrorCode.VALIDATION_FAILED,
            messages.resolve("error.validation.failed", request),
            request,
            details
        )
    }

    @ExceptionHandler(HandlerMethodValidationException::class)
    fun handleHandlerMethodValidation(
        ex: HandlerMethodValidationException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> {
        val details = ex.allErrors.mapNotNull { it.defaultMessage }
        return problem(
            HttpStatus.BAD_REQUEST,
            ErrorCode.VALIDATION_FAILED,
            messages.resolve("error.validation.failed", request),
            request,
            details
        )
    }

    @ExceptionHandler(ConstraintViolationException::class)
    fun handleConstraintViolation(
        ex: ConstraintViolationException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> {
        val details = ex.constraintViolations.map { "${it.propertyPath}: ${it.message}" }
        return problem(
            HttpStatus.BAD_REQUEST,
            ErrorCode.VALIDATION_FAILED,
            messages.resolve("error.validation.failed", request),
            request,
            details
        )
    }

    @ExceptionHandler(OptimisticLockingFailureException::class)
    fun handleOptimisticLocking(
        ex: OptimisticLockingFailureException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> {
        log.warn("Optimistic locking conflict on ${request.requestURI}: ${ex.message}")
        return problem(
            HttpStatus.CONFLICT,
            ErrorCode.CONCURRENT_MODIFICATION,
            messages.resolve("error.concurrentModification.retry", request),
            request
        )
    }

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun handleDataIntegrityViolation(
        ex: DataIntegrityViolationException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> {
        log.warn("Data integrity violation on ${request.requestURI}: ${ex.message}")
        // Zwei gleichzeitige Korrekturen derselben Buchung: Die zweite scheitert am
        // Unique-Constraint auf reverses_entry_id (Migration 022).
        if (ex.mostSpecificCause.message?.contains(LEDGER_CORRECTION_CONSTRAINT, ignoreCase = true) == true) {
            return problem(
                HttpStatus.CONFLICT,
                ErrorCode.LEDGER_ALREADY_CORRECTED,
                messages.resolve("error.ledger.correctionConflict", request),
                request
            )
        }
        return problem(
            HttpStatus.CONFLICT,
            ErrorCode.DATA_INTEGRITY_VIOLATION,
            messages.resolve("error.dataIntegrity", request),
            request
        )
    }

    @ExceptionHandler(NoResourceFoundException::class)
    fun handleNoResourceFound(
        ex: NoResourceFoundException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> = problem(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        messages.resolve("error.default.notFound", request),
        request
    )

    @ExceptionHandler(Exception::class)
    fun handleGenericException(
        ex: Exception,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> {
        log.error("Unhandled exception processing request ${request.requestURI}", ex)
        return problem(
            HttpStatus.INTERNAL_SERVER_ERROR,
            ErrorCode.INTERNAL_ERROR,
            messages.resolve("error.internal", request),
            request
        )
    }

    private fun problem(
        status: HttpStatusCode,
        code: String,
        message: String,
        request: HttpServletRequest,
        details: List<String>? = null
    ): ResponseEntity<ProblemDetail> {
        val traceId = RequestIdFilter.currentTraceId(request)
        val body = ApiProblem.of(
            status = status,
            code = code,
            message = message,
            instance = request.requestURI,
            traceId = traceId,
            details = details
        )
        return ResponseEntity.status(status)
            .header(RequestIdFilter.HEADER_NAME, traceId)
            .body(body)
    }

    private companion object {
        const val LEDGER_CORRECTION_CONSTRAINT = "uk_ledger_entries_reverses_entry"
    }
}
