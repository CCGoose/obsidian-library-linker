import type { BibleReference, Language } from '@/types';
import { buildBookNameRegex } from '@/utils/buildBookNameRegex';
import { parseBibleReference } from '@/utils/parseBibleReference';
import { logger } from '@/utils/logger';

export interface FoundReference {
  line: number;
  index: number;
  text: string;
  reference: BibleReference;
}

/**
 * Scans content for Bible references written in the given language.
 *
 * Shared by the "link unlinked references" command, which skips references that are
 * already inside a markdown link, and by the reference table, which lists every one.
 */
export function collectBibleReferences(
  content: string,
  language: Language,
  { skipLinked = false }: { skipLinked?: boolean } = {},
): FoundReference[] {
  const regex = buildBookNameRegex(language);
  const found: FoundReference[] = [];

  content.split('\n').forEach((line, lineIndex) => {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(line)) !== null) {
      if (skipLinked && line.includes(`[${match[0]}]`)) {
        continue;
      }

      try {
        const reference = parseBibleReference(match[0], language);
        if (reference) {
          found.push({
            line: lineIndex,
            index: match.index,
            text: match[0],
            reference,
          });
        }
      } catch {
        logger.error('Invalid reference', { line, match, lineIndex });
        continue;
      }
    }
  });

  return found.sort((a, b) => (a.line === b.line ? a.index - b.index : a.line - b.line));
}
