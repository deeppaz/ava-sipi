/**
 * Exports every contract as JSON Schema (draft 2020-12) into packages/schema/json.
 * The Python ingest validates its outputs against these files, so the Zod schemas
 * remain the single source of truth.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import * as S from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'json')
mkdirSync(out, { recursive: true })

const contracts: Record<string, z.ZodType> = {
  'layer-manifest': S.LayerManifest,
  'root-manifest': S.RootManifest,
  gauge: S.Gauge,
  'gauges-latest': S.GaugesLatest,
  'gauge-stats': S.GaugeStatsFile,
  'gauge-series': S.GaugeSeries,
  'river-spine': S.RiverSpine,
  'discharge-file': S.DischargeFile,
  'water-event-collection': S.WaterEventCollection,
  'reservoirs-latest': S.ReservoirsLatest,
  'reservoir-series': S.ReservoirSeries,
  'glacier-collection': S.GlacierCollection,
  'mass-balance': S.MassBalanceFile,
  'groundwater-cell-series': S.GroundwaterCellSeries,
  story: S.Story,
}

for (const [name, schema] of Object.entries(contracts)) {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' })
  json.$id = `https://ava-sipi.dev/schema/${name}.json`
  json.title = name
  writeFileSync(join(out, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`)
}
console.log(`exported ${Object.keys(contracts).length} schemas to ${out}`)
