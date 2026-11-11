package de.maurer.baseservice

import de.maurer.baseservice.domain.DrinkLibraryEntity
import de.maurer.baseservice.dto.DrinkNutritionRequest
import de.maurer.baseservice.dto.ProposeDrinkRequest
import de.maurer.baseservice.dto.UpdateDrinkRequest
import de.maurer.baseservice.repository.DrinkLibraryRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.DrinkCatalogService
import de.maurer.baseservice.tenancy.TenantContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.math.BigDecimal
import java.util.UUID

/** Füllmenge und Kalorien je Portion im Katalog und aus der Getränkedatenbank. */
@SpringBootTest
@ActiveProfiles("test")
class DrinkNutritionIntegrationTest @Autowired constructor(
    private val drinkCatalogService: DrinkCatalogService,
    private val drinkLibraryRepository: DrinkLibraryRepository
) {

    private val board = UserPrincipal(subject = "kc-nutrition-${UUID.randomUUID()}", displayName = "Vorstand", roles = setOf(UserRole.BOARD))

    @Test
    fun `volume and calories are stored, replaced and cleared`() {
        val created = drinkCatalogService.proposeDrink(
            ProposeDrinkRequest(
                name = "Helles ${UUID.randomUUID()}", category = "Bier", defaultPrice = BigDecimal("2.50"),
                nutrition = DrinkNutritionRequest(volumeMl = 500, kcalPerServing = 210)
            ),
            board
        )
        assertEquals(500, created.volumeMl)
        assertEquals(210, created.kcalPerServing)

        val untouched = drinkCatalogService.updateDrink(UUID.fromString(created.id), UpdateDrinkRequest(name = created.name), board)
        assertEquals(500, untouched.volumeMl)

        val cleared = drinkCatalogService.updateDrink(
            UUID.fromString(created.id),
            UpdateDrinkRequest(nutrition = DrinkNutritionRequest(volumeMl = 330, kcalPerServing = null)),
            board
        )
        assertEquals(330, cleared.volumeMl)
        assertNull(cleared.kcalPerServing)
    }

    @Test
    fun `adopting from the drink library takes over its values`() {
        val entry = TenantContext.runAsSystem {
            drinkLibraryRepository.saveAndFlush(
                DrinkLibraryEntity(name = "Pils ${UUID.randomUUID()}", category = "Bier", volumeMl = 330, kcalPerServing = 135)
            )
        }
        val adopted = drinkCatalogService.proposeDrink(
            ProposeDrinkRequest(name = entry.name, defaultPrice = BigDecimal("2.00"), libraryDrinkId = entry.id.toString()),
            board
        )
        assertEquals(330, adopted.volumeMl)
        assertEquals(135, adopted.kcalPerServing)
        assertTrue(adopted.libraryDrinkId == entry.id.toString())
    }
}
