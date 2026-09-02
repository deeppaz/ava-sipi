"""Pipeline configuration shared by every `run(config)`."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
SAMPLES_DIR = DATA_DIR / "samples"
MANIFESTS_DIR = DATA_DIR / "manifests"
SCHEMA_DIR = REPO_ROOT / "packages" / "schema" / "json"
FIXTURES_DIR = REPO_ROOT / "ingest" / "tests" / "fixtures"


def version_stamp(now: datetime | None = None) -> str:
    """Artifact version: YYYYMMDDTHHMM in UTC."""
    now = now or datetime.now(UTC)
    return now.strftime("%Y%m%dT%H%M")


def iso(dt: datetime) -> str:
    """ISO-8601 with Z suffix and second precision."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass(slots=True)
class PipelineConfig:
    """Everything a pipeline needs. Keys are optional; absence means "cached snapshot" mode."""

    out_dir: Path
    now: datetime = field(default_factory=lambda: datetime.now(UTC))
    # When set, artifacts are uploaded and URLs are absolute; otherwise URLs are relative
    # to the manifest (works for GitHub Pages / local dev).
    public_base_url: str | None = None
    publish: bool = False
    # Sample mode caps sizes so data/samples stays small enough for git.
    sample: bool = False
    # Optional credentials
    usgs_api_key: str | None = None
    earthdata_username: str | None = None
    earthdata_password: str | None = None
    # Offline testing: pipelines read these files instead of hitting the network.
    fixtures: dict[str, Path] = field(default_factory=dict)
    # Number of consecutive prior failures (read from the existing manifest by the CLI).
    prior_failures: int = 0
    # Previous manifest versions to keep in `versions` (newest first).
    previous_versions: list[str] = field(default_factory=list)

    @property
    def version(self) -> str:
        return version_stamp(self.now)

    @classmethod
    def from_env(cls, out_dir: Path, **overrides: object) -> PipelineConfig:
        env = os.environ
        cfg = cls(
            out_dir=out_dir,
            public_base_url=env.get("R2_PUBLIC_URL") or None,
            publish=env.get("INGEST_PUBLISH", "false").lower() == "true",
            usgs_api_key=env.get("USGS_API_KEY") or None,
            earthdata_username=env.get("EARTHDATA_USERNAME") or None,
            earthdata_password=env.get("EARTHDATA_PASSWORD") or None,
        )
        for k, v in overrides.items():
            setattr(cfg, k, v)
        return cfg
