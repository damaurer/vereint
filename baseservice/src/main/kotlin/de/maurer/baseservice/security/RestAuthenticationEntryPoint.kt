package de.maurer.baseservice.security

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import de.maurer.baseservice.error.ApiProblem
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.web.RequestIdFilter
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.core.AuthenticationException
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.stereotype.Component

@Component
class RestAuthenticationEntryPoint(
    private val objectMapper: ObjectMapper = jacksonObjectMapper().findAndRegisterModules()
) : AuthenticationEntryPoint {

    override fun commence(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authException: AuthenticationException
    ) {
        val traceId = RequestIdFilter.currentTraceId(request)
        val body = ApiProblem.asMap(
            status = HttpStatus.UNAUTHORIZED,
            code = ErrorCode.ACCESS_DENIED,
            message = authException.message ?: "Authentication is required to access this resource",
            instance = request.requestURI,
            traceId = traceId
        )

        response.status = HttpStatus.UNAUTHORIZED.value()
        response.contentType = MediaType.APPLICATION_PROBLEM_JSON_VALUE
        response.characterEncoding = "UTF-8"
        response.setHeader(RequestIdFilter.HEADER_NAME, traceId)
        response.writer.write(objectMapper.writeValueAsString(body))
    }
}
