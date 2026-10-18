import type { Language, Locale } from '@/types';
import { LANGUAGE_ARRAY } from '@/consts/languages';

// Some publications tag a locale differently than the jw.org language list does.
// NWT EPUBs declare Traditional Chinese as `zh-Hant`, while the language list uses `cmn-Hant`.
const LOCALE_ALIASES: Record<string, Locale> = {
  'zh-Hant': 'cmn-Hant',
};

export function getLanguageFromLocale(locale: string): Language | undefined {
  const normalizedLocale = LOCALE_ALIASES[locale] ?? locale;
  return LANGUAGE_ARRAY.find((l) => l.locale === normalizedLocale)?.code;
}
