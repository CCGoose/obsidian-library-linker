import type { Language, Locale } from '@/types';
import { LANGUAGE_ARRAY } from '@/consts/languages';

// Locale tags for a language can differ between Obsidian, jw.org and a publication's
// own metadata. Traditional Chinese is `zh-TW` in Obsidian, `cmn-Hant` on jw.org and
// `zh-Hant` in NWT EPUBs, so map the variants onto the locale the plugin stores.
const LOCALE_ALIASES: Record<string, Locale> = {
  'zh-Hant': 'zh-TW',
  'cmn-Hant': 'zh-TW',
};

export function getLanguageFromLocale(locale: string): Language | undefined {
  const normalizedLocale = LOCALE_ALIASES[locale] ?? locale;
  return LANGUAGE_ARRAY.find((l) => l.locale === normalizedLocale)?.code;
}
