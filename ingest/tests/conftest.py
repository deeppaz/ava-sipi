from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from common.config import PipelineConfig

FIX = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def fixtures_dir() -> Path:
    return FIX


@pytest.fixture
def cfg(tmp_path: Path) -> PipelineConfig:
    return PipelineConfig(
        out_dir=tmp_path / "out",
        now=datetime(2026, 9, 2, 15, 0, tzinfo=UTC),
        publish=False,
        sample=True,
    )
