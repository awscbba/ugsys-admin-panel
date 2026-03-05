"""CORS configuration helper.

Provides a factory function that returns a configured
``CORSMiddleware`` instance for the FastAPI application.

The origin allowlist is loaded from the ``CORS_ALLOWED_ORIGINS``
environment variable (comma-separated) and always includes the
production Admin Shell origin ``https://admin.apps.cloud.org.bo``.

Requests from origins not in the allowlist will NOT receive
``Access-Control-Allow-Origin`` headers, effectively blocking
cross-origin access from unlisted origins.

Requirements: 13.2
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Production Admin Shell origin — always included.
_DEFAULT_ORIGINS = ["https://admin.apps.cloud.org.bo"]


def get_allowed_origins() -> list[str]:
    """Return the CORS origin allowlist.

    Merges the hard-coded production origin with any additional origins
    declared in the ``CORS_ALLOWED_ORIGINS`` environment variable
    (comma-separated list).
    """
    extra = os.environ.get("CORS_ALLOWED_ORIGINS", "")
    extra_origins = [o.strip() for o in extra.split(",") if o.strip()]
    # Deduplicate while preserving order.
    seen: set[str] = set()
    result: list[str] = []
    for origin in _DEFAULT_ORIGINS + extra_origins:
        if origin not in seen:
            seen.add(origin)
            result.append(origin)
    return result


def add_cors_middleware(app: FastAPI) -> None:
    """Register the CORS middleware on *app* with the configured allowlist.

    Call this during application startup before adding other middleware
    so that CORS preflight responses are handled correctly.
    """
    allowed_origins = get_allowed_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
