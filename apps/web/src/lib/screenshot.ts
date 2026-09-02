/** Screenshot and embed helpers (⌘K actions, spec §5.1). */
import { shareUrl } from '@/state/url'

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function screenshotFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `ava-sipi-${stamp}.png`
}

export function embedCode(width = 800, height = 500): string {
  const url = new URL(shareUrl())
  url.searchParams.set('embed', '1')
  return `<iframe src="${url.toString()}" width="${width}" height="${height}" style="border:0;border-radius:6px" loading="lazy" allow="fullscreen" title="Ava Sipî — the living map of Earth's water"></iframe>`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
