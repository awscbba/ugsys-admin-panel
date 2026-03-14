"""Registry router — service registration, discovery, and config schema.

Endpoints:
    POST   /api/v1/registry/services                              — register/update service
    GET    /api/v1/registry/services                              — list services (role-filtered)
    DELETE /api/v1/registry/services/{service_name}               — deregister (super_admin only)
    GET    /api/v1/registry/services/{service_name}/config-schema — config schema

Requirements: 4.1, 4.4, 4.7, 10.1
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from src.application.services.registry_service import RegistryService
from src.domain.entities.admin_user import AdminUser
from src.domain.entities.service_registration import ServiceRegistration
from src.presentation.middleware.jwt_validation import (
    AdminRole,
    get_current_user,
    require_roles,
)

router = APIRouter(prefix="/registry", tags=["registry"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class RegisterServiceRequest(BaseModel):
    service_name: str
    base_url: str
    health_endpoint: str
    manifest_url: str
    min_role: str = "admin"


class RouteDescriptorResponse(BaseModel):
    path: str
    required_roles: list[str]
    label: str


class NavigationEntryResponse(BaseModel):
    label: str
    icon: str
    path: str
    required_roles: list[str]
    group: str | None = None
    order: int = 0


class PluginManifestResponse(BaseModel):
    name: str
    version: str
    entryPoint: str
    routes: list[RouteDescriptorResponse]
    navigation: list[NavigationEntryResponse]
    stylesheetUrl: str | None = None
    configSchema: dict[str, Any] | None = None
    healthEndpoint: str | None = None
    requiredPermissions: list[str] | None = None


class ServiceResponse(BaseModel):
    service_name: str
    base_url: str
    health_endpoint: str
    manifest_url: str
    manifest: PluginManifestResponse | None
    min_role: str
    status: str
    version: int
    registered_at: str
    updated_at: str
    registered_by: str
    registration_source: str
    has_manifest: bool
    has_config_schema: bool


def _manifest_to_response(manifest: Any) -> PluginManifestResponse | None:
    if manifest is None:
        return None
    return PluginManifestResponse(
        name=manifest.name,
        version=manifest.version,
        entryPoint=manifest.entry_point,
        routes=[
            RouteDescriptorResponse(
                path=r.path,
                required_roles=list(r.required_roles),
                label=r.label,
            )
            for r in manifest.routes
        ],
        navigation=[
            NavigationEntryResponse(
                label=n.label,
                icon=n.icon,
                path=n.path,
                required_roles=list(n.required_roles),
                group=n.group,
                order=n.order,
            )
            for n in manifest.navigation
        ],
        stylesheetUrl=manifest.stylesheet_url,
        configSchema=manifest.config_schema,
        healthEndpoint=manifest.health_endpoint,
        requiredPermissions=manifest.required_permissions,
    )


def _to_response(reg: ServiceRegistration) -> ServiceResponse:
    return ServiceResponse(
        service_name=reg.service_name,
        base_url=reg.base_url,
        health_endpoint=reg.health_endpoint,
        manifest_url=reg.manifest_url,
        manifest=_manifest_to_response(reg.manifest),
        min_role=reg.min_role,
        status=reg.status.value,
        version=reg.version,
        registered_at=reg.registered_at,
        updated_at=reg.updated_at,
        registered_by=reg.registered_by,
        registration_source=reg.registration_source,
        has_manifest=reg.manifest is not None,
        has_config_schema=reg.manifest is not None and reg.manifest.config_schema is not None,
    )


# ---------------------------------------------------------------------------
# Dependency: resolve RegistryService from app.state
# ---------------------------------------------------------------------------


def _get_registry_service(request: Request) -> RegistryService:
    return request.app.state.registry_service  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/services", response_model=ServiceResponse, status_code=201)
async def register_service(
    body: RegisterServiceRequest,
    request: Request,
    registry_service: RegistryService = Depends(_get_registry_service),
    current_user: AdminUser = Depends(get_current_user),
) -> ServiceResponse:
    """Register or update a service in the registry.

    Accepts service-to-service JWT (client_credentials) or super_admin
    manual registration.

    Requirements: 4.1, 4.2, 4.3
    """
    registration = await registry_service.register_service(
        service_name=body.service_name,
        base_url=body.base_url,
        health_endpoint=body.health_endpoint,
        manifest_url=body.manifest_url,
        min_role=body.min_role,
        registered_by=current_user.user_id,
        registration_source="api",
    )
    return _to_response(registration)


@router.get("/services", response_model=list[ServiceResponse])
async def list_services(
    request: Request,
    registry_service: RegistryService = Depends(_get_registry_service),
    current_user: AdminUser = Depends(get_current_user),
) -> list[ServiceResponse]:
    """List services filtered by the requesting user's roles.

    Requirements: 4.4
    """
    user_roles = [r.value for r in current_user.roles]
    services = await registry_service.list_services(user_roles)
    return [_to_response(svc) for svc in services]


@router.delete("/services/{service_name}", status_code=204)
async def deregister_service(
    service_name: str,
    request: Request,
    force: bool = Query(default=False, description="Force deletion of seed entries"),
    registry_service: RegistryService = Depends(_get_registry_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.SUPER_ADMIN)),
) -> None:
    """Deregister a service (super_admin only).

    Requirements: 4.7
    """
    user_roles = [r.value for r in current_user.roles]
    await registry_service.deregister_service(
        service_name=service_name,
        user_roles=user_roles,
        force=force,
    )


@router.get("/services/{service_name}/config-schema")
async def get_config_schema(
    service_name: str,
    request: Request,
    registry_service: RegistryService = Depends(_get_registry_service),
    current_user: AdminUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the JSON Schema for a service's configuration form.

    Requirements: 10.1
    """
    schema = await registry_service.get_config_schema(service_name)
    return {"service_name": service_name, "config_schema": schema}
