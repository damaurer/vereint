package de.maurer.baseservice.error

import org.springframework.http.HttpStatus

/**
 * Fachliche Ausnahme mit stabilem Fehlercode ([errorCode]) für das Fehlerformat nach RFC 7807.
 *
 * Trägt die Ausnahme einen [messageKey], löst der [GlobalExceptionHandler] den
 * `detail`-Text in der Sprache der Anfrage (`Accept-Language`) über den `MessageSource`
 * auf. [message] enthält dann den Text der Standardsprache (Deutsch) und dient als
 * Rückfallwert sowie für Logs. Ohne Schlüssel wird [message] unverändert ausgeliefert.
 */
open class ApiException(
    val errorCode: String,
    override val message: String,
    val status: HttpStatus = HttpStatus.BAD_REQUEST,
    val details: List<String>? = null,
    val messageKey: String? = null,
    val messageArgs: List<String> = emptyList()
) : RuntimeException(message) {

    /** Übersetzbare Variante: der Text wird über [Msg.key] aus `i18n/messages*.properties` gelesen. */
    constructor(
        errorCode: String,
        msg: Msg,
        status: HttpStatus = HttpStatus.BAD_REQUEST,
        details: List<String>? = null
    ) : this(errorCode, Messages.defaultText(msg), status, details, msg.key, msg.args)
}

class ResourceNotFoundException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.notFound"),
        errorCode: String = ErrorCode.NOT_FOUND
    ) : super(errorCode, msg, HttpStatus.NOT_FOUND)

    constructor(
        message: String,
        errorCode: String = ErrorCode.NOT_FOUND
    ) : super(errorCode, message, HttpStatus.NOT_FOUND)
}

class AccessDeniedException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.accessDenied"),
        errorCode: String = ErrorCode.ACCESS_DENIED
    ) : super(errorCode, msg, HttpStatus.FORBIDDEN)

    constructor(
        message: String,
        errorCode: String = ErrorCode.ACCESS_DENIED
    ) : super(errorCode, message, HttpStatus.FORBIDDEN)
}

class PermissionDeniedException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.permissionDenied"),
        errorCode: String = ErrorCode.PERMISSION_DENIED
    ) : super(errorCode, msg, HttpStatus.FORBIDDEN)

    constructor(
        message: String,
        errorCode: String = ErrorCode.PERMISSION_DENIED
    ) : super(errorCode, message, HttpStatus.FORBIDDEN)
}

class ProfileNotFoundException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.profileNotFound"),
        errorCode: String = ErrorCode.PROFILE_NOT_FOUND
    ) : super(errorCode, msg, HttpStatus.FORBIDDEN)

    constructor(
        message: String,
        errorCode: String = ErrorCode.PROFILE_NOT_FOUND
    ) : super(errorCode, message, HttpStatus.FORBIDDEN)
}

class RoleNotAssignedException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.roleNotAssigned"),
        errorCode: String = ErrorCode.ROLE_NOT_ASSIGNED
    ) : super(errorCode, msg, HttpStatus.FORBIDDEN)

    constructor(
        message: String,
        errorCode: String = ErrorCode.ROLE_NOT_ASSIGNED
    ) : super(errorCode, message, HttpStatus.FORBIDDEN)
}

class AccountDisabledException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.accountDisabled"),
        errorCode: String = ErrorCode.ACCOUNT_DISABLED
    ) : super(errorCode, msg, HttpStatus.FORBIDDEN)

    constructor(
        message: String,
        errorCode: String = ErrorCode.ACCOUNT_DISABLED
    ) : super(errorCode, message, HttpStatus.FORBIDDEN)
}

class EventNotActiveException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.eventNotActive"),
        errorCode: String = ErrorCode.EVENT_NOT_ACTIVE
    ) : super(errorCode, msg, HttpStatus.BAD_REQUEST)

    constructor(
        message: String,
        errorCode: String = ErrorCode.EVENT_NOT_ACTIVE
    ) : super(errorCode, message, HttpStatus.BAD_REQUEST)
}

class InvitationExpiredException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.invitationExpired"),
        errorCode: String = ErrorCode.INVITATION_EXPIRED
    ) : super(errorCode, msg, HttpStatus.GONE)

    constructor(
        message: String,
        errorCode: String = ErrorCode.INVITATION_EXPIRED
    ) : super(errorCode, message, HttpStatus.GONE)
}

class InvitationRevokedException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.invitationRevoked"),
        errorCode: String = ErrorCode.INVITATION_REVOKED
    ) : super(errorCode, msg, HttpStatus.GONE)

    constructor(
        message: String,
        errorCode: String = ErrorCode.INVITATION_REVOKED
    ) : super(errorCode, message, HttpStatus.GONE)
}

