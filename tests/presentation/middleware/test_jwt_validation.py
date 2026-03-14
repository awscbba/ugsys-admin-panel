"""Unit tests for _resolve_jwt_public_key() in jwt_validation middleware."""

from __future__ import annotations

import importlib
import json
import sys
from unittest.mock import MagicMock, patch


def _reload_module() -> object:
    """Force a fresh import of jwt_validation so module-level code re-runs."""
    mod_name = "src.presentation.middleware.jwt_validation"
    if mod_name in sys.modules:
        del sys.modules[mod_name]
    return importlib.import_module(mod_name)


class TestResolveJwtPublicKey:
    def test_returns_env_var_when_jwt_public_key_is_set(self) -> None:
        # Arrange
        env = {"JWT_PUBLIC_KEY": "-----BEGIN PUBLIC KEY-----\nFAKE\n-----END PUBLIC KEY-----"}

        # Act
        with patch.dict("os.environ", env, clear=False):
            mod = _reload_module()

        # Assert
        assert env["JWT_PUBLIC_KEY"] == mod._JWT_PUBLIC_KEY  # type: ignore[attr-defined]

    def test_falls_back_to_secrets_manager_when_arn_is_set(self) -> None:
        # Arrange
        secret_value = json.dumps({"public_key": "-----BEGIN PUBLIC KEY-----\nSECRET\n-----END PUBLIC KEY-----"})
        mock_sm = MagicMock()
        mock_sm.get_secret_value.return_value = {"SecretString": secret_value}

        env = {
            "JWT_PUBLIC_KEY": "",
            "JWT_KEYS_SECRET_ARN": "arn:aws:secretsmanager:us-east-1:123456789012:secret:ugsys-jwt-keys",
            "AWS_REGION": "us-east-1",
        }

        # Act
        with patch.dict("os.environ", env, clear=False), patch("boto3.client", return_value=mock_sm):
            mod = _reload_module()

        # Assert
        mock_sm.get_secret_value.assert_called_once_with(
            SecretId="arn:aws:secretsmanager:us-east-1:123456789012:secret:ugsys-jwt-keys"
        )
        assert "SECRET" in mod._JWT_PUBLIC_KEY  # type: ignore[attr-defined]

    def test_env_var_takes_precedence_over_secrets_manager(self) -> None:
        # Arrange — both JWT_PUBLIC_KEY and JWT_KEYS_SECRET_ARN are set
        env = {
            "JWT_PUBLIC_KEY": "-----BEGIN PUBLIC KEY-----\nENV_KEY\n-----END PUBLIC KEY-----",
            "JWT_KEYS_SECRET_ARN": "arn:aws:secretsmanager:us-east-1:123456789012:secret:ugsys-jwt-keys",
        }

        # Act
        with patch.dict("os.environ", env, clear=False), patch("boto3.client") as mock_boto:
            mod = _reload_module()

        # Assert — Secrets Manager was never called
        mock_boto.assert_not_called()
        assert "ENV_KEY" in mod._JWT_PUBLIC_KEY  # type: ignore[attr-defined]

    def test_returns_empty_string_when_neither_is_configured(self) -> None:
        # Arrange
        env = {"JWT_PUBLIC_KEY": "", "JWT_KEYS_SECRET_ARN": ""}

        # Act
        with patch.dict("os.environ", env, clear=False):
            mod = _reload_module()

        # Assert
        assert mod._JWT_PUBLIC_KEY == ""  # type: ignore[attr-defined]

    def test_decode_token_raises_jwt_error_when_public_key_empty(self) -> None:
        # Arrange
        env = {"JWT_PUBLIC_KEY": "", "JWT_KEYS_SECRET_ARN": ""}

        with patch.dict("os.environ", env, clear=False):
            mod = _reload_module()

        from jwt.exceptions import InvalidTokenError as JWTError

        # Act + Assert
        try:
            mod._decode_token("some.fake.token")  # type: ignore[attr-defined]
            raise AssertionError("Expected JWTError")
        except JWTError as exc:
            assert "JWT_PUBLIC_KEY" in str(exc)
