"""Layer manifests (`data/manifests/<layer>.json`) and the root `manifest.json`."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import MANIFESTS_DIR, iso
from .validate import validate

LAYER_IDS = (
    "rivers",
    "gauges",
    "events",
    "reservoirs",
    "groundwater",
    "drought",
    "glaciers",
    "snow",
    "tides",
)


@dataclass(slots=True)
class ArtifactRef:
    kind: str
    url: str
    bytes: int
    name: str | None = None
    bbox: list[float] | None = None

    def to_json(self) -> dict[str, Any]:
        d: dict[str, Any] = {"kind": self.kind, "url": self.url, "bytes": self.bytes}
        if self.name:
            d["name"] = self.name
        if self.bbox:
            d["bbox"] = self.bbox
        return d


@dataclass(slots=True)
class LayerManifest:
    id: str
    version: str
    generatedAt: str  # noqa: N815 - mirrors the TS contract
    sourceUpdatedAt: str  # noqa: N815
    stale: bool
    artifacts: list[ArtifactRef]
    attribution: dict[str, str]
    coverage: str
    legend: dict[str, Any] | None = None
    bbox: list[float] | None = None
    failures: int = 0
    sample: bool = False
    versions: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_json(self) -> dict[str, Any]:
        d = asdict(self)
        d["artifacts"] = [a.to_json() for a in self.artifacts]
        if d["legend"] is None:
            d.pop("legend")
        if d["bbox"] is None:
            d.pop("bbox")
        return d


def write_layer_manifest(m: LayerManifest, manifests_dir: Path = MANIFESTS_DIR) -> Path:
    data = m.to_json()
    validate("layer-manifest", data)
    manifests_dir.mkdir(parents=True, exist_ok=True)
    path = manifests_dir / f"{m.id}.json"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)  # atomic on POSIX and Windows
    return path


def read_layer_manifest(layer: str, manifests_dir: Path = MANIFESTS_DIR) -> dict[str, Any] | None:
    path = manifests_dir / f"{layer}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def build_root_manifest(
    manifests_dir: Path = MANIFESTS_DIR, now: datetime | None = None
) -> dict[str, Any]:
    layers: dict[str, Any] = {}
    for layer in LAYER_IDS:
        m = read_layer_manifest(layer, manifests_dir)
        if m:
            layers[layer] = m
    root = {"generatedAt": iso(now or datetime.now(UTC)), "layers": layers}
    validate("root-manifest", root)
    return root


def write_root_manifest(manifests_dir: Path = MANIFESTS_DIR, now: datetime | None = None) -> Path:
    root = build_root_manifest(manifests_dir, now)
    path = manifests_dir / "manifest.json"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(root, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)
    return path


#: Consecutive failed runs before the UI calls a layer stale (spec §2.1).
STALE_AFTER_FAILURES = 3


def mark_failure(layer: str, manifests_dir: Path = MANIFESTS_DIR) -> int:
    """Increment `failures` on the existing manifest (keeps old data visible, spec §2.1).

    One missed refresh is not stale data — the layer only earns the badge after three.
    """
    m = read_layer_manifest(layer, manifests_dir)
    if not m:
        return 0
    m["failures"] = int(m.get("failures", 0)) + 1
    m["stale"] = m["failures"] >= STALE_AFTER_FAILURES
    validate("layer-manifest", m)
    (manifests_dir / f"{layer}.json").write_text(
        json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return m["failures"]
