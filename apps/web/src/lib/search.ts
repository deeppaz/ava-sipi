import type { LayerId } from '@ava-sipi/schema'
import type { DataState, GlaciersData, RiversData } from '@/state/data'
import { geometryAnchor, geometryBbox, zoomForBbox } from './geo'
import { PLACES } from './places'

export type SearchType = 'river' | 'gauge' | 'reservoir' | 'glacier' | 'event' | 'place'

export interface SearchResult {
  type: SearchType
  id: string
  title: string
  subtitle?: string | undefined
  lon: number
  lat: number
  zoom: number
  layer?: LayerId
  /** selection id inside the layer (differs from `id` for places) */
  selectId?: string
  norm: string
}

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').toLowerCase().trim()
}

const indexCache = new WeakMap<object, SearchResult[]>()

export function buildIndex(
  data: Pick<DataState, 'rivers' | 'gauges' | 'events' | 'reservoirs' | 'glaciers'>,
): SearchResult[] {
  const out: SearchResult[] = []
  for (const p of PLACES) {
    out.push({
      type: 'place',
      id: `place:${p.name}`,
      title: p.name,
      lon: p.lon,
      lat: p.lat,
      zoom: p.zoom,
      norm: normalize([p.name, ...(p.aliases ?? [])].join(' ')),
    })
  }
  const rivers: RiversData | undefined = data.rivers.data
  if (rivers) {
    const seen = new Map<
      string,
      { lon: number; lat: number; n: number; id: number; bbox: [number, number, number, number] }
    >()
    for (const f of rivers.features) {
      if (!f.name) continue
      let e = seen.get(f.name)
      const bb = geometryBbox({ type: 'LineString', coordinates: f.path })
      if (!e) {
        e = { lon: f.mid[0], lat: f.mid[1], n: 1, id: f.id, bbox: bb }
        seen.set(f.name, e)
      } else {
        e.n += 1
        e.bbox = [
          Math.min(e.bbox[0], bb[0]),
          Math.min(e.bbox[1], bb[1]),
          Math.max(e.bbox[2], bb[2]),
          Math.max(e.bbox[3], bb[3]),
        ]
        if (f.meanDischarge > (rivers.features.find((x) => x.id === e?.id)?.meanDischarge ?? 0))
          e.id = f.id
      }
    }
    for (const [name, e] of seen) {
      out.push({
        type: 'river',
        id: `river:${name}`,
        title: name,
        lon: (e.bbox[0] + e.bbox[2]) / 2,
        lat: (e.bbox[1] + e.bbox[3]) / 2,
        zoom: zoomForBbox(e.bbox),
        layer: 'rivers',
        selectId: String(e.id),
        norm: normalize(name),
      })
    }
  }
  if (data.gauges.data) {
    for (const g of data.gauges.data.gauges) {
      const subtitle = g.riverName
      out.push({
        type: 'gauge',
        id: g.id,
        title: g.name,
        ...(subtitle ? { subtitle } : {}),
        lon: g.lon,
        lat: g.lat,
        zoom: 9,
        layer: 'gauges',
        selectId: g.id,
        norm: normalize(`${g.name} ${g.riverName ?? ''} ${g.id}`),
      })
    }
  }
  if (data.reservoirs.data) {
    for (const r of data.reservoirs.data.reservoirs) {
      out.push({
        type: 'reservoir',
        id: r.id,
        title: r.name,
        subtitle: r.country,
        lon: r.lon,
        lat: r.lat,
        zoom: 8.5,
        layer: 'reservoirs',
        selectId: r.id,
        norm: normalize(`${r.name} ${r.country}`),
      })
    }
  }
  if (data.events.data) {
    for (const f of data.events.data.features) {
      const p = f.properties
      out.push({
        type: 'event',
        id: p.id,
        title: p.title,
        subtitle: p.country,
        lon: p.centroid[0],
        lat: p.centroid[1],
        zoom: 6,
        layer: 'events',
        selectId: p.id,
        norm: normalize(`${p.title} ${p.country ?? ''}`),
      })
    }
  }
  const glaciers: GlaciersData | undefined = data.glaciers.data
  if (glaciers) {
    for (const f of glaciers.outlines.features) {
      if (!f.properties.name) continue
      const [lon, lat] = geometryAnchor(f.geometry)
      out.push({
        type: 'glacier',
        id: f.properties.id,
        title: f.properties.name,
        lon,
        lat,
        zoom: 10,
        layer: 'glaciers',
        selectId: f.properties.id,
        norm: normalize(f.properties.name),
      })
    }
  }
  return out
}

export function getIndex(
  data: Pick<DataState, 'rivers' | 'gauges' | 'events' | 'reservoirs' | 'glaciers'>,
): SearchResult[] {
  const key = [
    data.rivers.data,
    data.gauges.data,
    data.events.data,
    data.reservoirs.data,
    data.glaciers.data,
  ]
  const holder = (getIndex as unknown as { last?: { key: unknown[]; idx: SearchResult[] } }).last
  if (holder && holder.key.every((k, i) => k === key[i])) return holder.idx
  const idx = buildIndex(data)
  ;(getIndex as unknown as { last?: { key: unknown[]; idx: SearchResult[] } }).last = { key, idx }
  indexCache.set(data, idx)
  return idx
}

export function search(index: SearchResult[], query: string, limit = 8): SearchResult[] {
  const q = normalize(query)
  if (q.length < 2) return []
  const scored: { r: SearchResult; s: number }[] = []
  for (const r of index) {
    let s = -1
    if (r.norm.startsWith(q)) s = 3
    else if (r.norm.split(/\s+/).some((w) => w.startsWith(q))) s = 2
    else if (r.norm.includes(q)) s = 1
    if (s < 0) continue
    // prefer named rivers and places over thousands of gauges
    if (r.type === 'river' || r.type === 'place') s += 0.5
    if (r.type === 'gauge') s -= 0.25
    scored.push({ r, s })
  }
  scored.sort((a, b) => b.s - a.s || a.r.title.length - b.r.title.length)
  return scored.slice(0, limit).map((x) => x.r)
}
