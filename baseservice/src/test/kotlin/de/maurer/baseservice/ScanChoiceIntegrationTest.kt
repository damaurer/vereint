package de.maurer.baseservice

import de.maurer.baseservice.domain.DrinkBarcodeEntity
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkLibraryBarcodeEntity
import de.maurer.baseservice.domain.DrinkLibraryEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AcceptTermsRequest
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.dto.CreditPurchaseRequest
import de.maurer.baseservice.dto.ForeignDrinkRequest
import de.maurer.baseservice.dto.PurchasePreviewRequest
import de.maurer.baseservice.dto.PurchaseRequest
import de.maurer.baseservice.dto.TopupRequest
import de.maurer.baseservice.dto.UpdateStatisticsSettingsRequest
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkBarcodeRepository
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.DrinkLibraryRepository
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.StatisticRecordRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.ForeignDrinkService
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.StatisticsLevelService
import de.maurer.baseservice.service.StatisticsService
import de.maurer.baseservice.service.StatisticsSettingsService
import de.maurer.baseservice.service.TermsService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.tenancy.TenantContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Auswahl nach dem Scan (Issue #110) gegen die echten Migrationen (H2):
 * Bei einem laufenden Event mit Selbstbedienung, an dem die Person teilnimmt,
 * bleibt alles beim Kauf über das Event. Sonst gibt es den Guthabenkauf zum
 * Katalogpreis (wahlweise ohne Statistik) und das Fremdgetränk (nur Statistik,
 * ohne Event). Die Schalter Nutzer > Gruppe gelten; Rücknahme und Entfernen
 * gehen 10 Minuten lang.
 */
@SpringBootTest
@ActiveProfiles("test")
class ScanChoiceIntegrationTest @Autowired constructor(
    private val platformService: PlatformService,
    private val userService: UserService,
    private val membershipService: MembershipService,
    private val termsService: TermsService,
    private val ledgerService: LedgerService,
    private val foreignDrinks: ForeignDrinkService,
    private val settings: StatisticsSettingsService,
    private val statisticsService: StatisticsService,
    private val levels: StatisticsLevelService,
    private val recordRepository: StatisticRecordRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val drinkBarcodeRepository: DrinkBarcodeRepository,
    private val drinkLibraryRepository: DrinkLibraryRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val eventDrinkRepository: EventDrinkRepository
) {

    private lateinit var group: UUID
    private lateinit var annaUser: UserEntity
    private lateinit var adminUser: UserEntity
    private val suffix = UUID.randomUUID().toString().take(8)

    private val annaSubject = "kc-scan-anna-$suffix"
    private val benSubject = "kc-scan-ben-$suffix"
    private val adminSubject = "kc-scan-admin-$suffix"

    private fun principal(subject: String, name: String, role: String, inGroup: Boolean = true) =
        UserPrincipal(subject = subject, displayName = name, roles = setOf(role), stammtischId = if (inGroup) group.toString() else null)

    private fun anna() = principal(annaSubject, "Anna $suffix", UserRole.MEMBER)
    private fun ben() = principal(benSubject, "Ben $suffix", UserRole.MEMBER)
    private fun admin() = principal(adminSubject, "Admin $suffix", UserRole.ADMIN)

    private fun <T> inGroup(block: () -> T): T = TenantContext.runIn(group, block)

    private fun join(principal: UserPrincipal, role: String): UserEntity = inGroup {
        val user = userService.getOrCreateUser(principal)
        membershipService.addMember(user, setOf(role))
        termsService.accept(principal, AcceptTermsRequest(acceptTerms = true))
        user
    }

    private fun barcode() = "40${(100000000000L..999999999999L).random()}"

    private fun drink(name: String, price: String, code: String = barcode(), volumeMl: Int? = 500): Pair<DrinkCatalogEntity, String> = inGroup {
        val drink = drinkCatalogRepository.saveAndFlush(
            DrinkCatalogEntity(
                name = "$name $suffix", category = "Bier", defaultPrice = BigDecimal(price), costPrice = BigDecimal("1.00"),
                volumeMl = volumeMl, kcalPerServing = 200, status = DrinkStatus.approved, active = true
            )
        )
        drinkBarcodeRepository.saveAndFlush(DrinkBarcodeEntity(drink = drink, barcode = code))
        drink to code
    }

    private fun libraryDrink(name: String): Pair<DrinkLibraryEntity, String> {
        val code = barcode()
        val entry = DrinkLibraryEntity(name = "$name $suffix", category = "Limo", volumeMl = 330, kcalPerServing = 140)
        entry.barcodes.add(DrinkLibraryBarcodeEntity(drink = entry, barcode = code))
        return drinkLibraryRepository.saveAndFlush(entry) to code
    }

    /** Laufendes Event mit Anna als Gast und einem Getränk zur Selbstbedienung. */
    private fun activeEvent(drink: DrinkCatalogEntity, selfService: Boolean = true, rsvp: RsvpStatus = RsvpStatus.accepted): EventEntity = inGroup {
        val event = eventRepository.saveAndFlush(
            EventEntity(title = "Abend $suffix", status = EventStatus.active, owner = adminUser, startsAt = Instant.now().minus(Duration.ofHours(1)))
        )
        eventParticipantRepository.saveAndFlush(EventParticipantEntity(event = event, user = annaUser, rsvp = rsvp))
        eventDrinkRepository.saveAndFlush(EventDrinkEntity(event = event, drink = drink, price = BigDecimal("2.00"), selfServiceEnabled = selfService))
        event
    }

    private fun records(feature: String) = inGroup { recordRepository.findAll().filter { it.feature == feature } }

    private fun preview(code: String, who: UserPrincipal = anna()) =
        inGroup { ledgerService.previewBarcodePurchase(PurchasePreviewRequest(barcode = code), who) }

    private fun payWithCredit(code: String, record: Boolean = true, key: String = "credit-${UUID.randomUUID()}") =
        inGroup { ledgerService.purchaseWithCredit(CreditPurchaseRequest(barcode = code, recordStatistics = record), key, anna()) }

    private fun foreign(code: String, key: String = "foreign-${UUID.randomUUID()}", who: UserPrincipal = anna()) =
        inGroup { foreignDrinks.record(ForeignDrinkRequest(barcode = code), key, who) }

    @BeforeEach
    fun setup() {
        val platform = UserPrincipal(
            subject = "kc-scan-platform-${UUID.randomUUID()}", displayName = "Plattform",
            roles = setOf(UserRole.ADMIN), platformAdmin = true
        )
        group = UUID.fromString(platformService.create(CreateStammtischRequest(name = "Scan $suffix"), platform).id)
        adminUser = join(admin(), UserRole.ADMIN)
        annaUser = join(anna(), UserRole.MEMBER)
        join(ben(), UserRole.MEMBER)
        inGroup { ledgerService.topup(TopupRequest(memberId = annaUser.id.toString(), amount = BigDecimal("20.00")), "scan-topup-$suffix", admin()) }
    }

    @Test
    fun `at a running self-service event the purchase goes through the event only`() {
        val (helles, hellesCode) = drink("Helles", "3.00")
        val (_, colaCode) = drink("Cola", "2.20")
        val event = activeEvent(helles)

        val atEvent = preview(hellesCode)
        assertEquals(listOf(event.id.toString()), atEvent.options.map { it.eventId })
        assertNull(atEvent.creditPurchase)
        assertFalse(atEvent.foreignDrink)

        // Ein Getränk, das das Event nicht anbietet: keine Wahl, solange die Person dort teilnimmt.
        val notSold = assertThrows(ApiException::class.java) { preview(colaCode) }
        assertEquals(ErrorCode.DRINK_NOT_IN_EVENT, notSold.errorCode)
        val credit = assertThrows(ApiException::class.java) { payWithCredit(colaCode) }
        assertEquals(ErrorCode.CREDIT_PURCHASE_AT_EVENT, credit.errorCode)
        val foreign = assertThrows(ApiException::class.java) { foreign(colaCode) }
        assertEquals(ErrorCode.CREDIT_PURCHASE_AT_EVENT, foreign.errorCode)

        // Der bisherige Kauf über das Event bleibt unverändert.
        val entry = inGroup {
            ledgerService.purchaseByBarcode(PurchaseRequest(eventId = event.id.toString(), barcode = hellesCode), "event-$suffix", anna())
        }
        assertEquals(event.id.toString(), entry.eventId)
        assertEquals(BigDecimal("2.00"), entry.amount)
        assertEquals(event.id, records(StatisticFeature.PURCHASE).single().eventId)
        assertTrue(records(StatisticFeature.FOREIGN_DRINK).isEmpty())
    }

    @Test
    fun `a declined invitation or an event without self-service does not block the choice`() {
        val (helles, _) = drink("Helles", "3.00")
        val (_, colaCode) = drink("Cola", "2.20")
        activeEvent(helles, rsvp = RsvpStatus.declined)
        activeEvent(helles, selfService = false)

        val choice = preview(colaCode)
        assertTrue(choice.options.isEmpty())
        assertEquals(BigDecimal("2.20"), choice.creditPurchase?.unitPrice)
        assertTrue(choice.foreignDrink)
    }

    @Test
    fun `without an event the member pays with credit at the catalogue price and can undo it`() {
        val (cola, colaCode) = drink("Cola", "2.20")

        val choice = preview(colaCode)
        assertTrue(choice.options.isEmpty())
        assertEquals(cola.id.toString(), choice.drinkId)
        assertEquals(BigDecimal("2.20"), choice.creditPurchase?.unitPrice)
        assertEquals("EUR", choice.creditPurchase?.currency)
        assertTrue(choice.foreignDrink)
        assertEquals(BigDecimal("20.00"), choice.creditBalance)

        val key = "credit-$suffix"
        val entry = payWithCredit(colaCode, key = key)
        assertNull(entry.eventId)
        assertEquals(BigDecimal("2.20"), entry.amount)
        assertEquals("pwaBarcode", entry.source)
        assertEquals("2.20", entry.snapshot?.unitPrice?.toPlainString())
        assertEquals(entry.id, payWithCredit(colaCode, key = key).id, "Wiederholung bucht nicht doppelt")
        val recorded = records(StatisticFeature.PURCHASE).single()
        assertNull(recorded.eventId, "zählt ohne Event-Bezug")
        assertEquals(UUID.fromString(entry.id), recorded.sourceId)
        assertEquals(1, inGroup { statisticsService.clubStatistics(anna()) }.myItems)
        assertEquals(BigDecimal("17.80"), inGroup { ledgerService.getMemberBalance(annaUser.id, anna()) }.creditBalance)

        val undo = inGroup { ledgerService.undoBarcodePurchase(UUID.fromString(entry.id), "undo-$suffix", anna()) }
        assertEquals(LedgerEntryType.correction.name, undo.entryType)
        assertTrue(records(StatisticFeature.PURCHASE).isEmpty(), "Rücknahme entfernt den Statistikeintrag")
        assertEquals(BigDecimal("20.00"), inGroup { ledgerService.getMemberBalance(annaUser.id, anna()) }.creditBalance)

        val late = payWithCredit(colaCode)
        assertThrows(InvalidRequestException::class.java) {
            inGroup { ledgerService.undoBarcodePurchase(UUID.fromString(late.id), "undo-late-$suffix", anna(), Instant.now().plus(Duration.ofMinutes(11))) }
        }
    }

    @Test
    fun `a credit purchase can be left out of the statistics`() {
        val (_, colaCode) = drink("Cola", "2.20")

        val entry = payWithCredit(colaCode, record = false)
        assertEquals(BigDecimal("2.20"), entry.amount)
        assertTrue(records(StatisticFeature.PURCHASE).isEmpty(), "kein Statistikeintrag")
        assertEquals(1, inGroup { ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(annaUser.id).count { it.entryType == LedgerEntryType.purchase } })
        assertEquals(0, inGroup { statisticsService.clubStatistics(anna()) }.totalItems)
        assertEquals(BigDecimal("2.20"), inGroup { statisticsService.overview(admin()) }.kpis.revenue, "Umsatz bleibt vollständig")

        // Rücknahme geht auch ohne Statistikeintrag.
        inGroup { ledgerService.undoBarcodePurchase(UUID.fromString(entry.id), "undo-nostat-$suffix", anna()) }
        assertEquals(BigDecimal("20.00"), inGroup { ledgerService.getMemberBalance(annaUser.id, anna()) }.creditBalance)
    }

    @Test
    fun `a credit purchase needs a catalogue price`() {
        val (_, freeCode) = drink("Wasser", "0.00")

        val choice = preview(freeCode)
        assertNull(choice.creditPurchase)
        assertTrue(choice.foreignDrink)
        val ex = assertThrows(ApiException::class.java) { payWithCredit(freeCode) }
        assertEquals(ErrorCode.NO_CATALOG_PRICE, ex.errorCode)
    }

    @Test
    fun `a foreign drink only counts in the statistics, never at an event, and can be removed`() {
        val (helles, hellesCode) = drink("Helles", "3.00")
        // Ein anderes, nicht laufendes Event in der Gruppe: es darf das Fremdgetränk nicht zählen.
        val published = inGroup {
            eventRepository.saveAndFlush(EventEntity(title = "Später $suffix", status = EventStatus.published, owner = adminUser, startsAt = Instant.now().minus(Duration.ofHours(2))))
        }

        val key = "foreign-$suffix"
        val dto = foreign(hellesCode, key)
        assertEquals(helles.name, dto.drinkName)
        assertEquals(helles.id.toString(), dto.drinkId)
        assertEquals(dto.id, foreign(hellesCode, key).id, "Wiederholung erfasst nicht doppelt")

        val record = records(StatisticFeature.FOREIGN_DRINK).single()
        assertNull(record.eventId)
        assertEquals(annaUser.id, record.actorUserId)
        assertEquals(helles.id, record.drinkId)
        assertTrue(inGroup { ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(annaUser.id).none { it.entryType == LedgerEntryType.purchase } }, "nichts gebucht")
        assertEquals(BigDecimal("20.00"), inGroup { ledgerService.getMemberBalance(annaUser.id, anna()) }.creditBalance)

        // Eigene Statistik und Gruppenstatistik zählen es …
        val mine = TenantContext.runWithoutTenant { levels.me(principal(annaSubject, "Anna $suffix", UserRole.MEMBER, inGroup = false), "30") }
        assertEquals(1, mine.counts.first { it.feature == StatisticFeature.FOREIGN_DRINK }.count)
        assertEquals(0, mine.attended)
        val drinks = inGroup { statisticsService.drinkStatistics(anna(), "30", "drink") }
        assertEquals(1, drinks.totalDrinks)
        assertEquals(helles.name, drinks.drinks.single().name)
        assertEquals(BigDecimal("0.5"), drinks.liters)
        assertNull(drinks.drinks.single().perEvent)
        assertEquals(1, inGroup { statisticsService.clubStatistics(ben()) }.totalItems)
        val overview = inGroup { statisticsService.overview(admin()) }
        assertEquals(1, overview.kpis.drinks)
        assertEquals(0, BigDecimal.ZERO.compareTo(overview.kpis.revenue), "kein Umsatz")
        assertEquals(1, inGroup { levels.features(admin(), "30") }.features.first { it.feature == StatisticFeature.FOREIGN_DRINK }.triggered)
        // … aber keine Event-Statistik.
        assertEquals(0, inGroup { levels.event(published.id, admin()) }.purchases)
        assertEquals(0, inGroup { levels.groupEvents(admin(), "30") }.totals.purchases)
        assertNull(overview.records.mostDrinksEvening)

        // Andere können es nicht entfernen, nach 10 Minuten auch die Person nicht mehr.
        val id = UUID.fromString(dto.id)
        assertThrows(ResourceNotFoundException::class.java) { inGroup { foreignDrinks.remove(id, ben()) } }
        assertThrows(InvalidRequestException::class.java) {
            inGroup { foreignDrinks.remove(id, anna(), Instant.now().plus(Duration.ofMinutes(11))) }
        }
        inGroup { foreignDrinks.remove(id, anna()) }
        assertTrue(records(StatisticFeature.FOREIGN_DRINK).isEmpty())
        assertEquals(0, inGroup { statisticsService.drinkStatistics(anna(), "30", "drink") }.totalDrinks)
    }

    @Test
    fun `a drink that is only in the drink database can be recorded as a foreign drink`() {
        val (library, code) = libraryDrink("Limo")

        val choice = preview(code)
        assertNull(choice.drinkId)
        assertEquals(library.id.toString(), choice.libraryDrinkId)
        assertEquals(library.name, choice.drinkName)
        assertNull(choice.creditPurchase, "kein Katalogpreis")
        assertTrue(choice.foreignDrink)
        assertThrows(ResourceNotFoundException::class.java) { payWithCredit(code) }

        val dto = foreign(code)
        assertNull(dto.drinkId)
        assertEquals(library.id.toString(), dto.libraryDrinkId)
        val drinks = inGroup { statisticsService.drinkStatistics(anna(), "30", "drink") }
        assertEquals(library.name, drinks.drinks.single().name)
        assertEquals(330, drinks.drinks.single().volumeMl)
        assertEquals(140, drinks.kcal)
        assertEquals(StatisticsService.CATEGORY_NON_ALCOHOLIC, drinks.drinks.single().category)
    }

    @Test
    fun `with statistics switched off there is no foreign drink and credit purchases record nothing`() {
        val (_, colaCode) = drink("Cola", "2.20")
        val (_, libraryCode) = libraryDrink("Limo")

        inGroup { settings.updateGroupSettings(UpdateStatisticsSettingsRequest(false), admin()) }
        val groupOff = preview(colaCode)
        assertNotNull(groupOff.creditPurchase)
        assertFalse(groupOff.foreignDrink, "Option Fremdgetränk nicht angeboten")
        val ex = assertThrows(ApiException::class.java) { foreign(colaCode) }
        assertEquals(ErrorCode.STATISTICS_DISABLED, ex.errorCode)
        // Nur in der Getränkedatenbank und Statistik aus: es bleibt keine Möglichkeit.
        assertThrows(ApiException::class.java) { preview(libraryCode) }
        payWithCredit(colaCode, record = true)
        assertTrue(records(StatisticFeature.PURCHASE).isEmpty())
        inGroup { settings.updateGroupSettings(UpdateStatisticsSettingsRequest(true), admin()) }

        // Nutzer aus gewinnt über Gruppe an.
        val annaAnywhere = principal(annaSubject, "Anna $suffix", UserRole.MEMBER, inGroup = false)
        TenantContext.runWithoutTenant { settings.updateMySettings(UpdateStatisticsSettingsRequest(false), annaAnywhere) }
        assertFalse(preview(colaCode).foreignDrink)
        assertThrows(ApiException::class.java) { foreign(colaCode) }
        TenantContext.runWithoutTenant { settings.updateMySettings(UpdateStatisticsSettingsRequest(true), annaAnywhere) }
        assertTrue(preview(colaCode).foreignDrink)
        assertTrue(records(StatisticFeature.FOREIGN_DRINK).isEmpty())
    }
}
