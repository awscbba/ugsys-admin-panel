"""Unit tests for DynamoDBServiceRegistryRepository.list_all error handling.

Covers:
- ClientError from DynamoDB scan → RepositoryError with error_code logged
- Deserialization failure (_from_item raises) → RepositoryError (not unhandled)
- Happy path returns deserialized entities
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from src.domain.entities import ServiceRegistration
from src.domain.exceptions import RepositoryError
from src.domain.value_objects import ServiceStatus
from src.infrastructure.persistence.dynamodb_service_registry_repository import (
    DynamoDBServiceRegistryRepository,
    _to_item,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_registration(**kwargs: Any) -> ServiceRegistration:
    defaults: dict[str, Any] = {
        "service_name": "identity-manager",
        "base_url": "https://auth.apps.cloud.org.bo",
        "health_endpoint": "/health",
        "manifest_url": "https://auth.apps.cloud.org.bo/plugin-manifest.json",
        "manifest": None,
        "min_role": "admin",
        "status": ServiceStatus.ACTIVE,
        "version": 1,
        "registered_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
        "registered_by": "seed",
        "registration_source": "seed",
    }
    defaults.update(kwargs)
    return ServiceRegistration(**defaults)


def _make_client_error(code: str = "ResourceNotFoundException") -> ClientError:
    return ClientError(
        {"Error": {"Code": code, "Message": "Table not found"}},
        "Scan",
    )


def _make_repo(scan_response: Any = None, scan_side_effect: Any = None) -> DynamoDBServiceRegistryRepository:
    """Build a repo with a mocked boto3 Table."""
    mock_table = MagicMock()
    mock_table.name = "ugsys-admin-service-registry-test"

    if scan_side_effect is not None:
        mock_table.scan.side_effect = scan_side_effect
    elif scan_response is not None:
        mock_table.scan.return_value = scan_response

    mock_resource = MagicMock()
    mock_resource.Table.return_value = mock_table

    repo = DynamoDBServiceRegistryRepository(dynamodb_resource=mock_resource)
    return repo


# ---------------------------------------------------------------------------
# list_all — ClientError path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_all_raises_repository_error_on_client_error() -> None:
    """ClientError from DynamoDB scan must be wrapped in RepositoryError."""
    repo = _make_repo(scan_side_effect=_make_client_error("ResourceNotFoundException"))

    with pytest.raises(RepositoryError) as exc_info:
        await repo.list_all()

    assert "Failed to list service registrations." in str(exc_info.value)


@pytest.mark.asyncio
async def test_list_all_raises_repository_error_on_access_denied() -> None:
    """AccessDeniedException must also be wrapped — not leak as ClientError."""
    repo = _make_repo(scan_side_effect=_make_client_error("AccessDeniedException"))

    with pytest.raises(RepositoryError):
        await repo.list_all()


# ---------------------------------------------------------------------------
# list_all — deserialization error path (the bug we fixed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_all_raises_repository_error_on_deserialization_failure() -> None:
    """_from_item raising ValueError must be caught and wrapped in RepositoryError.

    This was the bug: _from_item ran outside the try/except, so a bad enum
    value in DynamoDB would produce an unhandled 500 instead of a RepositoryError.
    """
    bad_item = {
        "service_name": "identity-manager",
        "base_url": "https://auth.apps.cloud.org.bo",
        "health_endpoint": "/health",
        "manifest_url": "https://auth.apps.cloud.org.bo/plugin-manifest.json",
        "min_role": "admin",
        "status": "INVALID_STATUS_VALUE",  # not in ServiceStatus enum
        "version": 1,
        "registered_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
        "registered_by": "seed",
        "registration_source": "seed",
    }
    repo = _make_repo(scan_response={"Items": [bad_item], "Count": 1})

    with pytest.raises(RepositoryError) as exc_info:
        await repo.list_all()

    assert "Failed to list service registrations." in str(exc_info.value)


# ---------------------------------------------------------------------------
# list_all — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_all_returns_deserialized_registrations() -> None:
    """Happy path: valid items are deserialized and returned."""
    reg = _make_registration()
    item = _to_item(reg)

    repo = _make_repo(scan_response={"Items": [item], "Count": 1})

    result = await repo.list_all()

    assert len(result) == 1
    assert result[0].service_name == "identity-manager"
    assert result[0].status == ServiceStatus.ACTIVE


@pytest.mark.asyncio
async def test_list_all_returns_empty_list_when_no_items() -> None:
    repo = _make_repo(scan_response={"Items": [], "Count": 0})

    result = await repo.list_all()

    assert result == []


@pytest.mark.asyncio
async def test_list_all_paginates_through_all_pages() -> None:
    """LastEvaluatedKey triggers a second scan call."""
    reg = _make_registration()
    item = _to_item(reg)

    mock_table = MagicMock()
    mock_table.name = "ugsys-admin-service-registry-test"
    mock_table.scan.side_effect = [
        {"Items": [item], "Count": 1, "LastEvaluatedKey": {"pk": {"S": "SERVICE#identity-manager"}}},
        {"Items": [_to_item(_make_registration(service_name="user-profile-service"))], "Count": 1},
    ]

    mock_resource = MagicMock()
    mock_resource.Table.return_value = mock_table
    repo = DynamoDBServiceRegistryRepository(dynamodb_resource=mock_resource)

    result = await repo.list_all()

    assert len(result) == 2
    assert mock_table.scan.call_count == 2
