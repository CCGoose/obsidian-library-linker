import { initializeTestBibleBooks } from './__helpers__/initializeBibleBooksForTests';
import { collectBibleReferences } from '@/utils/collectBibleReferences';
import { parseBibleReference } from '@/utils/parseBibleReference';

describe('Chinese punctuation and variant characters', () => {
  beforeAll(() => initializeTestBibleBooks());

  const texts = (input: string) => collectBibleReferences(input, 'CH').map((found) => found.text);

  test('parses a fullwidth colon like the ASCII one', () => {
    expect(parseBibleReference('箴言27：11', 'CH')).toEqual(parseBibleReference('箴言27:11', 'CH'));
  });

  test('parses a fullwidth comma and an en dash in the verse list', () => {
    expect(parseBibleReference('約1：1，2–4', 'CH')).toEqual(
      parseBibleReference('約1:1,2-4', 'CH'),
    );
  });

  test('finds references written with fullwidth punctuation inside a sentence', () => {
    expect(texts('請看箴言27：11和約伯記38：5。')).toEqual(['箴言27：11', '約伯記38：5']);
  });

  test('finds a fullwidth multi-chapter range', () => {
    const [found] = collectBibleReferences('馬太福音3：1－4：11', 'CH');
    expect(found.reference).toMatchObject({ book: 40, chapter: 3, endChapter: 4 });
  });

  test('recognizes 創世紀 as 創世記', () => {
    expect(parseBibleReference('創世紀1:10', 'CH').book).toBe(1);
  });

  test('recognizes 啓示錄 as 啟示錄', () => {
    expect(parseBibleReference('啓示錄5:9', 'CH').book).toBe(66);
  });

  test('keeps reading the ASCII forms the same way', () => {
    expect(texts('箴言27:11 和 約伯記38:5')).toEqual(['箴言27:11', '約伯記38:5']);
  });
});
