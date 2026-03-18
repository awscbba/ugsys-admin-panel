"""Unit tests for SecurityHeadersMiddleware."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.presentation.middleware.security_headers import (
    SecurityHeadersMiddleware,
    _build_csp,
    _parse_origins,
    _SsmOriginsCache,
)

# ---------------------------------------------------------------------------
# _build_csp unit tests
# ---------------------------------------------------------------------------


def test_build_csp_no_extra_origins() -> None:
    csp = _build_csp([])
    assert "script-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp


def test_build_csp_with_extra_origins() -> None:
    csp = _build_csp(["https://registry.apps.cloud.org.bo"])
    assert "script-src 'self' https://registry.apps.cloud.org.bo" in csp


def test_build_csp_with_multiple_extra_origins() -> None:
    csp = _build_csp(["https://registry.apps.cloud.org.bo", "https://profiles.apps.cloud.org.bo"])
    assert "https://registry.apps.cloud.org.bo" in csp
    assert "https://profiles.apps.cloud.org.bo" in csp


# ---------------------------------------------------------------------------
# Middleware integration tests
# ---------------------------------------------------------------------------


def _make_app(extra_script_origins: list[str] | None = None) -> FastAPI:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware, extra_script_origins=extra_script_origins or [])

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"ok": "true"}

    return app


@pytest.mark.anyio
async def test_static_security_headers_present() -> None:
    app = _make_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "max-age=31536000" in response.headers["strict-transport-security"]
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


@pytest.mark.anyio
async def test_csp_header_present_with_self_only() -> None:
    app = _make_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping")

    csp = response.headers["content-security-policy"]
    assert "script-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp


@pytest.mark.anyio
async def test_csp_includes_extra_script_origin() -> None:
    app = _make_app(extra_script_origins=["https://registry.apps.cloud.org.bo"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping")

    csp = response.headers["content-security-policy"]
    assert "https://registry.apps.cloud.org.bo" in csp


@pytest.mark.anyio
async def test_server_header_removed() -> None:
    app = _make_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping")

    assert "server" not in response.headers


@pytest.mark.anyio
async def test_csp_from_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    """When CSP_SCRIPT_ORIGINS_PARAM is absent, _SsmOriginsCache falls back to CSP_SCRIPT_ORIGINS."""
    monkeypatch.delenv("CSP_SCRIPT_ORIGINS_PARAM", raising=False)
    monkeypatch.setenv(
        "CSP_SCRIPT_ORIGINS",
        "https://registry.apps.cloud.org.bo,https://profiles.apps.cloud.org.bo",
    )

    cache = _SsmOriginsCache()
    origins = cache.get()
    assert "https://registry.apps.cloud.org.bo" in origins
    assert "https://profiles.apps.cloud.org.bo" in origins

    # Verify the middleware uses those origins when no override is passed
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware, extra_script_origins=origins)

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"ok": "true"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping")

    csp = response.headers["content-security-policy"]
    assert "https://registry.apps.cloud.org.bo" in csp
    assert "https://profiles.apps.cloud.org.bo" in csp


def test_parse_origins_deduplicates_and_strips() -> None:
    result = _parse_origins("  https://a.example.com , https://b.example.com , ")
    assert result == ["https://a.example.com", "https://b.example.com"]


def test_parse_origins_empty_string() -> None:
    assert _parse_origins("") == []
