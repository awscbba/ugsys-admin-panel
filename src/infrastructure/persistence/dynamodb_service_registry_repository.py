"""DynamoDB-backed Service Registry repository.

Table: ``ugsys-admin-registry-{env}``
PK: ``SERVICE#{service_name}``  SK: ``SERVICE``
GSI ``StatusIndex``: PK ``status``, SK ``updated_at``

Requirements: 4.2, 4.3
"""

from __future__ import annotations

import json
import os
from typing import Any

import boto3
import boto3.dynamodb.conditions
import structlog
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

from src.domain.entities import PluginManifest, ServiceRegistration
from src.domain.exceptions import NotFoundError, RepositoryError
from src.domain.repositories.service_registry_repository import ServiceRegistryRepository
from src.domain.value_objects import NavigationEntry, RouteDescriptor, ServiceStatus

logger = structlog.get_logger(__name__)


def _table_name() -> str:
    # CDK sets SERVICE_REGISTRY_TABLE_NAME — use it when available.
    # Fallback matches the CDK-provisioned name for local/test environments.
    explicit = os.getenv("SERVICE_REGISTRY_TABLE_NAME")
    if explicit:
        return explicit
    env = os.getenv("ENVIRONMENT", "dev")
    return f"ugsys-admin-service-registry-{env}"


def _pk(service_name: str) -> str:
    return f"SERVICE#{service_name}"


_SK = "SERVICE"


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------


def _serialize_manifest(manifest: PluginManifest | None) -> str | None:
    """Convert a PluginManifest to a JSON string for DynamoDB storage."""
    if manifest is None:
        return None
    return json.dumps(
        {
            "name": manifest.name,
            "version": manifest.version,
            "entryPoint": manifest.entry_point,
            "routes": [
                {"path": r.path, "requiredRoles": list(r.required_roles), "label": r.label} for r in manifest.routes
            ],
            "navigation": [
                {
                    "label": n.label,
                    "icon": n.icon,
                    "path": n.path,
                    "requiredRoles": list(n.required_roles),
                    **({"group": n.group} if n.group is not None else {}),
                    "order": n.order,
                }
                for n in manifest.navigation
            ],
            **({"stylesheetUrl": manifest.stylesheet_url} if manifest.stylesheet_url is not None else {}),
            **({"configSchema": manifest.config_schema} if manifest.config_schema is not None else {}),
            **({"healthEndpoint": manifest.health_endpoint} if manifest.health_endpoint is not None else {}),
            **(
                {"requiredPermissions": manifest.required_permissions}
                if manifest.required_permissions is not None
                else {}
            ),
        }
    )


def _deserialize_manifest(raw: str | None) -> PluginManifest | None:
    """Reconstruct a PluginManifest from its JSON string."""
    if raw is None:
        return None
    data: dict[str, Any] = json.loads(raw)
    return PluginManifest(
        name=data["name"],
        version=data["version"],
        entry_point=data["entryPoint"],
        routes=[
            RouteDescriptor(
                path=r["path"],
                required_roles=tuple(r["requiredRoles"]),
                label=r["label"],
            )
            for r in data.get("routes", [])
        ],
        navigation=[
            NavigationEntry(
                label=n["label"],
                icon=n["icon"],
                path=n["path"],
                required_roles=tuple(n["requiredRoles"]),
                group=n.get("group"),
                order=n.get("order", 0),
            )
            for n in data.get("navigation", [])
        ],
        stylesheet_url=data.get("stylesheetUrl"),
        config_schema=data.get("configSchema"),
        health_endpoint=data.get("healthEndpoint"),
        required_permissions=data.get("requiredPermissions"),
    )


def _to_item(reg: ServiceRegistration) -> dict[str, Any]:
    """Map a domain entity to a DynamoDB item dict."""
    item: dict[str, Any] = {
        "pk": _pk(reg.service_name),
        "sk": _SK,
        "service_name": reg.service_name,
        "base_url": reg.base_url,
        "health_endpoint": reg.health_endpoint,
        "manifest_url": reg.manifest_url,
        "min_role": reg.min_role,
        "status": reg.status.value,
        "version": reg.version,
        "registered_at": reg.registered_at,
        "updated_at": reg.updated_at,
        "registered_by": reg.registered_by,
        "registration_source": reg.registration_source,
    }
    manifest_json = _serialize_manifest(reg.manifest)
    if manifest_json is not None:
        item["manifest"] = manifest_json
    return item


