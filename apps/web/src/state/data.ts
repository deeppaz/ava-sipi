/**
 * Layer data store: loads artifacts named in the manifest, lazily per layer and time key.
 * Parquet is parsed in a Web Worker; a JSON twin is the fallback.
 */
import type {
  DischargeFile,
  GaugesLatest,
  GlacierCollection,
  LayerId,
  LayerManifest,
  MassBalanceFile,
  ReservoirsLatest,
  RiverSpine,
  WaterEventCollection,
} from '@ava-sipi/schema'
import { create } from 'zustand'
import { fetchJson } from '@/lib/fetch'
import { artifactUrl, findArtifact } from '@/lib/manifest'
import type { DischargeRow, WorkerRequest, WorkerResponse } from '@/lib/workers/discharge.worker'
import type { TimeState } from './store'

export type Status = 'idle' | 'loading' | 'ready' | 'error'

export interface RiverFeature {
  id: number
  path: number[][]
  order: number
  meanDischarge: number
  name?: string
  lengthKm?: number
  /** anchor for panel/camera */
  mid: [number, number]
}

export interface RiversData {
  features: RiverFeature[]
  discharge: Map<number, DischargeRow>
  dischargeDay: string | null
  networkTilesUrl: string | null
}

export interface GlaciersData {
  outlines: GlacierCollection
  massBalance: MassBalanceFile | null
  tilesUrl: string | null
}

export interface LayerDataMap {
  rivers: RiversData
  gauges: GaugesLatest
  events: WaterEventCollection
  reservoirs: ReservoirsLatest
  glaciers: GlaciersData
}
export type DataLayer = keyof LayerDataMap

interface Entry<T> {
  status: Status
  key: string
  data?: T
  error?: string
}

export interface DataState {
  rivers: Entry<RiversData>
  gauges: Entry<GaugesLatest>
  events: Entry<WaterEventCollection>
  reservoirs: Entry<ReservoirsLatest>
  glaciers: Entry<GlaciersData>
  ensure: <L extends DataLayer>(layer: L, lm: LayerManifest, base: string, time: TimeState) => void
}

const idle = <T>(): Entry<T> => ({ status: 'idle', key: '' })

export function timeKey(time: TimeState): string {
  return time.mode === 'past' ? time.day : 'live'
}

// ---------------------------------------------------------------- parquet worker

let worker: Worker | null = null
let seq = 0
const pending = new Map<
  number,
  { resolve: (rows: DischargeRow[]) => void; reject: (e: Error) => void }
>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../lib/workers/discharge.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const p = pending.get(ev.data.seq)
      if (!p) return
      pending.delete(ev.data.seq)
      if (ev.data.ok) p.resolve(ev.data.rows)
      else p.reject(new Error(ev.data.error))
    }
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message))
      pending.clear()
    }
  }
  return worker
}

export function readDischargeParquet(url: string): Promise<DischargeRow[]> {
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    const req: WorkerRequest = { seq: id, url }
    getWorker().postMessage(req)
  })
}

async function loadDischarge(
  lm: LayerManifest,
  base: string,
  time: TimeState,
): Promise<{ rows: DischargeRow[]; day: string | null }> {
  const pq = findArtifact(lm, 'discharge')
  const js = findArtifact(lm, 'discharge-json')
  if (pq && typeof Worker !== 'undefined') {
    try {
      const rows = await readDischargeParquet(artifactUrl(lm, pq, base, time))
      return { rows, day: dayFromArtifact(pq.url) }
    } catch (e) {
      console.warn('[rivers] parquet failed, trying JSON twin', e)
    }
  }
  if (js) {
    const doc = await fetchJson<DischargeFile>(artifactUrl(lm, js, base, time))
    return {
      rows: doc.records.map((r) => ({
        id: r.id,
        ratio: r.ratio,
        today: r.today,
        forecast: r.forecast,
      })),
      day: doc.day,
    }
  }
  return { rows: [], day: null }
}

