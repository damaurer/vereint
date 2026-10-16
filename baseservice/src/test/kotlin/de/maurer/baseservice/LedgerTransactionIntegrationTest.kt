package de.maurer.baseservice

import de.maurer.baseservice.domain.AccountingMode
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.TopupRequest
import de.maurer.baseservice.repository.IdempotencyRecordRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.service.MembershipService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.util.UUID

/**
 * Datenbankgestützte Transaktions- und Idempotenz-Nachweise für die finanziellen
 * Schreibvorgänge des [LedgerService]. Läuft gegen das H2-Profil `test` mit den
 * echten Liquibase-Migrationen und benötigt daher kein Docker/Testcontainers.
 *
 * Ergänzt die reinen Mock-Unit-Tests in `LedgerServiceTest` um den echten
 * Transaktionsnachweis: Bei einem Fehler innerhalb der Transaktion wird die
 * Ledger-Buchung vollständig zurückgerollt (`deny by default` für halbfertige
 * Finanzbuchungen), ein erfolgreicher Vorgang schreibt Buchung und
 * Idempotenz-Datensatz atomar.
 */
@SpringBootTest
@ActiveProfiles("test")
class LedgerTransactionIntegrationTest @Autowired constructor(
    private val ledgerService: LedgerService,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val idempotencyRecordRepository: IdempotencyRecordRepository,
    private val userRepository: UserRepository,
    private val membershipService: MembershipService,
    transactionManager: PlatformTransactionManager
) {

    private val transactionTemplate = TransactionTemplate(transactionManager)

    /** Konto und Mitgliedschaft im Standard-Stammtisch des Tests. */
    private fun newUser(prefix: String): UserEntity {
        val user = userRepository.saveAndFlush(
            UserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = "kc-$prefix-${UUID.randomUUID()}",
                displayName = "$prefix ${UUID.randomUUID()}"
            )
        )
        membershipService.addMember(user)
        return user
    }

    private fun adminPrincipal(subject: String) =
        UserPrincipal(subject = subject, displayName = "Ledger Admin", roles = setOf(UserRole.ADMIN))

    @Test
    fun `successful topup persists ledger entry and idempotency record atomically`() {
        val member = newUser("member")
        val adminSubject = "kc-admin-${UUID.randomUUID()}"
        val key = "topup-${UUID.randomUUID()}"

        val dto = ledgerService.topup(
            TopupRequest(memberId = member.id.toString(), amount = BigDecimal("10.00")),
            key,
            adminPrincipal(adminSubject)
        )

        assertEquals(LedgerEntryType.topup.name, dto.entryType)
        val entries = ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(member.id)
        assertEquals(1, entries.size)
        assertEquals(key, entries.first().idempotencyKey)
        assertTrue(
            idempotencyRecordRepository
                .findByScopeAndIdempotencyKey(LedgerService.SCOPE_TOPUP, key)
                .isPresent,
            "Der Idempotenz-Datensatz muss im selben Vorgang persistiert werden"
        )
    }

    @Test
    fun `repeated topup with the same key does not create a second ledger entry`() {
        val member = newUser("member")
        val adminSubject = "kc-admin-${UUID.randomUUID()}"
        val key = "topup-${UUID.randomUUID()}"
        val request = TopupRequest(memberId = member.id.toString(), amount = BigDecimal("7.50"))

        val first = ledgerService.topup(request, key, adminPrincipal(adminSubject))
        val second = ledgerService.topup(request, key, adminPrincipal(adminSubject))

        assertEquals(first.id, second.id)
        assertEquals(1, ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(member.id).size)
    }

    @Test
    fun `a failure inside the transaction rolls back the financial write completely`() {
        val member = newUser("member")
        val actor = newUser("actor")
        val key = "rollback-${UUID.randomUUID()}"

        val error = assertThrows(IllegalStateException::class.java) {
            transactionTemplate.execute {
                ledgerEntryRepository.saveAndFlush(
                    LedgerEntryEntity(
                        id = UUID.randomUUID(),
                        entryType = LedgerEntryType.topup,
                        member = member,
                        amount = BigDecimal("42.00"),
                        accountingMode = AccountingMode.credit,
                        actor = actor,
                        idempotencyKey = key
                    )
                )
                throw IllegalStateException("Buchung schlägt nach dem Speichern fehl")
            }
        }

        assertEquals("Buchung schlägt nach dem Speichern fehl", error.message)
        assertTrue(
            ledgerEntryRepository.findByIdempotencyKey(key).isEmpty,
            "Nach dem Rollback darf keine Ledger-Buchung zurückbleiben"
        )
        assertTrue(ledgerEntryRepository.findByMemberIdOrderByCreatedAtAsc(member.id).isEmpty())
    }
}
