import { describe, expect, it } from 'vitest'
import { dictionaryKeys, interpolate, intlLocale, LANGS, translate } from '@/i18n'

describe('i18n', () => {
  it('every language defines exactly the English keys', () => {
    const en = new Set(dictionaryKeys('en'))
    for (const lang of LANGS) {
      const keys = new Set(dictionaryKeys(lang))
      const missing = [...en].filter((k) => !keys.has(k))
      const extra = [...keys].filter((k) => !en.has(k))
      expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] })
    }
  })
  it('interpolates and pluralises', () => {
    expect(interpolate('{n} {n, plural, one {flood} other {floods}}', { n: 1 })).toBe('1 flood')
    expect(interpolate('{n} {n, plural, one {flood} other {floods}}', { n: 12 })).toBe('12 floods')
    expect(translate('tr', 'app.status.pulse', { floods: 12, droughts: 3 })).toBe(
      '12 aktif sel, 3 kuraklık',
    )
    expect(translate('ku', 'time.forecast', { days: 3 })).toContain('3')
  })
  it('keeps the Kurdish wordmark diacritic', () => {
    expect(translate('ku', 'app.title')).toBe('Ava Sipî')
    expect(['ku', 'tr']).toContain(intlLocale('ku'))
  })
})
