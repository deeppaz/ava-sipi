# Adding a layer

A layer is one folder + manifest (spec §0.3). Order is fixed: **manifest → ingest → render**.

## 1. Contract (`packages/schema`)

Add the record type your artifact carries (Zod), export it from `src/index.ts`, register it in
`scripts/export-json-schema.ts`, run `pnpm schema:export`. Add the new id to `LAYER_IDS` if it is a
brand-new layer id.

## 2. Layer manifest (`packages/layers/src/<id>.ts`)

```ts
export const snow: LayerDefinition = {
  id: 'snow',
  nameKey: 'layer.snow.name',           // add en/tr/ku strings in apps/web/src/i18n
  descriptionKey: 'layer.snow.description',
  color: 'foam',                        // a design token only (docs/DESIGN.md)
  icon: 'snow',
  renderer: 'maplibre',                 // 'deck' for points/lines, 'maplibre' for tiles/rasters
  geometry: 'raster',
  artifactKinds: ['raster-pmtiles'],
  defaultOn: false,
  wave: 3,
  refreshMinutes: 60 * 24,
  time: { historyFrom: null, step: 'day', forecastDays: 0 },
  legend: { unit: '%', stops: [...] },
  attribution: { name, url, license },
}
```

Register it in `src/index.ts` (`layerRegistry`, rail order) and add a test expectation.

## 3. Ingest (`ingest/pipelines/<source>/`)

- `run.py` with `run(cfg: PipelineConfig) -> LayerManifest`. Write outputs to `tmp_dir(cfg, layer)`,
  validate with `common.validate.validate("<schema-name>", data)`, publish with
  `Storage.put(path, layer, cfg.version, name)`, return `LayerManifest(...)` with `artifacts` named
  (`name` is how the web app finds them).
- `README.md`: endpoint, fields, units, latency, licence, attribution text, known issues.
- Register in `pipelines/__init__.py` (`PIPELINES`, `LAYER_OF`) and in a workflow
  (`.github/workflows/ingest-*.yml`).
- Fixture + test in `ingest/tests/test_pipelines.py`. Nightly-only live tests use `@pytest.mark.live`.
- Sample mode (`cfg.sample`) must produce a small artifact so `pnpm dev` works offline.

## 4. Render (`apps/web/src/layers/`)

- deck layers: add `build<Layer>.ts` returning `Layer[]` from a `BuildContext`, and include it in
  `buildDeckLayers` (`layers/index.ts`). Use `...interleave(ctx)` and the colour helpers in
  `lib/color.ts`. Animate with uniforms (radiusScale, opacity, shader time), not attributes.
- native layers: extend `layers/nativeLayers.ts` (`syncRaster` handles any PNG/PMTiles overlay).
- data: add a loader in `state/data.ts` if the layer needs parsed data; panels resolve the selection
  in `lib/useSelected.ts` and render a `panels/details/<Layer>Detail.tsx`.

## 5. Text, legend, docs

- Strings in `apps/web/src/i18n/{en,tr,ku}.json` — the i18n test fails when a key is missing in
  any language.
- `docs/DATA_SOURCES.md` row + `ATTRIBUTIONS.md` entry.
- A changeset: `pnpm changeset`.
