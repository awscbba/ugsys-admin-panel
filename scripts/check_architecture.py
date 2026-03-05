#!/usr/bin/env python3
"""
Architecture guard: enforces hexagonal layer import rules.

Rules:
  - presentation layer MUST NOT import from infrastructure
  - domain layer MUST NOT import from infrastructure or presentation

Exit code 0 = all rules pass (merge allowed)
Exit code 1 = violations found (merge blocked)
"""

import ast
import sys
from pathlib import Path

SRC = Path(__file__).parent.parent / "src"

# Forbidden import patterns per layer (layer_dir -> forbidden_prefixes)
RULES: dict[str, list[str]] = {
    "presentation": ["infrastructure"],
    "domain": ["infrastructure", "presentation"],
}


def get_imports(path: Path) -> list[str]:
    """Return all module names imported by a Python source file."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []

    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                modules.append(node.module)
    return modules


def check_layer(layer: str, forbidden: list[str]) -> list[str]:
    """Return a list of violation messages for the given layer."""
    layer_dir = SRC / layer
    if not layer_dir.exists():
        return []

    violations: list[str] = []
    for py_file in layer_dir.rglob("*.py"):
        for module in get_imports(py_file):
            # Normalise: strip leading "src." if present
            normalised = module.removeprefix("src.")
            for bad in forbidden:
                # Match "infrastructure" or "infrastructure.something"
                if normalised == bad or normalised.startswith(f"{bad}."):
                    rel = py_file.relative_to(SRC.parent)
                    violations.append(
                        f"  {rel}: imports '{module}' "
                        f"('{layer}' must not import from '{bad}')"
                    )
    return violations


def main() -> int:
    all_violations: list[str] = []

    for layer, forbidden in RULES.items():
        violations = check_layer(layer, forbidden)
        all_violations.extend(violations)

    if all_violations:
        print("❌ Architecture violations found:")
        for v in all_violations:
            print(v)
        print(
            f"\n{len(all_violations)} violation(s) detected. "
            "Fix import paths to respect hexagonal layer boundaries."
        )
        return 1

    print("✅ Architecture guard passed — no layer violations found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
