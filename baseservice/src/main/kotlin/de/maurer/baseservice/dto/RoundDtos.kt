package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.math.BigDecimal
import java.time.Instant

/**
 * Runde am eigenen Handy ausgeben (Issue #81).
 *
 * - `kind`: `round` (ein Getränk je Eingeladenem) oder `evening` (alles bis zur Höchstsumme)
 * - `eventDrinkId`: ein Eventgetränk oder leer = alle Getränke
 * - `validity`: `30m`, `1h` oder `eventEnd`
 * - `maxAmount`: nur bei `evening` (Pflicht); bei `round` rechnet der Server die Höchstsumme aus
 */
data class CreateRoundRequest(
    @field:NotBlank(message = "kind {validation.notBlank}")
    val kind: String? = null,

    val eventDrinkId: String? = null,

    @field:NotBlank(message = "validity {validation.notBlank}")
    val validity: String? = null,

    @field:Size(max = 200, message = "memberIds {validation.size.maxEntries}")
    val memberIds: List<String>? = null,

    @field:DecimalMin(value = "0.01", message = "maxAmount {validation.positive}")
    @field:Digits(integer = 8, fraction = 2, message = "maxAmount {validation.twoDecimals}")
    val maxAmount: BigDecimal? = null
)

data class RoundInviteeDto(
    val memberId: String,
    val displayName: String,
    /** Wie viele Striche dieser Person schon auf die Runde gingen (ohne zurückgenommene). */
    val redeemedCount: Int,
    val redeemed: Boolean
)

data class RoundDto(
    val id: String,
    val eventId: String,
    val sponsorId: String,
    val sponsorName: String,
    /** `round` oder `evening` */
    val kind: String,
    /** `null` = alle Getränke */
    val eventDrinkId: String?,
    val drinkName: String?,
    val maxAmount: BigDecimal,
    val usedAmount: BigDecimal,
    val currency: String,
    /** `null` = bis Event-Ende */
    val validUntil: Instant?,
    val endedAt: Instant?,
    /** `running`, `usedUp`, `expired` oder `ended` */
    val status: String,
    val createdAt: Instant,
    val invitees: List<RoundInviteeDto>
)

/** Getränk zur Auswahl im Formular, mit dem Preis, der an der Theke gilt. */
data class RoundDrinkOptionDto(
    val eventDrinkId: String,
    val drinkName: String,
    val price: BigDecimal,
    val currency: String
)

/** Person zur Auswahl im Formular. */
data class RoundMemberOptionDto(
    val memberId: String,
    val displayName: String,
    /** hat zugesagt */
    val accepted: Boolean,
    /** hatte heute schon einen Strich oder Kauf in diesem Event */
    val present: Boolean
)

/** Alles, was das Formular „Runde ausgeben“ braucht. */
data class RoundOptionsDto(
    val eventId: String,
    val eventTitle: String,
    val creditBalance: BigDecimal,
    val currency: String,
    val drinks: List<RoundDrinkOptionDto>,
    val members: List<RoundMemberOptionDto>
)

/** Wer gerade für eine Person an der Theke zahlt (Zeilenkopf der Strichliste). */
data class RoundFundingDto(
    val roundId: String,
    val sponsorName: String,
    val kind: String
)
