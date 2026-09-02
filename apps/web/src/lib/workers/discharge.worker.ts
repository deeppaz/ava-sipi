/// <reference lib="webworker" />
/**
 * Parses discharge/YYYYMMDD.parquet off the main thread (spec §5.6) with hyparquet
 * (HTTP range requests, snappy supported natively).
 */
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet'

export interface DischargeRow {
  id: number
  ratio: number
  today: number
  forecast: number[]
}

export interface WorkerRequest {
  seq: number
  url: string
}
export type WorkerResponse =
  | { seq: number; ok: true; rows: DischargeRow[] }
  | { seq: number; ok: false; error: string }

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { seq, url } = ev.data
  try {
    const file = await asyncBufferFromUrl({ url })
    const objects = await parquetReadObjects({
      file,
      columns: ['id', 'ratio', 'today', 'forecast'],
    })
    const rows: DischargeRow[] = objects.map((o) => ({
      id: Number(o.id),
      ratio: Number(o.ratio),
      today: Number(o.today),
      forecast: Array.from((o.forecast as ArrayLike<number> | null) ?? [], Number),
    }))
    const msg: WorkerResponse = { seq, ok: true, rows }
    self.postMessage(msg)
  } catch (e) {
    const msg: WorkerResponse = {
      seq,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
    self.postMessage(msg)
  }
}
