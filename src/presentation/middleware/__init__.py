"""BFF middleware stack.

Middleware modules in recommended registration order:

1. ``CorrelationIdMiddleware``  — assigns/propagates X-Request-ID
2. ``SecurityHeadersMiddleware`` — adds security response headers
3. ``CsrfMiddleware``           — Double Submit Cookie CSRF protection
4. ``RateLimitingMiddleware``   — per-user and per-IP rate limits
5. ``JwtValidationMiddleware``  — RS256 JWT validation + claim extraction

CORS and body size limit are registered separately via FastAPI helpers
(``add_cors_middleware`` and ``BodySizeLimitMiddleware``).
"""

from src.presentation.middleware.audit_logging import AuditLoggingMiddleware
from src.presentation.middleware.body_size_limit import BodySizeLimitMiddleware
from src.presentation.middleware.correlation_id import CorrelationIdMiddleware
from src.presentation.middleware.cors import add_cors_middleware, get_allowed_origins
from src.presentation.middleware.csrf import CsrfMiddleware
from src.presentation.middleware.jwt_validation import (
    JwtValidationMiddleware,
    get_current_user,
    require_roles,
)
from src.presentation.middleware.rate_limiting import RateLimitingMiddleware
from src.presentation.middleware.security_headers import SecurityHeadersMiddleware

__all__ = [
    "AuditLoggingMiddleware",
    "BodySizeLimitMiddleware",
    "CorrelationIdMiddleware",
    "CsrfMiddleware",
    "JwtValidationMiddleware",
    "RateLimitingMiddleware",
    "SecurityHeadersMiddleware",
    "add_cors_middleware",
    "get_allowed_origins",
    "get_current_user",
    "require_roles",
]
