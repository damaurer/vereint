package de.maurer.baseservice.error

import org.springframework.http.HttpStatus

open class ApiException(
    val errorCode: String,
    override val message: String,
    val status: HttpStatus = HttpStatus.BAD_REQUEST,
    val details: List<String>? = null
) : RuntimeException(message)

class ResourceNotFoundException(
    message: String = "Resource not found",
    errorCode: String = ErrorCode.NOT_FOUND
) : ApiException(errorCode, message, HttpStatus.NOT_FOUND)

class AccessDeniedException(
    message: String = "Access denied",
    errorCode: String = ErrorCode.ACCESS_DENIED
) : ApiException(errorCode, message, HttpStatus.FORBIDDEN)

class PermissionDeniedException(
    message: String = "Permission denied",
    errorCode: String = ErrorCode.PERMISSION_DENIED
) : ApiException(errorCode, message, HttpStatus.FORBIDDEN)

class ProfileNotFoundException(
    message: String = "User profile not found",
    errorCode: String = ErrorCode.PROFILE_NOT_FOUND
) : ApiException(errorCode, message, HttpStatus.FORBIDDEN)

class RoleNotAssignedException(
    message: String = "Required role not assigned",
    errorCode: String = ErrorCode.ROLE_NOT_ASSIGNED
) : ApiException(errorCode, message, HttpStatus.FORBIDDEN)

class AccountDisabledException(
    message: String = "Account is disabled",
    errorCode: String = ErrorCode.ACCOUNT_DISABLED
) : ApiException(errorCode, message, HttpStatus.FORBIDDEN)

class EventNotActiveException(
    message: String = "Event is not active",
    errorCode: String = ErrorCode.EVENT_NOT_ACTIVE
) : ApiException(errorCode, message, HttpStatus.BAD_REQUEST)

class InvitationExpiredException(
    message: String = "Invitation has expired",
    errorCode: String = ErrorCode.INVITATION_EXPIRED
) : ApiException(errorCode, message, HttpStatus.GONE)

class InvitationRevokedException(
    message: String = "Invitation was revoked",
    errorCode: String = ErrorCode.INVITATION_REVOKED
) : ApiException(errorCode, message, HttpStatus.GONE)

class InvitationUsedUpException(
    message: String = "Invitation has already been used",
    errorCode: String = ErrorCode.INVITATION_USED_UP
) : ApiException(errorCode, message, HttpStatus.GONE)

class EmailAlreadyRegisteredException(
    message: String = "An account with this e-mail address already exists",
    errorCode: String = ErrorCode.EMAIL_ALREADY_REGISTERED
) : ApiException(errorCode, message, HttpStatus.CONFLICT)

class PasswordRejectedException(
    message: String = "The password does not meet the requirements",
    errorCode: String = ErrorCode.PASSWORD_REJECTED
) : ApiException(errorCode, message, HttpStatus.BAD_REQUEST)

class RegistrationUnavailableException(
    message: String = "Registration is currently unavailable",
    errorCode: String = ErrorCode.REGISTRATION_UNAVAILABLE
) : ApiException(errorCode, message, HttpStatus.SERVICE_UNAVAILABLE)

class IdempotencyConflictException(
    message: String = "Idempotency conflict detected",
    errorCode: String = ErrorCode.IDEMPOTENCY_CONFLICT
) : ApiException(errorCode, message, HttpStatus.CONFLICT)

class ConsentRequiredException(
    message: String = "Explicit consent is required",
    errorCode: String = ErrorCode.CONSENT_REQUIRED
) : ApiException(errorCode, message, HttpStatus.BAD_REQUEST)

class InvalidRequestException(
    message: String = "Invalid request payload or parameters",
    errorCode: String = ErrorCode.INVALID_REQUEST,
    details: List<String>? = null
) : ApiException(errorCode, message, HttpStatus.BAD_REQUEST, details)

class SelfPrivilegeChangeDeniedException(
    message: String = "Changing own roles, permissions or status is not allowed",
    errorCode: String = ErrorCode.SELF_PRIVILEGE_CHANGE_DENIED
) : ApiException(errorCode, message, HttpStatus.FORBIDDEN)

class LastAdminProtectedException(
    message: String = "At least one active administrator account must remain",
    errorCode: String = ErrorCode.LAST_ADMIN_PROTECTED
) : ApiException(errorCode, message, HttpStatus.FORBIDDEN)

class ConcurrentModificationException(
    message: String = "Resource was modified concurrently",
    errorCode: String = ErrorCode.CONCURRENT_MODIFICATION
) : ApiException(errorCode, message, HttpStatus.CONFLICT)
