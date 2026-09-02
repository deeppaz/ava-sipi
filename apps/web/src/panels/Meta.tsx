import type { LayerManifest } from '@ava-sipi/schema'
import { Button } from '@ava-sipi/ui'
import type { ReactNode } from 'react'
import { Icons } from '@/design/icons'
import { useI18n } from '@/i18n'
import { formatAgo, formatDateTime } from '@/lib/format'
import { copyText } from '@/lib/screenshot'
import { useApp } from '@/state/store'
import { shareUrl } from '@/state/url'

export function Metric({
  value,
  unit,
  label,
}: {
  value: string
  unit?: string | undefined
  label?: string | undefined
}) {
  return (
    <div className="panel__metric">
      <div className="num">
        <span className="metric" style={{ fontSize: 44 }}>
          {value}
        </span>
        {unit ? <span className="panel__unit"> {unit}</span> : null}
      </div>
      {label ? <div className="text-secondary">{label}</div> : null}
    </div>
  )
}

export function MetaList({
  rows,
}: {
  rows: Array<[string, ReactNode] | null | false | undefined>
}) {
  const items = rows.filter((r): r is [string, ReactNode] => Array.isArray(r))
  if (!items.length) return null
  return (
    <dl className="panel__meta">
      {items.map(([k, v]) => (
        <div key={k} className="panel__row">
          <dt className="text-secondary">{k}</dt>
          <dd className="num">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Notes({ keys }: { keys: string[] }) {
  const { t } = useI18n()
  if (!keys.length) return null
  return (
    <ul className="panel__notes">
      {keys.map((k) => (
        <li key={k}>{t(k.startsWith('note.') ? k : `note.${k}`)}</li>
      ))}
    </ul>
  )
}

export function SourceRow({
  sourceUrl,
  lm,
  measuredAt,
}: {
  sourceUrl?: string | undefined
  lm?: LayerManifest | undefined
  measuredAt?: string | undefined
}) {
  const { t, locale } = useI18n()
  const showToast = useApp((s) => s.showToast)
  const url = sourceUrl ?? lm?.attribution.url
  return (
    <div className="panel__footer">
      {measuredAt ? (
        <div className="text-secondary num">
          {t('panel.measured', { time: formatDateTime(locale, measuredAt) })} ·{' '}
          {t('panel.latency', { ago: formatAgo(locale, measuredAt) })}
        </div>
      ) : null}
      {lm ? (
        <div className="text-secondary panel__attrib">
          {t('panel.attribution')}: {lm.attribution.name} · {t('panel.license')}:{' '}
          {lm.attribution.license} · {t('panel.version', { version: lm.version })}
        </div>
      ) : null}
      <div className="panel__actions">
        {url ? (
          <a
            className="as-btn as-btn--ghost as-btn--sm"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="as-btn__icon">
              <Icons.external size={14} />
            </span>
            <span>{t('panel.source')}</span>
          </a>
        ) : null}
        <Button
          size="sm"
          icon={<Icons.share size={14} />}
          onClick={async () => {
            const ok = await copyText(shareUrl())
            showToast(t(ok ? 'panel.copied' : 'clipboard.failed'))
          }}
        >
          {t('panel.share')}
        </Button>
      </div>
    </div>
  )
}