function dayFromArtifact(url: string): string | null {
  const m = /(\d{4})(\d{2})(\d{2})\.(parquet|json)$/.exec(url)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function spineToFeatures(spine: RiverSpine): RiverFeature[] {
  const out: RiverFeature[] = []
  for (const f of spine.features) {
    const p = f.properties
    const parts =
      f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
    parts.forEach((coords, i) => {
      if (coords.length < 2) return
      const path = coords.map((c) => [c[0] as number, c[1] as number])
      const mid = path[Math.floor(path.length / 2)] as [number, number]
      out.push({
        id: parts.length > 1 ? p.id * 100 + i : p.id,
        path,
        order: p.order,
        meanDischarge: p.meanDischarge,
        mid,
        ...(p.name ? { name: p.name } : {}),
        ...(p.lengthKm !== undefined ? { lengthKm: p.lengthKm } : {}),
      })
    })
  }
  return out
}

// ---------------------------------------------------------------- loaders

async function loadRivers(
  lm: LayerManifest,
  base: string,
  time: TimeState,
  prev?: RiversData,
): Promise<RiversData> {
  const spineArt = findArtifact(lm, 'spine')
  if (!spineArt) throw new Error('rivers manifest has no spine artifact')
  const [features, discharge] = await Promise.all([
    prev?.features ?? fetchJson<RiverSpine>(artifactUrl(lm, spineArt, base)).then(spineToFeatures),
    loadDischarge(lm, base, time),
  ])
  const map = new Map<number, DischargeRow>()
  for (const r of discharge.rows) map.set(r.id, r)
  const net = findArtifact(lm, 'network')
  return {
    features,
    discharge: map,
    dischargeDay: discharge.day,
    networkTilesUrl: net ? artifactUrl(lm, net, base) : null,
  }
}

async function loadGlaciers(
  lm: LayerManifest,
  base: string,
  time: TimeState,
): Promise<GlaciersData> {
  const outlinesArt = findArtifact(lm, 'outlines')
  if (!outlinesArt) throw new Error('glaciers manifest has no outlines artifact')
  const mbArt = findArtifact(lm, 'massbalance')
  const tiles = findArtifact(lm, 'tiles')
  const [outlines, massBalance] = await Promise.all([
    fetchJson<GlacierCollection>(artifactUrl(lm, outlinesArt, base, time)),
    mbArt
      ? fetchJson<MassBalanceFile>(artifactUrl(lm, mbArt, base, time)).catch(() => null)
      : Promise.resolve(null),
  ])
  return { outlines, massBalance, tilesUrl: tiles ? artifactUrl(lm, tiles, base, time) : null }
}

async function loadNamed<T>(
  lm: LayerManifest,
  name: string,
  base: string,
  time: TimeState,
): Promise<T> {
  const art = findArtifact(lm, name)
  if (!art) throw new Error(`${lm.id} manifest has no '${name}' artifact`)
  return fetchJson<T>(artifactUrl(lm, art, base, time))
}

export const useData = create<DataState>()((set, get) => ({
  rivers: idle(),
  gauges: idle(),
  events: idle(),
  reservoirs: idle(),
  glaciers: idle(),
  ensure: (layer, lm, base, time) => {
    const key = `${lm.version}:${timeKey(time)}`
    const current = get()[layer] as Entry<unknown>
    if (current.key === key && (current.status === 'loading' || current.status === 'ready')) return
    set({ [layer]: { ...current, status: 'loading', key } } as Partial<DataState>)
    const run = async (): Promise<unknown> => {
      switch (layer) {
        case 'rivers':
          return loadRivers(lm, base, time, get().rivers.data)
        case 'gauges':
          return loadNamed<GaugesLatest>(lm, 'latest', base, time)
        case 'events':
          return loadNamed<WaterEventCollection>(lm, 'current', base, time)
        case 'reservoirs':
          return loadNamed<ReservoirsLatest>(lm, 'latest', base, time)
        case 'glaciers':
          return loadGlaciers(lm, base, time)
        default:
          throw new Error(`no loader for ${layer as string}`)
      }
    }
    run().then(
      (data) => {
        if ((get()[layer] as Entry<unknown>).key !== key) return
        set({ [layer]: { status: 'ready', key, data } } as Partial<DataState>)
      },
      (e: unknown) => {
        if ((get()[layer] as Entry<unknown>).key !== key) return
        const prev = get()[layer] as Entry<unknown>
        set({
          [layer]: {
            status: 'error',
            key,
            data: prev.data,
            error: e instanceof Error ? e.message : String(e),
          },
        } as Partial<DataState>)
        console.error(`[data] ${layer} failed`, e)
      },
    )
  },
}))

export const DATA_LAYERS: readonly LayerId[] = [
  'rivers',
  'gauges',
  'events',
  'reservoirs',
  'glaciers',
]
export function isDataLayer(id: LayerId): id is DataLayer {
  return (DATA_LAYERS as readonly string[]).includes(id)
}
