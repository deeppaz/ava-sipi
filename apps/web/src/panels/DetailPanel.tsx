import { IconButton, Sheet } from '@ava-sipi/ui'
import { useCallback } from 'react'
import { Icons } from '@/design/icons'
import { useI18n } from '@/i18n'
import { useSelectedObject } from '@/lib/useSelected'
import { useApp } from '@/state/store'
import { EventDetail } from './details/EventDetail'
import { GaugeDetail } from './details/GaugeDetail'
import { GlacierDetail } from './details/GlacierDetail'
import { RasterDetail } from './details/RasterDetail'
import { ReservoirDetail } from './details/ReservoirDetail'
import { RiverDetail } from './details/RiverDetail'

export function DetailPanel({ mobile }: { mobile: boolean }) {
  const { t } = useI18n()
  const selection = useApp((s) => s.selection)
  const select = useApp((s) => s.select)
  const obj = useSelectedObject()
  const close = useCallback(() => select(null), [select])
  const open = !!selection && !!obj
  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('a11y.panel')}
      side={mobile ? 'bottom' : 'right'}
      className="panel"
    >
      <div className="panel__close">
        <IconButton label={t('panel.close')} onClick={close}>
          <Icons.close />
        </IconButton>
      </div>
      <div className="panel__body scroll" data-testid="detail-panel">
        {obj?.kind === 'gauge' ? <GaugeDetail gauge={obj.gauge} /> : null}
        {obj?.kind === 'river' ? <RiverDetail feature={obj.feature} /> : null}
        {obj?.kind === 'event' ? <EventDetail feature={obj.feature} /> : null}
        {obj?.kind === 'reservoir' ? <ReservoirDetail reservoir={obj.reservoir} /> : null}
        {obj?.kind === 'glacier' ? <GlacierDetail id={obj.id} /> : null}
        {obj?.kind === 'raster' ? (
          <RasterDetail layer={obj.layer} id={obj.id} lon={obj.lon} lat={obj.lat} />
        ) : null}
      </div>
    </Sheet>
  )
}
