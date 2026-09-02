"""Helpers shared by pipeline `run()` implementations."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .config import PipelineConfig

log = logging.getLogger(__name__)


def load_fixture_or(cfg: PipelineConfig, key: str, fetch: Callable[[], Any]) -> Any:
    """Return parsed JSON from `cfg.fixtures[key]` when present, otherwise call `fetch()`."""
    path = cfg.fixtures.get(key)
    if path is not None:
        log.info("fixture %s <- %s", key, path)
        text = Path(path).read_text(encoding="utf-8")
        return json.loads(text)
    return fetch()


def write_json(path: Path, data: Any, compact: bool = True) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(text + "\n", encoding="utf-8")
    return path


def tmp_dir(cfg: PipelineConfig, layer: str) -> Path:
    d = cfg.out_dir / ".tmp" / layer / cfg.version
    d.mkdir(parents=True, exist_ok=True)
    return d


def versions_with(cfg: PipelineConfig, keep: int = 400) -> list[str]:
    """Newest-first list including this run's version, capped."""
    seen: list[str] = []
    for v in [cfg.version, *cfg.previous_versions]:
        if v not in seen:
            seen.append(v)
    return seen[:keep]
