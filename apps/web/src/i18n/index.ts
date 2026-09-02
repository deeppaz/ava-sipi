/**
 * Lightweight i18n: flat JSON dictionaries, `{name}` interpolation and a tiny
 * `{count, plural, one {...} other {...}}` form. Language lives in localStorage + browser
 * language (spec §5.8), never in the URL.
 */
import { createContext, useContext } from 'react'
import en from './en.json'
import ku from './ku.json'
import tr from './tr.json'

export type Lang = 'en' | 'tr' | 'ku'
export const LANGS: readonly Lang[] = ['en', 'tr', 'ku']
const STORAGE_KEY = 'ava-sipi:lang'

type Dict = Record<string, string>
const dictionaries: Record<Lang, Dict> = { en, tr, ku }

export type Vars = Record<string, string | number | undefined>

const PLURAL_RE = /\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\}/g

export function interpolate(template: string, vars: Vars = {}): string {
  const withPlurals = template.replace(
    PLURAL_RE,
    (_m, name: string, one: string, other: string) => {
      const v = Number(vars[name] ?? 0)
      return v === 1 ? one : other
    },
  )
  return withPlurals.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = vars[name]
    return v === undefined ? `{${name}}` : String(v)
  })
}

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const template = dictionaries[lang][key] ?? dictionaries.en[key]
  if (template === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`)
    return key
  }
  return interpolate(template, vars)
}

export function hasKey(lang: Lang, key: string): boolean {
  return key in dictionaries[lang] || key in dictionaries.en
}

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (LANGS as readonly string[]).includes(stored)) return stored as Lang
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : []
  for (const l of nav) {
    const base = l.toLowerCase().split('-')[0]
    if (base === 'ku' || base === 'kmr') return 'ku'
    if (base === 'tr') return 'tr'
  }
  return 'en'
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
}

/**
 * Intl locale to use for numbers/dates. Chrome/Node ICU ship `ku` (Kurmancî, Latin);
 * when a runtime lacks it we fall back to Turkish formatting (spec §5.8, verified).
 */
export function intlLocale(lang: Lang): string {
  if (lang !== 'ku') return lang
  try {
    return Intl.NumberFormat.supportedLocalesOf(['ku']).length > 0 ? 'ku' : 'tr'
  } catch {
    return 'tr'
  }
}

export interface I18n {
  lang: Lang
  locale: string
  t: (key: string, vars?: Vars) => string
  setLang: (lang: Lang) => void
}

export const I18nContext = createContext<I18n>({
  lang: 'en',
  locale: 'en',
  t: (key, vars) => translate('en', key, vars),
  setLang: () => {},
})

export function useI18n(): I18n {
  return useContext(I18nContext)
}

export function useT(): I18n['t'] {
  return useContext(I18nContext).t
}

/** Keys every dictionary must define — enforced by a unit test. */
export function dictionaryKeys(lang: Lang): string[] {
  return Object.keys(dictionaries[lang])
}
