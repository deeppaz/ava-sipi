# ingest

Python 3.12 pipelines that turn open water data into static artifacts + manifests.

```
uv sync                          # base deps (no GDAL needed)
uv sync --extra geo              # rivers / glaciers / raster pipelines
uv run python -m ingest.cli list
uv run python -m ingest.cli run events_gdacs --out ./.tmp --publish=false
uv run python -m ingest.cli samples        # rebuild data/samples from fixtures + live snapshots
uv run pytest
```

Every pipeline module exposes `run(config: PipelineConfig) -> LayerManifest`.
Outputs are written to a temp dir, validated against `packages/schema/json/*.json`,
uploaded to R2 (when configured), and only then is the manifest written (atomic ordering).

Each pipeline folder has a `README.md` documenting endpoint, fields, units, latency,
licence, attribution text and known issues (spec §2.1).
