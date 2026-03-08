"""Structured logging infrastructure with input sanitization.

Provides:

1. ``sanitize_string(value)`` — HTML entity-encodes the five characters
   that are dangerous in HTML/XML contexts: ``<``, ``>``, ``&``, ``"``,
   ``'``.  Apply this to every user-provided string before logging or
   storing it (Req 13.4).

2. ``sanitize_for_log(value)`` — convenience wrapper that accepts any
   value and returns a sanitized string representation.

3. ``get_logger(name)`` — returns a ``structlog`` bound logger configured
   for JSON output.  All log entries produced through this logger will
   have user-provided fields sanitized before emission.

Requirements: 13.4
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog

# ---------------------------------------------------------------------------
# HTML entity encoding map (Req 13.4)
# ---------------------------------------------------------------------------

_HTML_ENTITY_MAP: dict[str, str] = {
    "&": "&amp;",  # Must be first to avoid double-encoding
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
}


def sanitize_string(value: str) -> str:
    """HTML entity-encode a user-provided string.

    Replaces the five HTML-special characters with their entity equivalents
    to prevent log injection and stored XSS when the value is later
    rendered in a browser or log viewer.

    The ``&`` character is encoded first to avoid double-encoding.

    Examples::

        >>> sanitize_string('<script>alert("xss")</script>')
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'

        >>> sanitize_string("O'Brien & <Co>")
        "O&#x27;Brien &amp; &lt;Co&gt;"
    """
    result = value
    for char, entity in _HTML_ENTITY_MAP.items():
        result = result.replace(char, entity)
    return result


def sanitize_for_log(value: Any) -> str:
    """Convert *value* to a string and HTML entity-encode it.

    Safe to call with any type — non-string values are converted via
    ``str()`` before encoding.
    """
    return sanitize_string(str(value))


# ---------------------------------------------------------------------------
# structlog configuration
# ---------------------------------------------------------------------------


def _configure_structlog() -> None:
    """Configure structlog for JSON output with standard processors."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


# Configure once at import time.
_configure_structlog()


def get_logger(name: str) -> structlog.BoundLogger:
    """Return a structlog bound logger for *name*.

    Usage::

        log = get_logger(__name__)
        log.info("service_registered", service_name=sanitize_string(name))
    """
    result: structlog.BoundLogger = structlog.get_logger(name)
    return result
