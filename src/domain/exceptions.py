"""Domain exception hierarchy for the Admin Panel BFF Proxy.

Each exception carries an ``error_code`` (machine-readable) and a safe
``message`` (user-facing, no internal details) that map directly to the
platform-standard JSON error envelope::

    {"error": "<error_code>", "message": "<safe message>", "data": {}}

Requirements: 7.4, 7.5, 9.6, 10.5, 13.3
"""

from __future__ import annotations


class DomainError(Exception):
    """Base class for all domain exceptions.

    Every subclass MUST set a default ``error_code`` and ``http_status``
    so that the presentation layer can translate exceptions into the
    correct HTTP response without inspecting exception types.
    """

    error_code: str = "INTERNAL_ERROR"
    http_status: int = 500

    def __init__(
        self,
        message: str = "An unexpected error occurred.",
        *,
        user_message: str | None = None,
        error_code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message  # internal — for logs only
        self.user_message = user_message if user_message is not None else message
        if error_code is not None:
            self.error_code = error_code


class ValidationError(DomainError):
    """Invalid input: manifest, config payload, or malformed request (HTTP 422)."""

    error_code: str = "VALIDATION_ERROR"
    http_status: int = 422


class NotFoundError(DomainError):
    """Requested resource does not exist (HTTP 404)."""

    error_code: str = "NOT_FOUND"
    http_status: int = 404


class ConflictError(DomainError):
    """Resource state conflict (HTTP 409)."""

    error_code: str = "CONFLICT"
    http_status: int = 409


class AuthenticationError(DomainError):
    """Invalid or expired credentials / JWT (HTTP 401)."""

    error_code: str = "AUTHENTICATION_ERROR"
    http_status: int = 401


class AuthorizationError(DomainError):
    """Insufficient roles or permissions (HTTP 403)."""

    error_code: str = "FORBIDDEN"
    http_status: int = 403


class ExternalServiceError(DomainError):
    """Downstream service unavailable or circuit breaker open (HTTP 502)."""

    error_code: str = "EXTERNAL_SERVICE_ERROR"
    http_status: int = 502


class RepositoryError(DomainError):
    """Persistence layer failure — e.g. DynamoDB errors (HTTP 500)."""

    error_code: str = "REPOSITORY_ERROR"
    http_status: int = 500


class GatewayTimeoutError(DomainError):
    """Downstream service did not respond in time (HTTP 504)."""

    error_code: str = "GATEWAY_TIMEOUT"
    http_status: int = 504


class RateLimitError(DomainError):
    """Request rate exceeded (HTTP 429)."""

    error_code: str = "RATE_LIMIT_EXCEEDED"
    http_status: int = 429


class PayloadTooLargeError(DomainError):
    """Request body exceeds the 1 MB limit (HTTP 413)."""

    error_code: str = "PAYLOAD_TOO_LARGE"
    http_status: int = 413
