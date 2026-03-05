"""Config router — submit configuration changes to downstream services.

Endpoint:
    POST /api/v1/proxy/{service_name}/config — submit config change

Note: This router is mounted under /api/v1/proxy to match the design spec
path POST /api/v1/proxy/{service_name}/config.

Requirements: 10.3
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from src.application.services.config_service import ConfigService
from src.domain.entities.admin_user import AdminUser
from src.presentation.middleware.jwt_validation import AdminRole, require_roles

router = APIRouter(tags=["config"])


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------


class ConfigSubmitRequest(BaseModel):
    config: dict[str, Any]


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def _get_config_service(request: Request) -> ConfigService:
    return request.app.state.config_service  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/proxy/{service_name}/config")
async def submit_config(
    service_name: str,
    body: ConfigSubmitRequest,
    request: Request,
    config_service: ConfigService = Depends(_get_config_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> dict[str, Any]:
    """Submit a configuration change for a registered service.

    Validates the payload against the service's configSchema before
    forwarding to the target service.

    Requirements: 10.3
    """
    user_roles = [r.value for r in current_user.roles]
    result = await config_service.submit_config(
        service_name=service_name,
        payload=body.config,
        user_id=current_user.user_id,
        user_roles=user_roles,
    )
    return result
