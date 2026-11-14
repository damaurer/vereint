package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.TallyCategoryEntity
import java.math.BigDecimal

/**
 * Zentrale Preisermittlung für Getränke im Event (Issue #80).
 *
 * Im Event gilt: **Kategoriepreis > Event-Preis > Getränkepreis.** Gehört das
 * Getränk zu einer (nicht gelöschten) Strich-Kategorie, zählt deren Preis je
 * Strich, egal ob am Thekenterminal oder per Scan am Handy gebucht wird. Sonst
 * gilt der Preis des Eventgetränks; er stammt aus der Getränkeliste oder wurde
 * beim Hinzufügen gesetzt und fällt ohne Angabe auf den Getränkepreis zurück.
 * Außerhalb von Events gibt es keine Kategorien.
 */
object EventDrinkPricing {

    data class Resolved(
        val unitPrice: BigDecimal,
        val currency: String,
        /** Kategorie, deren Preis gilt; `null`, wenn das Getränk keine hat. */
        val tallyCategory: TallyCategoryEntity?
    )

    fun resolve(eventDrink: EventDrinkEntity): Resolved {
        val category = activeCategory(eventDrink)
        return if (category != null) {
            Resolved(category.price.setScale(2), category.currency, category)
        } else {
            Resolved(eventDrink.price.setScale(2), eventDrink.currency, null)
        }
    }

    fun activeCategory(eventDrink: EventDrinkEntity): TallyCategoryEntity? =
        eventDrink.drink?.tallyCategory?.takeUnless { it.archived }
}
