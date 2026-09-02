export type LngLat = [number, number]

export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371.0088
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function lineMidpoint(coords: number[][]): LngLat {
  if (coords.length === 0) return [0, 0]
  let total = 0
  const segs: number[] = []
  for (let i = 0; i < coords.length - 1; i++) {
    const d = haversineKm(coords[i] as LngLat, coords[i + 1] as LngLat)
    segs.push(d)
    total += d
  }
  if (total === 0) return coords[0] as LngLat
  let acc = 0
  for (let i = 0; i < segs.length; i++) {
    const d = segs[i] as number
    if (acc + d >= total / 2) {
      const t = d === 0 ? 0 : (total / 2 - acc) / d
      const a = coords[i] as LngLat
      const b = coords[i + 1] as LngLat
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    acc += d
  }
  return coords[coords.length - 1] as LngLat
}

export function ringCentroid(ring: number[][]): LngLat {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i] as LngLat
    const [x1, y1] = ring[i + 1] as LngLat
    const cross = x0 * y1 - x1 * y0
    a += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  if (Math.abs(a) < 1e-12) {
    const n = ring.length || 1
    return [
      ring.reduce((s, p) => s + (p[0] ?? 0), 0) / n,
      ring.reduce((s, p) => s + (p[1] ?? 0), 0) / n,
    ]
  }
  a *= 0.5
  return [cx / (6 * a), cy / (6 * a)]
}

/** Representative point for any GeoJSON geometry. */
export function geometryAnchor(g: GeoJSON.Geometry): LngLat {
  switch (g.type) {
    case 'Point':
      return [g.coordinates[0] as number, g.coordinates[1] as number]
    case 'MultiPoint':
      return (g.coordinates[0] ?? [0, 0]) as LngLat
    case 'LineString':
      return lineMidpoint(g.coordinates)
    case 'MultiLineString':
      return lineMidpoint(g.coordinates.reduce((a, b) => (a.length >= b.length ? a : b), []))
    case 'Polygon':
      return ringCentroid(g.coordinates[0] ?? [])
    case 'MultiPolygon':
      return ringCentroid(
        (g.coordinates.reduce(
          (a, b) => ((a[0]?.length ?? 0) >= (b[0]?.length ?? 0) ? a : b),
          [],
        )[0] ?? []) as number[][],
      )
    default:
      return [0, 0]
  }
}

/** Bounding box [w, s, e, n] of a geometry. */
export function geometryBbox(g: GeoJSON.Geometry): [number, number, number, number] {
  let w = 180
  let s = 90
  let e = -180
  let n = -90
  const visit = (p: number[]) => {
    const x = p[0] as number
    const y = p[1] as number
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') visit(c as number[])
    else if (Array.isArray(c)) for (const x of c) walk(x)
  }
  if (g.type !== 'GeometryCollection') walk(g.coordinates)
  return [w, s, e, n]
}

/** Zoom that fits a bbox in a viewport (rough, for search fly-to). */
export function zoomForBbox(bbox: [number, number, number, number], viewportPx = 900): number {
  const [w, s, e, n] = bbox
  const span = Math.max(Math.abs(e - w), Math.abs(n - s) * 1.4, 0.01)
  return Math.max(1.5, Math.min(11, Math.log2((360 / span) * (viewportPx / 512))))
}
