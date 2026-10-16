package de.maurer.baseservice.billing

import de.maurer.baseservice.domain.BillingPlan
import de.maurer.baseservice.domain.ImageStatus
import de.maurer.baseservice.domain.StammtischSubscriptionEntity
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.ImageAssetRepository
import de.maurer.baseservice.repository.KioskSessionRepository
import de.maurer.baseservice.repository.MomentMediaRepository
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischSubscriptionRepository
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Grenzen der Tarife und ihre Prüfung im aktuellen Stammtisch.
 *
 * Geprüft wird nur beim Hinzufügen (Mitglied aufnehmen, Datei hochladen,
 * Kiosk starten). Liegt ein Stammtisch nach einem Wechsel in einen kleineren
 * Tarif darüber, bleibt alles erhalten; nur Neues ist gesperrt.
 */
@Component
class PlanLimits(
    private val subscriptionRepository: StammtischSubscriptionRepository,
    private val memberRepository: StammtischMemberRepository,
    private val imageAssetRepository: ImageAssetRepository,
    private val momentMediaRepository: MomentMediaRepository,
    private val kioskSessionRepository: KioskSessionRepository
) {

    data class Limits(
        /** `null` = unbegrenzt. */
        val maxMembers: Long?,
        val storageBytes: Long,
        val videos: Boolean,
        val multipleKiosks: Boolean
    )

    data class Usage(val members: Long, val storageBytes: Long, val activeKiosks: Long)

    fun subscription(stammtischId: UUID = TenantContext.requireStammtischId()): StammtischSubscriptionEntity? =
        subscriptionRepository.findById(stammtischId).orElse(null)

    fun currentPlan(): BillingPlan = subscription()?.plan ?: BillingPlan.free

    fun currentLimits(): Limits = limitsOf(currentPlan())

    fun usage(): Usage = Usage(
        members = memberRepository.countByActiveTrue(),
        storageBytes = usedStorageBytes(),
        activeKiosks = kioskSessionRepository.countByEndedAtIsNull()
    )

    fun requireMemberSlot() {
        val max = currentLimits().maxMembers ?: return
        if (memberRepository.countByActiveTrue() >= max) {
            throw limit(ErrorCode.PLAN_LIMIT_MEMBERS, Msg("error.plan.members", max))
        }
    }

    fun requireStorage(additionalBytes: Long) {
        val limit = currentLimits().storageBytes
        if (usedStorageBytes() + additionalBytes > limit) {
            throw limit(ErrorCode.PLAN_LIMIT_STORAGE, Msg("error.plan.storage", limit / GIB))
        }
    }

    fun requireVideos() {
        if (!currentLimits().videos) throw limit(ErrorCode.PLAN_LIMIT_VIDEOS, Msg("error.plan.videos"))
    }

    fun requireKioskSlot() {
        if (currentLimits().multipleKiosks) return
        if (kioskSessionRepository.countByEndedAtIsNull() >= 1) {
            throw limit(ErrorCode.PLAN_LIMIT_KIOSK, Msg("error.plan.kiosk"))
        }
    }

    private fun usedStorageBytes(): Long =
        imageAssetRepository.sumSizeBytesByStatus(ImageStatus.active) + momentMediaRepository.sumSizeBytes()

    private fun limit(code: String, msg: Msg) = ApiException(code, msg, HttpStatus.CONFLICT)

    companion object {
        const val GIB = 1024L * 1024 * 1024

        fun limitsOf(plan: BillingPlan): Limits = when (plan) {
            BillingPlan.free -> Limits(maxMembers = 10, storageBytes = 1 * GIB, videos = false, multipleKiosks = false)
            BillingPlan.stammtisch -> Limits(maxMembers = 40, storageBytes = 10 * GIB, videos = true, multipleKiosks = false)
            BillingPlan.verein -> Limits(maxMembers = null, storageBytes = 50 * GIB, videos = true, multipleKiosks = true)
        }
    }
}
