import { convertBibleTextToMarkdownLink } from '@/utils/convertBibleTextToMarkdownLink';
import type { LinkReplacerSettings } from '@/types';
import { collectBibleReferences } from '@/utils/collectBibleReferences';

type Change = {
  from: { line: number; ch: number };
  to: { line: number; ch: number };
  text: string;
};

export function linkUnlinkedBibleReferences(
  currentContent: string,
  settings: LinkReplacerSettings,
  callback: (settings: { changes: Change[]; error: string | undefined }) => void,
): void {
  const foundReferences = collectBibleReferences(currentContent, settings.language, {
    skipLinked: true,
  });

  if (foundReferences.length === 0) {
    callback({
      changes: [],
      error: 'notices.noBibleReferencesFound',
    });
    return;
  }

  const changes = foundReferences
    .map((ref) => {
      const convertedLink = convertBibleTextToMarkdownLink(ref.reference, settings, ref.text);

      if (convertedLink) {
        return {
          from: { line: ref.line, ch: ref.index },
          to: { line: ref.line, ch: ref.index + ref.text.length },
          text: convertedLink,
        };
      }
      return null;
    })
    .filter((change) => change !== null);

  callback({
    changes,
    error: undefined,
  });
}
