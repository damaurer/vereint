package de.maurer.baseservice.security

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import de.maurer.baseservice.error.ApiProblem
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.ErrorMessageResolver
import de.maurer.baseservice.web.RequestIdFilter
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.stereotype.Component

/**
 * Fehlerantwort aus der Security-Filterkette; der `detail`-Text folgt der Sprache der
 * Anfrage (`Accept-Language`), interne Exception-Texte werden nicht ausgeliefert.
 */
@Component
class RestAccessDeniedHandler(
    private val messages: ErrorMessageResolver,
    private val objectMapper: ObjectMapper = jacksonObjectMapper().findAndRegisterModules()
) : AccessDeniedHandler {

    override fun handle(
        request: HttpServletRequest,
        response: HttpServletResponse,
        accessDeniedException: AccessDeniedException
    ) {
        val traceId = RequestIdFilter.currentTraceId(request)
        val body = ApiProblem.asMap(
            status = HttpStatus.FORBIDDEN,
            code = ErrorCode.PERMISSION_DENIED,
            message = messages.resolve("error.security.forbidden", request),
            instance = request.requestURI,
            traceId = traceId
        )

        response.status = HttpStatus.FORBIDDEN.value()
        response.contentType = MediaType.APPLICATION_PROBLEM_JSON_VALUE
        response.characterEncoding = "UTF-8"
        response.setHeader(RequestIdFilter.HEADER_NAME, traceId)
        response.writer.write(objectMapper.writeValueAsString(body))
    }
}
