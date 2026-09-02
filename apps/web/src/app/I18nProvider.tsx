import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  detectLang,
  type I18n,
  I18nContext,
  intlLocale,
  type Lang,
  persistLang,
  translate,
  type Vars,
} from '@/i18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang())
  const setLang = useCallback((l: Lang) => {
    persistLang(l)
    setLangState(l)
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const value = useMemo<I18n>(
    () => ({
      lang,
      locale: intlLocale(lang),
      t: (key: string, vars?: Vars) => translate(lang, key, vars),
      setLang,
    }),
    [lang, setLang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
