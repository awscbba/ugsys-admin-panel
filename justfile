# Admin Panel BFF Proxy + Admin Shell — Development Commands

# Default: list available commands
default:
    @just --list

# ─────────────────────────────────────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────────────────────────────────────

# Install Python dependencies
install:
    uv sync --all-extras

# Install git hooks
install-hooks:
    cp scripts/hooks/pre-commit .git/hooks/pre-commit
    cp scripts/hooks/pre-push .git/hooks/pre-push
    chmod +x .git/hooks/pre-commit
    chmod +x .git/hooks/pre-push
    @echo "Git hooks installed."

# ─────────────────────────────────────────────────────────────────────────────
# Development
# ─────────────────────────────────────────────────────────────────────────────

# Run BFF development server with auto-reload
dev:
    uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Run Admin Shell development server
dev-frontend:
    cd admin-shell && npm run dev

# ─────────────────────────────────────────────────────────────────────────────
# Code Quality — BFF (Python)
# ─────────────────────────────────────────────────────────────────────────────

# Run ruff linter
lint:
    uv run ruff check src/ tests/

# Run ruff formatter check
format-check:
    uv run ruff format --check src/ tests/

# Apply ruff formatting
format:
    uv run ruff format src/ tests/

# Run mypy strict type checking
type-check:
    uv run mypy --strict src/

# Run all BFF quality checks (lint + format + type-check)
check:
    @just lint
    @just format-check
    @just type-check

# ─────────────────────────────────────────────────────────────────────────────
# Code Quality — Admin Shell (TypeScript)
# ─────────────────────────────────────────────────────────────────────────────

# Run ESLint
lint-frontend:
    cd admin-shell && npx eslint --max-warnings=0 src/

# Run Prettier check
format-check-frontend:
    cd admin-shell && npx prettier --check src/

# Apply Prettier formatting
format-frontend:
    cd admin-shell && npx prettier --write src/

# Run TypeScript type check
type-check-frontend:
    cd admin-shell && npx tsc --noEmit

# Run all frontend quality checks
check-frontend:
    @just lint-frontend
    @just format-check-frontend
    @just type-check-frontend

# ─────────────────────────────────────────────────────────────────────────────
# Testing — BFF (Python)
# ─────────────────────────────────────────────────────────────────────────────

# Run BFF test suite
test:
    uv run pytest -v

# Run BFF tests with 80% coverage gate
test-coverage:
    uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80 -v

# Run BFF tests with HTML coverage report
test-coverage-html:
    uv run pytest --cov=src --cov-report=html --cov-report=term-missing --cov-fail-under=80 -v
    @echo "Coverage report: htmlcov/index.html"

# ─────────────────────────────────────────────────────────────────────────────
# Testing — Admin Shell (TypeScript)
# ─────────────────────────────────────────────────────────────────────────────

# Run Admin Shell test suite
test-frontend:
    cd admin-shell && npx vitest run

# Run Admin Shell tests with coverage gate
test-coverage-frontend:
    cd admin-shell && npx vitest run --coverage

# ─────────────────────────────────────────────────────────────────────────────
# Security
# ─────────────────────────────────────────────────────────────────────────────

# Run Bandit SAST scan
bandit:
    uv run bandit -r src/ -c pyproject.toml -ll

# Run npm audit on Admin Shell
audit-frontend:
    cd admin-shell && npm audit --audit-level=high

# ─────────────────────────────────────────────────────────────────────────────
# Architecture
# ─────────────────────────────────────────────────────────────────────────────

# Check hexagonal layer import rules
check-architecture:
    uv run python scripts/check_architecture.py

# ─────────────────────────────────────────────────────────────────────────────
# CI — full pipeline locally
# ─────────────────────────────────────────────────────────────────────────────

# Run full BFF CI pipeline (mirrors .github/workflows/ci.yml)
ci:
    @just check
    @just test-coverage
    @just bandit
    @just check-architecture

# Run full frontend CI pipeline (mirrors .github/workflows/ci-frontend.yml)
ci-frontend:
    @just check-frontend
    @just test-coverage-frontend
    @just audit-frontend

# Run both pipelines
ci-all:
    @just ci
    @just ci-frontend

# ─────────────────────────────────────────────────────────────────────────────
# AWS / Remote info
# ─────────────────────────────────────────────────────────────────────────────

# Show EventBridge event bus details
aws-event-bus:
    aws events describe-event-bus --name ugsys-event-bus

# List EventBridge rules for admin-panel subscriptions
aws-event-rules:
    aws events list-rules --event-bus-name ugsys-event-bus --name-prefix ugsys-admin

# Show DynamoDB service registry table info
aws-registry-table:
    aws dynamodb describe-table --table-name ugsys-admin-registry-dev

# Show DynamoDB audit log table info
aws-audit-table:
    aws dynamodb describe-table --table-name ugsys-admin-audit-dev

# Tail BFF Lambda logs (last 5 minutes)
aws-logs-bff:
    aws logs tail /aws/lambda/ugsys-admin-panel-bff --since 5m --follow

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────────────

# Remove build artifacts and caches
clean:
    rm -rf __pycache__/ .pytest_cache/ htmlcov/ .coverage .mypy_cache/ .ruff_cache/
    find . -name "*.pyc" -delete
    @echo "Cleaned."
