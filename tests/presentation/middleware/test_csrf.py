"""Unit tests for CsrfMiddleware — focusing on public path exemptions."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.presentation.middleware.csrf import CsrfMiddleware


@pytest.fixture
def app() -> FastAPI:
    _app = FastAPI()
    _app.add_middleware(CsrfMiddleware)

    @_app.post("/api/v1/auth/login")
    async def login() -> dict:  # type: ignore[type-arg]
        return {"ok": True}

    @_app.post("/api/v1/auth/refresh")
    async def refresh() -> dict:  # type: ignore[type-arg]
        return {"ok": True}

    @_app.post("/api/v1/protected")
    async def protected() -> dict:  # type: ignore[type-arg]
        return {"ok": True}

    return _app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


def test_login_exempt_from_csrf(client: TestClient) -> None:
    """POST /api/v1/auth/login must not require CSRF token."""
    response = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "x"})
    assert response.status_code == 200


def test_refresh_exempt_from_csrf(client: TestClient) -> None:
    """POST /api/v1/auth/refresh must not require CSRF token."""
    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 200


def test_protected_route_requires_csrf(client: TestClient) -> None:
    """Non-exempt POST routes must be blocked without CSRF token."""
    response = client.post("/api/v1/protected")
    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"


def test_protected_route_passes_with_valid_csrf(client: TestClient) -> None:
    """Non-exempt POST routes pass when CSRF cookie and header match."""
    # First GET to receive the csrf_token cookie
    get_resp = client.get("/api/v1/auth/login")  # any path to trigger cookie issuance
    csrf_token = get_resp.cookies.get("csrf_token", "")
    if not csrf_token:
        # Cookie may be set on any response — do a dummy GET via protected
        get_resp = client.get("/api/v1/protected")
        csrf_token = get_resp.cookies.get("csrf_token", "")

    response = client.post(
        "/api/v1/protected",
        cookies={"csrf_token": csrf_token},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 200
