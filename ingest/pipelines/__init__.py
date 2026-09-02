"""Pipeline registry. Each module exposes `run(config: PipelineConfig) -> LayerManifest`."""

from __future__ import annotations

import importlib
from collections.abc import Callable

from common.config import PipelineConfig
from common.manifest import LayerManifest

PIPELINES: dict[str, str] = {
    "rivers": "pipelines.rivers.run",
    "gauges_usgs": "pipelines.gauges_usgs.run",
    "gauges_noaa": "pipelines.gauges_noaa.run",
    "discharge_openmeteo": "pipelines.discharge_openmeteo.run",
    "events_gdacs": "pipelines.events_gdacs.run",
    "drought_gdo": "pipelines.drought_gdo.run",
    "groundwater_grace": "pipelines.groundwater_grace.run",
    "reservoirs_gww": "pipelines.reservoirs_gww.run",
    "glaciers_rgi": "pipelines.glaciers_rgi.run",
}

# Layer id each pipeline writes (several pipelines may feed one layer).
LAYER_OF: dict[str, str] = {
    "rivers": "rivers",
    "gauges_usgs": "gauges",
    "gauges_noaa": "gauges",
    "discharge_openmeteo": "rivers",
    "events_gdacs": "events",
    "drought_gdo": "drought",
    "groundwater_grace": "groundwater",
    "reservoirs_gww": "reservoirs",
    "glaciers_rgi": "glaciers",
}

RunFn = Callable[[PipelineConfig], LayerManifest]


def get_pipeline(name: str) -> RunFn:
    module = importlib.import_module(PIPELINES[name])
    return module.run