def _from_item(item: dict[str, Any]) -> ServiceRegistration:
    """Reconstruct a domain entity from a DynamoDB item dict."""
    return ServiceRegistration(
        service_name=item["service_name"],
        base_url=item["base_url"],
        health_endpoint=item["health_endpoint"],
        manifest_url=item["manifest_url"],
        manifest=_deserialize_manifest(item.get("manifest")),
        min_role=item["min_role"],
        status=ServiceStatus(item["status"]),
        version=int(item["version"]),
        registered_at=item["registered_at"],
        updated_at=item["updated_at"],
        registered_by=item["registered_by"],
        registration_source=item["registration_source"],
    )


# ---------------------------------------------------------------------------
# Repository implementation
# ---------------------------------------------------------------------------


class DynamoDBServiceRegistryRepository(ServiceRegistryRepository):
    """Concrete DynamoDB adapter for the Service Registry port."""

    def __init__(self, dynamodb_resource: Any | None = None) -> None:
        resource = dynamodb_resource or boto3.resource("dynamodb")
        self._table = resource.Table(_table_name())

    # -- write ---------------------------------------------------------------

    async def save(self, registration: ServiceRegistration) -> None:
        """Persist a service registration (put item).

        On re-registration the caller is expected to have already
        incremented the version field.
        """
        try:
            self._table.put_item(Item=_to_item(registration))
        except ClientError as exc:
            raise RepositoryError(
                f"Failed to save service registration '{registration.service_name}'.",
            ) from exc

    # -- read ----------------------------------------------------------------

    async def get_by_name(self, service_name: str) -> ServiceRegistration | None:
        """Fetch a single registration by service name."""
        try:
            response = self._table.get_item(
                Key={"pk": _pk(service_name), "sk": _SK},
            )
        except ClientError as exc:
            raise RepositoryError(
                f"Failed to retrieve service '{service_name}'.",
            ) from exc

        item = response.get("Item")
        if item is None:
            return None
        return _from_item(item)

    async def list_all(self) -> list[ServiceRegistration]:
        """Scan the table for all SERVICE items."""
        try:
            items: list[dict[str, Any]] = []
            scan_kwargs: dict[str, Any] = {
                "FilterExpression": Attr("sk").eq(_SK),
            }
            while True:
                response = self._table.scan(**scan_kwargs)
                items.extend(response.get("Items", []))
                last_key = response.get("LastEvaluatedKey")
                if last_key is None:
                    break
                scan_kwargs["ExclusiveStartKey"] = last_key
            return [_from_item(item) for item in items]
        except ClientError as exc:
            error_code = exc.response["Error"]["Code"]
            logger.error(
                "dynamodb.list_all_failed",
                table=self._table.name,
                error_code=error_code,
                error=str(exc),
            )
            raise RepositoryError("Failed to list service registrations.") from exc
        except Exception as exc:
            logger.error(
                "dynamodb.list_all_deserialization_failed",
                table=self._table.name,
                error=str(exc),
            )
            raise RepositoryError("Failed to list service registrations.") from exc

    # -- delete --------------------------------------------------------------

    async def delete(self, service_name: str) -> None:
        """Remove a registration. Raises ``NotFoundError`` if absent."""
        try:
            self._table.delete_item(
                Key={"pk": _pk(service_name), "sk": _SK},
                ConditionExpression="attribute_exists(pk)",
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise NotFoundError(
                    f"Service '{service_name}' not found in registry.",
                ) from exc
            raise RepositoryError(
                f"Failed to delete service '{service_name}'.",
            ) from exc

    # -- seed upsert ---------------------------------------------------------

    async def upsert_seed(self, registration: ServiceRegistration) -> None:
        """Insert or update a seed entry.

        Writes only when:
        - The item does not exist, OR
        - The stored version is lower than the incoming seed version.
        """
        item = _to_item(registration)
        try:
            self._table.put_item(
                Item=item,
                ConditionExpression=("attribute_not_exists(pk) OR version < :v"),
                ExpressionAttributeValues={":v": registration.version},
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                # Existing entry has equal or higher version — skip silently.
                return
            raise RepositoryError(
                f"Failed to upsert seed service '{registration.service_name}'.",
            ) from exc
