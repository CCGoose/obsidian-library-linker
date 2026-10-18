import { convertPublicationReference } from '@/utils/convertPublicationReference';
import { parseBibleReference, parseBibleReferenceFromUrl } from '@/utils/parseBibleReference';
import { LinkReplacerSettings } from '@/types';
import { convertBibleTextToMarkdownLink } from './convertBibleTextToMarkdownLink';
import { parseJWLibraryLink } from './findJWLibraryLinks';

export type ConversionType = 'bible' | 'publication' | 'all';

// e.g. https://wol.jw.org/cmn-Hant/wol/bc/r24/lp-ch/202026258/3/0
const WOL_BIBLE_CITATION = /^https:\/\/wol\.jw\.org\/[^/]+\/wol\/bc\//;

export function convertLinks(
  content: string,
  type: ConversionType = 'all',
  settings: LinkReplacerSettings,
): string {
  const wikiLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  return content.replace(wikiLinkRegex, (match, text: string, url: string) => {
    // Handle already-converted jwlibrary:// Bible references if reconversion is enabled
    if (
      settings.reconvertExistingLinks &&
      url.match(/^jwlibrary:\/\/\/finder\?bible=\d{8}(?:-\d{8})?/) &&
      (type === 'bible' || type === 'all')
    ) {
      const reference = parseJWLibraryLink(url);
      if (reference) {
        const convertedLink = convertBibleTextToMarkdownLink(reference, settings, text);
        if (convertedLink) {
          return convertedLink;
        }
      }
      return match;
    }

    // Handle Bible references
    if (url.startsWith('jwpub://b/') && (type === 'bible' || type === 'all')) {
      const reference = parseBibleReferenceFromUrl(url);
      const convertedLink = convertBibleTextToMarkdownLink(reference, settings, text);
      if (convertedLink) {
        return convertedLink;
      }
      return match;
    }
    // Handle WOL scripture links, as saved by web clippers. The URL points at a
    // paragraph's citation list and carries no book/chapter/verse, so the reference
    // has to come from the link text.
    if (WOL_BIBLE_CITATION.test(url) && (type === 'bible' || type === 'all')) {
      try {
        const reference = parseBibleReference(text, settings.language);
        const convertedLink = convertBibleTextToMarkdownLink(reference, settings, text);
        if (convertedLink) {
          return convertedLink;
        }
      } catch {
        // Not a reference this language can read; leave the link alone
      }
      return match;
    }

    // Handle publication references
    if (url.startsWith('jwpub://p/') && (type === 'publication' || type === 'all')) {
      return `[${text}](${convertPublicationReference(url)})`;
    }
    // if (url.startsWith('https://www.jw.org/') && type === 'web') {
    //   return `[${text}](${convertWebLink(url)})`;
    // }
    return match;
  });
}

// export function convertWebLink(url: string): string {
//   // Replaces jw.org links with jwlibrary:// links, removing the srcid parameter which is not needed.
//   if (url.includes('srcid=')) {
//     url = url.replace(/&?srcid=[^&]+/, '');
//   }
//   return url.replace('https://www.jw.org/', 'jwlibrary:///');
// }
