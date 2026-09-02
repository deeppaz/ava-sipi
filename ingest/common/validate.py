"""Validate pipeline outputs against the JSON Schemas exported from packages/schema (Zod).

The Zod definitions are the single source of truth; `pnpm schema:export` regenerates
`packages/schema/json/*.json`, which this module loads.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

from .config import SCHEMA_DIR


class ValidationError(ValueError):
    pass


@lru_cache(maxsize=32)
def _validator(name: str) -> Draft202012Validator:
    path = SCHEMA_DIR / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"schema {name} not found at {path}; run `pnpm schema:export`")
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def validate(name: str, data: Any) -> None:
    """Raise ValidationError listing the first few problems."""
    errors = sorted(_validator(name).iter_errors(data), key=lambda e: list(e.path))
    if errors:
        lines = []
        for e in errors[:5]:
            loc = "/".join(str(p) for p in e.path) or "<root>"
            lines.append(f"{loc}: {e.message[:160]}")
        more = f" (+{len(errors) - 5} more)" if len(errors) > 5 else ""
        raise ValidationError(f"{name} invalid:{more}\n  " + "\n  ".join(lines))


def validate_file(name: str, path: Path) -> Any:
    data = json.loads(path.read_text(encoding="utf-8"))
    validate(name, data)
    return data
