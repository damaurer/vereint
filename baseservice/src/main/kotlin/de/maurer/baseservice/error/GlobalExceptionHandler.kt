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
 */
@RestControllerAdvice
class GlobalExceptionHandler {

    private val log = LoggerFactory.getLogger(GlobalExceptionHandler::class.java)

    @ExceptionHandler(ApiException::class)
    fun handleApiException(ex: ApiException, request: HttpServletRequest): ResponseEntity<ProblemDetail> =
        problem(ex.status, ex.errorCode, ex.message, request, ex.details)

    @ExceptionHandler(SpringAccessDeniedException::class)
    fun handleSpringAccessDenied(
        ex: SpringAccessDeniedException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> = problem(
        HttpStatus.FORBIDDEN,
        ErrorCode.PERMISSION_DENIED,
        ex.message ?: "Access is denied",
        request
    )

    @ExceptionHandler(AuthenticationException::class)
    fun handleAuthenticationException(
        ex: AuthenticationException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> = problem(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.ACCESS_DENIED,
        ex.message ?: "Authentication required",
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
            "Validation failed for request parameters",
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
            "Validation failed for request parameters",
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
            "Validation failed for request parameters",
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
            "Resource was modified concurrently, please retry with the current state",
            request
        )
    }

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun handleDataIntegrityViolation(
        ex: DataIntegrityViolationException,
        request: HttpServletRequest
    ): ResponseEntity<ProblemDetail> {
        log.warn("Data integrity violation on ${request.requestURI}: ${ex.message}")
        return problem(
            HttpStatus.CONFLICT,
            ErrorCode.DATA_INTEGRITY_VIOLATION,
            "Request violates a data integrity constraint",
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
        ex.message ?: "Resource not found",
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
            "An internal server error occurred",
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
}
