package de.maurer.baseservice.controller

import de.maurer.baseservice.service.MediaContent
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import java.io.InputStream

/**
 * Liefert eine entschlüsselte Datei (Foto/Video) aus, mit einem einzelnen
 * `Range`-Bereich (`206`), damit Browser Videos abspielen und spulen können.
 */
internal object MediaResponses {

    fun send(
        content: MediaContent,
        rangeHeader: String?,
        response: HttpServletResponse,
        open: (MediaContent, Long, Long) -> InputStream
    ) {
        val total = content.sizeBytes
        val range = MomentController.parseRange(rangeHeader, total)
        if (range != null && range.first < 0) {
            response.status = HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE.value()
            response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes */$total")
            return
        }
        val (start, end) = range ?: (0L to total - 1)
        val stream = open(content, start, end)
        response.status = if (range != null) HttpStatus.PARTIAL_CONTENT.value() else HttpStatus.OK.value()
        response.contentType = content.contentType
        response.setContentLengthLong(end - start + 1)
        response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes")
        if (range != null) response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes $start-$end/$total")
        response.setHeader(HttpHeaders.CACHE_CONTROL, "private, no-store")
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "inline")
        response.setHeader("X-Content-Type-Options", "nosniff")
        stream.use { it.transferTo(response.outputStream) }
    }
}
