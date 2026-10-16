package de.maurer.baseservice.service

import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.dto.ClubStatisticsDto
import de.maurer.baseservice.dto.EventCountDto
import de.maurer.baseservice.dto.ItemShareDto
import de.maurer.baseservice.dto.MemberCountDto
import de.maurer.baseservice.dto.SpendingDto
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.security.UserPrincipal
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant

/**
 * Vereinsstatistik aus dem Ledger: wer wie viel getrunken bzw. gegessen hat,
 * beliebteste Artikel, stärkste Events, Umsatzverlauf und wie viele Einladungen
 * zugesagt wurden. Stornierte Käufe zählen nicht.
 */
@Service
@Transactional(readOnly = true)
class StatisticsService(
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val userService: UserService,
    private val snapshots: LedgerSnapshots
) {

    fun clubStatistics(principal: UserPrincipal, now: Instant = Instant.now()): ClubStatisticsDto {
        val caller = userService.getOrCreateUser(principal)
        val since = now.minus(Duration.ofDays(PERIOD_DAYS.toLong()))
        val entries = snapshots.attach(ledgerEntryRepository.findByCreatedAtGreaterThanEqual(since))
        val reversed = entries.mapNotNull { it.reversesEntry?.id }.toSet()
        val purchases = entries.filter { it.entryType == LedgerEntryType.purchase && it.id !in reversed }

        val byMember = purchases.filter { it.member != null }.groupBy { it.member!!.id }
        val ranking = byMember.entries
            .map { (id, list) -> MemberCountDto(id.toString(), list.first().member!!.displayName, list.size) }
            .sortedWith(compareByDescending<MemberCountDto> { it.count }.thenBy { it.displayName })
        val myIndex = ranking.indexOfFirst { it.memberId == caller.id.toString() }

        val byItem = purchases.groupBy { itemName(it) }
        val itemRanking = byItem.entries
            .map { (name, list) -> ItemShareDto(name, list.size, percent(list.size, purchases.size) ?: 0) }
            .sortedByDescending { it.count }
            .take(TOP)

        val topEvents = purchases.filter { it.event != null }.groupBy { it.event!!.id }.entries
            .map { (id, list) -> EventCountDto(id.toString(), list.first().event!!.title, list.size) }
            .sortedByDescending { it.count }
            .take(TOP)

        return ClubStatisticsDto(
            periodDays = PERIOD_DAYS,
            totalItems = purchases.size,
            myItems = byMember[caller.id]?.size ?: 0,
            myRank = if (myIndex >= 0) myIndex + 1 else null,
            topConsumers = ranking.take(TOP),
            attendancePercent = attendance(since, now),
            spending = spending(purchases, now),
            itemRanking = itemRanking,
            topEvents = topEvents
        )
    }

    /** Anteil der Zusagen an allen verschickten Einladungen zu Events im Zeitraum. */
    private fun attendance(since: Instant, now: Instant): Int? {
        val invitations = eventParticipantRepository.findAll().filter {
            val start = it.event?.startsAt
            it.invitationSentAt != null && start != null && !start.isBefore(since) && !start.isAfter(now.plus(Duration.ofDays(PERIOD_DAYS.toLong())))
        }
        return percent(invitations.count { it.rsvp == RsvpStatus.accepted }, invitations.size)
    }

    private fun spending(purchases: List<LedgerEntryEntity>, now: Instant): SpendingDto {
        fun sumBetween(from: Instant, to: Instant): BigDecimal = purchases
            .filter { !it.createdAt.isBefore(from) && it.createdAt.isBefore(to) }
            .fold(BigDecimal.ZERO) { acc, entry -> acc + entry.amount.abs() }

        val month = Duration.ofDays(30)
        val current = sumBetween(now.minus(month), now.plusSeconds(1))
        val previous = sumBetween(now.minus(month).minus(month), now.minus(month))
        val change = if (previous.signum() == 0) {
            null
        } else {
            current.subtract(previous).multiply(BigDecimal(100)).divide(previous, 0, RoundingMode.HALF_UP).toInt()
        }
        val week = Duration.ofDays(7)
        val weekly = (WEEKS - 1 downTo 0).map { back ->
            val end = now.plusSeconds(1).minus(week.multipliedBy(back.toLong()))
            sumBetween(end.minus(week), end)
        }
        return SpendingDto(
            total = current.setScale(2, RoundingMode.HALF_UP),
            currency = purchases.firstOrNull()?.currency ?: DEFAULT_CURRENCY,
            changePercent = change,
            weekly = weekly.map { it.setScale(2, RoundingMode.HALF_UP) }
        )
    }

    private fun itemName(entry: LedgerEntryEntity): String =
        entry.purchaseSnapshot?.drinkName
            ?: entry.purchaseSnapshot?.foodName
            ?: entry.drink?.name
            ?: entry.food?.name
            ?: UNKNOWN_ITEM

    private fun percent(part: Int, total: Int): Int? =
        if (total == 0) null else Math.round(part * 100.0 / total).toInt()

    companion object {
        const val PERIOD_DAYS = 90
        const val WEEKS = 8
        const val TOP = 5
        const val DEFAULT_CURRENCY = "EUR"
        const val UNKNOWN_ITEM = "?"
    }
}
