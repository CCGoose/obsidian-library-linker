import type { BookLength, Language } from '@/types';
import { collectBibleReferences } from '@/utils/collectBibleReferences';
import { formatBibleText } from '@/utils/formatBibleText';
import { logger } from '@/utils/logger';

export interface ReferenceChange {
  from: { line: number; ch: number };
  to: { line: number; ch: number };
  text: string;
}

/**
 * Rewrites the book name of every reference in the content to the requested length,
 * e.g. "約翰福音 3:16" to "約 3:16". References that already read that way are skipped
 * so the editor transaction only contains real changes.
 */
export function reformatBibleReferences(
  content: string,
  language: Language,
  bookLength: BookLength,
): ReferenceChange[] {
  return collectBibleReferences(content, language)
    .map((found) => {
      let formatted: string;
      try {
        formatted = formatBibleText(found.reference, bookLength, language);
      } catch (error) {
        logger.error('Reformat: could not format a reference', error);
        return null;
      }

      if (formatted === found.text) return null;

      return {
        from: { line: found.line, ch: found.index },
        to: { line: found.line, ch: found.index + found.text.length },
        text: formatted,
      };
    })
    .filter((change): change is ReferenceChange => change !== null);
}
