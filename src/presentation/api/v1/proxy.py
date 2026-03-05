"""Proxy router — forward any request to a downstream service.

Endpoint:
    ANY /api/v1/proxy/{service_name}/{path:path}

Resolves the target service from the Service Registry and forwards the
request with the Admin User's JWT and correlation ID.

Requirements: 7.1
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from src.application.services.proxy_service import ProxyService
from src.domain.entities.admin_user import AdminUser
from src.presentation.middleware.jwt_validation import get_current_user

router = APIRouter(prefix="/proxy", tags=["proxy"])

_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]


def _get_proxy_service(request: Request) -> ProxyService:
    return request.app.state.proxy_service  # type: ignore[no-any-return]


async def _proxy_handler(
    service_name: str,
    path: str,
    request: Request,
    proxy_service: ProxyService,
    current_user: AdminUser,
) -> Response:
    """Shared handler for all HTTP methods."""
    # Extract JWT from cookie for forwarding (Req 7.2).
    user_jwt = request.cookies.get("access_token", "")

    # Correlation ID from request state (set by CorrelationIdMiddleware).
    correlation_id: str = getattr(request.state, "correlation_id", "")

    # Read raw body.
    body = await request.body()

    # Build query params dict.
    query_params = dict(request.query_params)

    # Build headers dict (lowercase keys).
    headers = dict(request.headers)

    # User roles for RBAC.
    user_roles = [r.value for r in current_user.roles]

    status_code, response_headers, response_body = await proxy_service.forward(
        service_name=service_name,
        path=path,
        method=request.method,
        headers=headers,
        body=body,
        query_params=query_params,
        user_jwt=user_jwt,
        user_roles=user_roles,
        correlation_id=correlation_id,
    )

    # Determine content type from response headers.
    content_type = response_headers.get("content-type", "application/json")

    return Response(
        content=response_body,
        status_code=status_code,
        headers=response_headers,
        media_type=content_type,
    )


@router.api_route(
    "/{service_name}/{path:path}",
    methods=_METHODS,
)
async def proxy(
    service_name: str,
    path: str,
    request: Request,
    proxy_service: ProxyService = Depends(_get_proxy_service),
    current_user: AdminUser = Depends(get_current_user),
) -> Response:
    """Forward any request to the named downstream service.

    Requirements: 7.1
    """
    return await _proxy_handler(
        service_name=service_name,
        path=path,
        request=request,
        proxy_service=proxy_service,
        current_user=current_user,
    )
