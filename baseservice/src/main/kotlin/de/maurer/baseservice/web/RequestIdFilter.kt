package de.maurer.baseservice.web

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.MDC
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

/**
 * Setzt für jeden Request eine Korrelations-ID.
 *
 * Die ID wird aus dem Header `X-Request-Id` übernommen (sonst neu erzeugt), im MDC
 * unter [MDC_KEY] bereitgestellt, als Request-Attribut hinterlegt und als
 * Response-Header `X-Request-Id` zurückgegeben. Denselben Wert liefert das
 * Fehlerformat als Extension `traceId`.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestIdFilter : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        val traceId = resolveIncoming(request) ?: newTraceId()
        MDC.put(MDC_KEY, traceId)
        request.setAttribute(REQUEST_ATTRIBUTE, traceId)
        response.setHeader(HEADER_NAME, traceId)
        try {
            filterChain.doFilter(request, response)
        } finally {
            MDC.remove(MDC_KEY)
        }
    }

    private fun resolveIncoming(request: HttpServletRequest): String? =
        request.getHeader(HEADER_NAME)?.trim()?.takeIf { it.isNotEmpty() && it.length <= MAX_LENGTH }

    companion object {
        const val HEADER_NAME = "X-Request-Id"
        const val MDC_KEY = "traceId"
        const val REQUEST_ATTRIBUTE = "de.maurer.baseservice.traceId"
        private const val MAX_LENGTH = 128

        fun newTraceId(): String = UUID.randomUUID().toString()

        /**
         * Ermittelt die Korrelations-ID in der Reihenfolge Request-Attribut, MDC,
         * eingehender Header; erzeugt andernfalls einen neuen Wert.
         */
        fun currentTraceId(request: HttpServletRequest?): String {
            (request?.getAttribute(REQUEST_ATTRIBUTE) as? String)?.let { return it }
            MDC.get(MDC_KEY)?.takeIf { it.isNotBlank() }?.let { return it }
            request?.getHeader(HEADER_NAME)?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
            return newTraceId()
        }
    }
}
