package de.maurer.baseservice.error

import org.springframework.http.HttpStatus
import org.springframework.http.HttpStatusCode
import org.springframework.http.ProblemDetail
import java.net.URI
import java.time.Instant

/**
 * Zentrale Erzeugung des VEREINT-Fehlerformats auf Basis von RFC 7807 (`ProblemDetail`).
 *
 * Die VEREINT-spezifischen Felder werden als Extensions geführt:
 * - `code`: stabiler Fehlercode aus [ErrorCode]
 * - `traceId`: Korrelations-ID (identisch mit dem Response-Header `X-Request-Id`)
 * - `timestamp`: Serverzeitpunkt der Fehlerantwort
 * - `details`: optionale Feld- oder Zusatzhinweise
 */
object ApiProblem {

    const val TYPE_BASE = "https://vereint.example/problems"

    const val EXTENSION_CODE = "code"
    const val EXTENSION_TRACE_ID = "traceId"
    const val EXTENSION_TIMESTAMP = "timestamp"
    const val EXTENSION_DETAILS = "details"

    fun of(
        status: HttpStatusCode,
        code: String,
        message: String,
        instance: String? = null,
        traceId: String,
        details: List<String>? = null
    ): ProblemDetail {
        val problem = ProblemDetail.forStatusAndDetail(status, message)
        problem.type = URI.create("$TYPE_BASE/$code")
        problem.title = titleFor(status)
        if (instance != null) {
            problem.instance = URI.create(instance)
        }
        problem.setProperty(EXTENSION_CODE, code)
        problem.setProperty(EXTENSION_TRACE_ID, traceId)
        problem.setProperty(EXTENSION_TIMESTAMP, Instant.now().toString())
        if (!details.isNullOrEmpty()) {
            problem.setProperty(EXTENSION_DETAILS, details)
        }
        return problem
    }

    /**
     * Serialisierbare Abbildung des Fehlerformats für Stellen, die vor dem
     * `HandlerAdapter` antworten (Security-Entry-Point und Access-Denied-Handler).
     */
    fun asMap(
        status: HttpStatusCode,
        code: String,
        message: String,
        instance: String?,
        traceId: String
    ): Map<String, Any?> = linkedMapOf(
        "type" to "$TYPE_BASE/$code",
        "title" to titleFor(status),
        "status" to status.value(),
        "detail" to message,
        "instance" to instance,
        EXTENSION_CODE to code,
        EXTENSION_TRACE_ID to traceId,
        EXTENSION_TIMESTAMP to Instant.now().toString()
    )

    private fun titleFor(status: HttpStatusCode): String =
        HttpStatus.resolve(status.value())?.reasonPhrase ?: "Error"
}
