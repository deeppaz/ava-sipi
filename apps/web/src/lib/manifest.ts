/**
 * Root manifest loading (spec §1.4): remote URL when configured, otherwise the bundled
 * sample manifest under /data. Artifact URLs resolve relative to the data base.
 */
import { type Artifact, type LayerId, type LayerManifest, RootManifest } from '@ava-sipi/schema'
import { create } from 'zustand'
import type { TimeState } from '@/state/store'
import { env, SAMPLE_DATA_BASE, SAMPLE_MANIFEST_URL } from './env'
import { dirnameUrl, fetchJson, resolveUrl } from './fetch'

export type ManifestSource = 'remote' | 'sample' | 'none'

export interface ManifestState {
  manifest: RootManifest | null
  base: string
  source: ManifestSource
  error: string | null
  loadedAt: number | null
  load: () => Promise<void>
}

async function tryLoad(url: string): Promise<RootManifest> {
  const raw = await fetchJson<unknown>(url, { timeoutMs: 12000, cache: 'no-cache' })
  const parsed = RootManifest.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `manifest at ${url} failed validation: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
    )
  }
  return parsed.data
}

export const useManifest = create<ManifestState>()((set) => ({
  manifest: null,
  base: SAMPLE_DATA_BASE,
  source: 'none',
  error: null,
  loadedAt: null,
  load: async () => {
    if (env.manifestUrl) {
      try {
        const manifest = await tryLoad(env.manifestUrl)
        set({
          manifest,
          base: dirnameUrl(env.manifestUrl),
          source: 'remote',
          error: null,
          loadedAt: Date.now(),
        })
        return
      } catch (e) {
        console.warn('[manifest] remote failed, falling back to samples', e)
      }
    }
    try {
      const manifest = await tryLoad(SAMPLE_MANIFEST_URL)
      set({ manifest, base: SAMPLE_DATA_BASE, source: 'sample', error: null, loadedAt: Date.now() })
    } catch (e) {
      set({
        manifest: null,
        source: 'none',
        error: e instanceof Error ? e.message : String(e),
        loadedAt: Date.now(),
      })
    }
  },
}))

export function layerManifest(m: RootManifest | null, id: LayerId): LayerManifest | undefined {
  return m?.layers[id]
}

export function findArtifact(lm: LayerManifest | undefined, name: string): Artifact | undefined {
  return lm?.artifacts.find((a) => a.name === name)
}

export function artifactsOfKind(lm: LayerManifest | undefined, kind: Artifact['kind']): Artifact[] {
  return lm?.artifacts.filter((a) => a.kind === kind) ?? []
}

/** Versions are YYYYMMDDTHHMM; returns the newest version whose day ≤ `day`, or null. */
export function versionForDay(lm: LayerManifest, day: string): string | null {
  const stamp = day.replace(/-/g, '')
  const candidates = lm.versions.filter((v) => v.slice(0, 8) <= stamp).sort()
  return candidates.length ? (candidates[candidates.length - 1] as string) : null
}

/**
 * Resolve an artifact URL for the current time. In 'past' mode the version segment
 * (`<layer>/<version>/`) is swapped for the closest archived version when one exists.
 */
export function artifactUrl(
  lm: LayerManifest,
  artifact: Artifact,
  base: string,
  time?: TimeState,
): string {
  let url = artifact.url
  if (time?.mode === 'past') {
    const v = versionForDay(lm, time.day)
    if (v && v !== lm.version) url = url.replace(/\/(\d{8}T\d{4}|latest)\//, `/${v}/`)
  }
  return resolveUrl(url, base)
}

/** "Temporarily old data" (spec §2.1) when ≥ 3 consecutive failures or the pipeline flagged stale. */
export function isStale(lm: LayerManifest | undefined): boolean {
  return !!lm && (lm.stale || lm.failures >= 3)
}
