package de.maurer.baseservice.domain

/**
 * Versionierte Kotlin-Abbildung der gemeinsamen Datenverträge aus `AGENTS.md`.
 *
 * Die Enum-Konstanten sind absichtlich exakt so geschrieben wie die zulässigen
 * Datenbank- und JSON-Werte, damit `@Enumerated(EnumType.STRING)` und die
 * `CHECK`-Constraints aus `002-integrity-constraints.xml` deckungsgleich sind.
 */
enum class AccountingMode {
    credit,
    revenueOnly;

    companion object {
        fun fromValue(value: String?): AccountingMode? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

enum class PurchaseSource {
    pwaBarcode,
    tabletManual,
    round,
    evening;

    companion object {
        fun fromValue(value: String?): PurchaseSource? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

/**
 * Buchungsart einer Ledger-Zeile (TICKET-015).
 *
 * `purchase` ist der Getränkekauf (mit Event, Getränk und Beleg-Snapshot);
 * `topup` lädt persönliches Guthaben auf, `payout` zahlt es aus und `correction`
 * ist eine Gegenbuchung zu einer bestehenden Zeile. Topup, Payout und Correction
 * benötigen weder Event noch Getränk. Die Datenbank erzwingt genau diese Menge
 * über `ck_ledger_entries_entry_type`.
 */
enum class LedgerEntryType {
    purchase,
    topup,
    payout,
    correction;

    companion object {
        fun fromValue(value: String?): LedgerEntryType? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

enum class EventStatus {
    draft,
    published,
    active,
    cancelled,
    completed,
    archived;

    companion object {
        fun fromValue(value: String?): EventStatus? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

enum class UserRole {
    member,
    board,
    admin;

    companion object {
        fun fromValue(value: String?): UserRole? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

/**
 * Wertebereich der Spalte `user_roles.role`.
 *
 * Er umfasst die Vertragsrollen aus [UserRole] und zusätzlich die technische
 * Tablet-Rolle `tabletRecorder`; die Datenbank erzwingt genau diese Menge über
 * `ck_user_roles_role`. [UserRole] bleibt unverändert der fachliche Datenvertrag
 * aus `AGENTS.md`.
 */
enum class AssignedRole {
    member,
    board,
    admin,
    tabletRecorder;

    companion object {
        fun fromValue(value: String?): AssignedRole? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

enum class BoardRole {
    chair,
    treasurer,
    secretary,
    assessor;

    companion object {
        fun fromValue(value: String?): BoardRole? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

/** Antwort eines eingeladenen Mitglieds auf ein Event; die Datenbank erzwingt sie über `ck_event_participants_rsvp`. */
enum class RsvpStatus {
    invited,
    accepted,
    maybe,
    declined;

    companion object {
        fun fromValue(value: String?): RsvpStatus? = entries.firstOrNull { it.name == value }
    }
}

enum class GuestStatus {
    pending,
    active,
    revoked,
    expired;

    companion object {
        fun fromValue(value: String?): GuestStatus? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

/**
 * Freigabezustand eines globalen Getränks (TICKET-012).
 *
 * Neue Getränke werden als [proposed] vorgeschlagen; Vorstand und Administration
 * überführen sie nach [approved] oder [rejected]. Die Datenbank erzwingt genau
 * diese Menge über `ck_drink_catalog_status`.
 */
enum class DrinkStatus {
    proposed,
    approved,
    rejected;

    companion object {
        fun fromValue(value: String?): DrinkStatus? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

/**
 * Verwendungszweck eines Bildes im S3-kompatiblen Speicher (TICKET-014).
 *
 * Bilder sind zweckgebunden; der Zweck bestimmt zusammen mit dem Eigentümer und
 * dem referenzierten Objekt (`target_id`) die serverseitige Berechtigungsprüfung.
 * Die Datenbank erzwingt genau diese Menge über `ck_image_assets_purpose`.
 */
enum class ImagePurpose {
    profile,
    event,
    drink,
    moment;

    companion object {
        fun fromValue(value: String?): ImagePurpose? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}

/**
 * Lebenszyklus eines Bildmetadatensatzes (TICKET-014).
 *
 * Ein Bild ist [active], solange es die aktuell gültige Referenz eines Objekts
 * ist. Wird es durch eine neue Version ersetzt oder gelöscht, wechselt es nach
 * [deleted]; die Datenbank erzwingt die Menge über `ck_image_assets_status`.
 */
enum class ImageStatus {
    active,
    deleted;

    companion object {
        fun fromValue(value: String?): ImageStatus? = entries.firstOrNull { it.name == value }
        fun values(): Set<String> = entries.map { it.name }.toSet()
    }
}
