package de.maurer.baseservice.security

object UserRole {
    const val MEMBER = "member"
    const val BOARD = "board"
    const val ADMIN = "admin"

    val ALL = setOf(MEMBER, BOARD, ADMIN)
}

object BoardRole {
    const val CHAIR = "chair"
    const val TREASURER = "treasurer"
    const val SECRETARY = "secretary"
    const val ASSESSOR = "assessor"

    val ALL = setOf(CHAIR, TREASURER, SECRETARY, ASSESSOR)
}

object AppContext {
    const val MEMBER_PWA = "memberPwa"
    const val EVENT = "event"
    const val EVENT_OWNER = "eventOwner"
    const val BOARD_GENERAL = "boardGeneral"
    const val BOARD_TREASURY = "boardTreasury"
    const val BOARD_COMMUNICATIONS = "boardCommunications"
    const val ADMIN = "admin"
    const val TABLET_RECORDER = "tabletRecorder"
    const val EVENT_GUEST = "eventGuest"
}

object Permission {
    const val PROFILE_READ_SELF = "profile.read.self"
    const val BALANCE_READ_SELF = "balance.read.self"
    const val EVENT_CREATE = "event.create"
    const val EVENT_MANAGE = "event.manage"
    const val EVENT_INVITES_MANAGE = "event.invites.manage"
    const val CATALOG_PROPOSE = "catalog.propose"
    const val CATALOG_APPROVE = "catalog.approve"
    const val LEDGER_READ = "ledger.read"
    const val LEDGER_CORRECT = "ledger.correct"
    const val PURCHASE_SELF = "purchase.self"
    const val PURCHASE_TABLET = "purchase.tablet"
    const val CHAT_MEMBER = "chat.member"
    const val CHAT_EVENT = "chat.event"
    const val AUDIT_READ = "audit.read"
}

object PurchaseSource {
    const val PWA_BARCODE = "pwaBarcode"
    const val TABLET_MANUAL = "tabletManual"
    const val ROUND = "round"
    const val EVENING = "evening"
}

object AccountingMode {
    const val CREDIT = "credit"
    const val REVENUE_ONLY = "revenueOnly"
}

object EventStatus {
    const val DRAFT = "draft"
    const val PUBLISHED = "published"
    const val ACTIVE = "active"
    const val CANCELLED = "cancelled"
    const val COMPLETED = "completed"
    const val ARCHIVED = "archived"
}

object GuestStatus {
    const val PENDING = "pending"
    const val ACTIVE = "active"
    const val REVOKED = "revoked"
    const val EXPIRED = "expired"
}