class InvitationUsedUpException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.invitationUsedUp"),
        errorCode: String = ErrorCode.INVITATION_USED_UP
    ) : super(errorCode, msg, HttpStatus.GONE)

    constructor(
        message: String,
        errorCode: String = ErrorCode.INVITATION_USED_UP
    ) : super(errorCode, message, HttpStatus.GONE)
}

class EmailAlreadyRegisteredException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.emailAlreadyRegistered"),
        errorCode: String = ErrorCode.EMAIL_ALREADY_REGISTERED
    ) : super(errorCode, msg, HttpStatus.CONFLICT)

    constructor(
        message: String,
        errorCode: String = ErrorCode.EMAIL_ALREADY_REGISTERED
    ) : super(errorCode, message, HttpStatus.CONFLICT)
}

class PasswordRejectedException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.passwordRejected"),
        errorCode: String = ErrorCode.PASSWORD_REJECTED
    ) : super(errorCode, msg, HttpStatus.BAD_REQUEST)

    constructor(
        message: String,
        errorCode: String = ErrorCode.PASSWORD_REJECTED
    ) : super(errorCode, message, HttpStatus.BAD_REQUEST)
}

class RegistrationUnavailableException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.registrationUnavailable"),
        errorCode: String = ErrorCode.REGISTRATION_UNAVAILABLE
    ) : super(errorCode, msg, HttpStatus.SERVICE_UNAVAILABLE)

    constructor(
        message: String,
        errorCode: String = ErrorCode.REGISTRATION_UNAVAILABLE
    ) : super(errorCode, message, HttpStatus.SERVICE_UNAVAILABLE)
}

class IdempotencyConflictException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.idempotencyConflict"),
        errorCode: String = ErrorCode.IDEMPOTENCY_CONFLICT
    ) : super(errorCode, msg, HttpStatus.CONFLICT)

    constructor(
        message: String,
        errorCode: String = ErrorCode.IDEMPOTENCY_CONFLICT
    ) : super(errorCode, message, HttpStatus.CONFLICT)
}

class ConsentRequiredException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.consentRequired"),
        errorCode: String = ErrorCode.CONSENT_REQUIRED
    ) : super(errorCode, msg, HttpStatus.BAD_REQUEST)

    constructor(
        message: String,
        errorCode: String = ErrorCode.CONSENT_REQUIRED
    ) : super(errorCode, message, HttpStatus.BAD_REQUEST)
}

class InvalidRequestException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.invalidRequest"),
        errorCode: String = ErrorCode.INVALID_REQUEST,
        details: List<String>? = null
    ) : super(errorCode, msg, HttpStatus.BAD_REQUEST, details)

    constructor(
        message: String,
        errorCode: String = ErrorCode.INVALID_REQUEST,
        details: List<String>? = null
    ) : super(errorCode, message, HttpStatus.BAD_REQUEST, details)
}

class SelfPrivilegeChangeDeniedException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.selfPrivilegeChange"),
        errorCode: String = ErrorCode.SELF_PRIVILEGE_CHANGE_DENIED
    ) : super(errorCode, msg, HttpStatus.FORBIDDEN)

    constructor(
        message: String,
        errorCode: String = ErrorCode.SELF_PRIVILEGE_CHANGE_DENIED
    ) : super(errorCode, message, HttpStatus.FORBIDDEN)
}

class LastAdminProtectedException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.lastAdmin"),
        errorCode: String = ErrorCode.LAST_ADMIN_PROTECTED
    ) : super(errorCode, msg, HttpStatus.FORBIDDEN)

    constructor(
        message: String,
        errorCode: String = ErrorCode.LAST_ADMIN_PROTECTED
    ) : super(errorCode, message, HttpStatus.FORBIDDEN)
}

class ConcurrentModificationException : ApiException {
    constructor(
        msg: Msg = Msg("error.default.concurrentModification"),
        errorCode: String = ErrorCode.CONCURRENT_MODIFICATION
    ) : super(errorCode, msg, HttpStatus.CONFLICT)

    constructor(
        message: String,
        errorCode: String = ErrorCode.CONCURRENT_MODIFICATION
    ) : super(errorCode, message, HttpStatus.CONFLICT)
}

/** Für das Thekenterminal ist noch keine Kiosk-PIN festgelegt. */
class KioskPinNotConfiguredException(
    msg: Msg = Msg("error.kiosk.pinNotConfigured"),
    errorCode: String = ErrorCode.KIOSK_PIN_NOT_CONFIGURED
) : ApiException(errorCode, msg, HttpStatus.CONFLICT)
