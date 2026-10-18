import { Editor, Notice, Plugin, Menu } from 'obsidian';
import { ConversionType, convertLinks } from '@/utils/convertLinks';
import type {
  BibleReference,
  BookLength,
  LinkReplacerSettings,
  LinkStyles,
  BibleQuoteFormat,
} from '@/types';
import { BIBLE_QUOTE_TEMPLATES } from '@/types';
import { TranslationService } from '@/services/TranslationService';
import { VaultOfflineBibleRepository } from '@/services/VaultOfflineBibleRepository';
import { OfflineBibleCitationProvider } from '@/services/OfflineBibleCitationProvider';
import { OnlineBibleCitationProvider } from '@/services/OnlineBibleCitationProvider';
import { ConfiguredBibleCitationProvider } from '@/services/ConfiguredBibleCitationProvider';
import { BibleEpubImportService } from '@/services/BibleEpubImportService';
import { getOfflineBibleVaultPath } from '@/services/PluginDataPathService';
import { BibleTextFetcher } from '@/services/BibleTextFetcher';
import { loadBibleBooks } from '@/stores/bibleBooks';
import { JWLibraryLinkerSettings } from '@/settings/JWLibraryLinkerSettings';
import { BibleReferenceSuggester } from '@/BibleReferenceSuggester';
import { linkUnlinkedBibleReferences } from '@/utils/linkUnlinkedBibleReferences';
import { ConvertSuggester } from '@/ConvertSuggester';
import { insertAllBibleQuotes, insertBibleQuoteAtCursor } from '@/utils/insertBibleQuotes';
import { findJWLibraryLinksInLine, parseJWLibraryLink } from '@/utils/findJWLibraryLinks';
import { ScripturePaneView, SCRIPTURE_PANE_VIEW_TYPE } from '@/views/ScripturePaneView';
import { ReferenceTableView, REFERENCE_TABLE_VIEW_TYPE } from '@/views/ReferenceTableView';
import { collectBibleReferences } from '@/utils/collectBibleReferences';
import { reformatBibleReferences } from '@/utils/reformatBibleReferences';
import { logger } from '@/utils/logger';
import { getBookLanguage } from '@/utils/signLanguage';
import { ContentSelection } from '@/utils/findJWLibraryLinks';

export const DEFAULT_STYLES: LinkStyles = {
  bookLength: 'medium',
  prefixOutsideLink: '',
  prefixInsideLink: '',
  suffixInsideLink: '',
  suffixOutsideLink: ' ',
  fontStyle: 'normal',
};

export const DEFAULT_SETTINGS: LinkReplacerSettings = {
  language: 'E',
  openAutomatically: false,
  updatedLinkStructure: 'keepCurrentStructure',
  noLanguageParameter: false,
  reconvertExistingLinks: false,
  bibleQuote: {
    template: BIBLE_QUOTE_TEMPLATES.short,
    insertOnLink: false,
  },
  offlineBible: {
    enabled: true,
    preferOffline: true,
    allowOnlineFallback: true,
  },
  ...DEFAULT_STYLES,
};

function migrateFormatToTemplate(format: BibleQuoteFormat): string {
  switch (format) {
    case 'short':
      return BIBLE_QUOTE_TEMPLATES.short;
    case 'long-foldable':
      return BIBLE_QUOTE_TEMPLATES.foldable;
    case 'long-expanded':
      return BIBLE_QUOTE_TEMPLATES.expanded;
    default:
      return BIBLE_QUOTE_TEMPLATES.short;
  }
}

export default class JWLibraryLinkerPlugin extends Plugin {
  settings: LinkReplacerSettings = DEFAULT_SETTINGS;

  // Services
  private translationService!: TranslationService;
  private bibleSuggester!: BibleReferenceSuggester;
  private offlineBibleRepository!: VaultOfflineBibleRepository;
  private bibleCitationProvider!: ConfiguredBibleCitationProvider;
  private epubImportService!: BibleEpubImportService;

  // Convenience binding for backward compatibility
  private t!: (key: string, variables?: Record<string, string>) => string;

  async onload() {
    // Initialize translation service
    this.translationService = new TranslationService();
    await this.translationService.initialize();
    this.t = this.translationService.t.bind(this.translationService);
    BibleTextFetcher.initialize(this.app);

    // Load settings (may update language)
    await this.loadSettings();

    const offlineBibleVaultPath = getOfflineBibleVaultPath(this.app, this.manifest.id);
    this.offlineBibleRepository = new VaultOfflineBibleRepository(
      this.app.vault.adapter,
      offlineBibleVaultPath,
    );
    this.epubImportService = new BibleEpubImportService(this.offlineBibleRepository);

    this.bibleCitationProvider = new ConfiguredBibleCitationProvider(
      () => this.settings,
      new OfflineBibleCitationProvider(this.offlineBibleRepository, this.t),
      new OnlineBibleCitationProvider(),
      this.t,
    );

    // Load bible books for saved language
    loadBibleBooks(getBookLanguage(this.settings.language));

    // Add settings tab
    this.addSettingTab(new JWLibraryLinkerSettings(this.app, this));

    // Add command to link unlinked Bible references
    this.addCommand({
      id: 'link-unlinked-bible-references',
      name: this.t('commands.linkUnlinkedBibleReferences'),
      icon: 'link-2',
      editorCallback: (editor: Editor) => {
        const selection = {
          text: editor.getSelection(),
          from: editor.getCursor('from'),
          to: editor.getCursor('to'),
        };

        if (!selection.text) {
          new Notice(this.t('notices.pleaseSelectText'));
          return;
        }

        linkUnlinkedBibleReferences(selection.text, this.settings, ({ changes, error }) => {
          if (changes.length > 0) {
            editor.transaction({
              changes: changes.map((change) => ({
                ...change,
                from: {
                  line: change.from.line + selection.from.line,
                  ch: change.from.ch + selection.from.ch,
                },
                to: {
                  line: change.to.line + selection.from.line,
                  ch: change.to.ch + selection.from.ch,
                },
              })),
            });

            new Notice(
              this.t('notices.convertedBibleReferences', {
                count: String(changes.length),
              }),
            );
          } else {
            new Notice(this.t(error || 'notices.noBibleReferencesFound'));
          }
        });
      },
    });

    this.addCommand({
      id: 'convert-jw-links',
      name: this.t('commands.convertToJWLibraryLinks'),
      icon: 'link-2',
      editorCallback: (editor: Editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          new Notice(this.t('notices.pleaseSelectText'));
          return;
        }

        new ConvertSuggester(this.app, this, (selectedType: ConversionType) => {
          const convertedLinks = convertLinks(selection, selectedType, this.settings);
          if (selection !== convertedLinks) {
            editor.replaceSelection(convertedLinks);
          }
        }).open();
      },
    });

    this.addCommand({
      id: 'insert-bible-quotes',
      name: this.t('commands.insertBibleQuotes'),
      icon: 'text-quote',
      editorCallback: async (editor: Editor) => {
        const selection = editor.getSelection();
        let contentSelection: ContentSelection | undefined;

        // If text is selected, work only on the selection
        if (selection) {
          const selectionRange = editor.listSelections()[0];
          const startLine = Math.min(selectionRange.anchor.line, selectionRange.head.line);
          const endLine = Math.max(selectionRange.anchor.line, selectionRange.head.line);
          contentSelection = {
            text: selection,
            startLine,
            endLine,
          };
        }

        try {
          const result = await insertAllBibleQuotes(
            editor,
            this.settings,
            this.bibleCitationProvider,
            contentSelection,
          );
          if (result.inserted > 0) {
            const notice = contentSelection
              ? this.t('notices.bibleQuotesInsertedSelection')
              : this.t('notices.bibleQuotesInserted');
            new Notice(notice);
          } else if (result.fetchFailed > 0) {
            new Notice(this.t('notices.bibleQuoteFetchFailed'));
          } else {
            new Notice(this.t('notices.noBibleLinksFound'));
          }
        } catch (error: unknown) {
          logger.error(
            'Error inserting Bible quotes:',
            error instanceof Error ? error.message : String(error),
          );
          new Notice(this.t('notices.errorInsertingQuotes'));
        }
      },
    });

    this.addCommand({
      id: 'insert-bible-quote-at-cursor',
      name: this.t('commands.insertBibleQuoteAtCursor'),
      icon: 'text-quote',
      editorCallback: async (editor: Editor) => {
        try {
          const result = await insertBibleQuoteAtCursor(
            editor,
            this.settings,
            this.bibleCitationProvider,
          );
          if (result.inserted) {
            new Notice(this.t('notices.bibleQuoteInsertedAtCursor'));
          } else if (result.alreadyExists) {
            new Notice(this.t('notices.bibleQuoteAlreadyExists'));
          } else if (result.fetchFailed) {
            new Notice(this.t('notices.bibleQuoteFetchFailed'));
          } else {
            new Notice(this.t('notices.noBibleLinkAtCursor'));
          }
        } catch (error: unknown) {
          logger.error(
            'Error inserting Bible quote at cursor:',
            error instanceof Error ? error.message : String(error),
          );
          new Notice(this.t('notices.errorInsertingQuotes'));
        }
      },
    });

    this.registerView(SCRIPTURE_PANE_VIEW_TYPE, (leaf) => new ScripturePaneView(leaf, this));

    this.addCommand({
      id: 'open-scripture-pane',
      name: this.t('commands.openScripturePane'),
      icon: 'book-open',
      editorCallback: (editor: Editor) => {
        const cursor = editor.getCursor();
        // A quote sits under its link, so the cursor is often a line away from it.
        // Look at the neighbours too, the way inserting a quote at the cursor does.
        const candidates = [cursor.line, cursor.line - 1, cursor.line + 1].filter(
          (line) => line >= 0 && line <= editor.lastLine(),
        );

        for (const line of candidates) {
          const links = findJWLibraryLinksInLine(editor.getLine(line), line);
          if (links.length > 0) {
            void this.openScripturePane(links[0].reference);
            return;
          }
        }

        new Notice(this.t('notices.noBibleLinkAtCursor'));
      },
    });

    this.registerView(REFERENCE_TABLE_VIEW_TYPE, (leaf) => new ReferenceTableView(leaf, this));

    this.addCommand({
      id: 'parse-document-references',
      name: this.t('commands.parseDocument'),
      icon: 'table',
      editorCallback: (editor: Editor) => {
        void this.showReferenceTable(editor.getValue(), 0);
      },
    });

    this.addCommand({
      id: 'parse-selection-references',
      name: this.t('commands.parseSelection'),
      icon: 'table',
      editorCallback: (editor: Editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          new Notice(this.t('notices.pleaseSelectText'));
          return;
        }
        void this.showReferenceTable(selection, editor.getCursor('from').line);
      },
    });

    const reformatLengths: { id: string; length: BookLength; key: string }[] = [
      { id: 'reformat-references-long', length: 'long', key: 'commands.reformatLong' },
      { id: 'reformat-references-medium', length: 'medium', key: 'commands.reformatMedium' },
      { id: 'reformat-references-short', length: 'short', key: 'commands.reformatShort' },
    ];

    for (const { id, length, key } of reformatLengths) {
      this.addCommand({
        id,
        name: this.t(key),
        icon: 'replace',
        editorCallback: (editor: Editor) => this.reformatReferences(editor, length),
      });
    }

    this.bibleSuggester = new BibleReferenceSuggester(this);
    this.registerEditorSuggest(this.bibleSuggester);

    // Register context menu for JW Library links
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        // Check if the cursor line contains a JW Library link
        const jwLibraryRegex = /jwlibrary:\/\/\/finder\?bible=\d{8}(?:-\d{8})?(?:&[^)\s]*)?/;
        if (jwLibraryRegex.test(line)) {
          menu.addItem((item) => {
            item
              .setTitle(this.t('contextMenu.insertBibleQuote'))
              .setIcon('quote-glyph')
              .onClick(async () => {
                try {
                  const result = await insertBibleQuoteAtCursor(
                    editor,
                    this.settings,
                    this.bibleCitationProvider,
                  );
                  if (result.inserted) {
                    new Notice(this.t('notices.bibleQuoteInsertedAtCursor'));
                  } else if (result.alreadyExists) {
                    new Notice(this.t('notices.bibleQuoteAlreadyExists'));
                  } else if (result.fetchFailed) {
                    new Notice(this.t('notices.bibleQuoteFetchFailed'));
                  } else {
                    new Notice(this.t('notices.noBibleLinkAtCursor'));
                  }
                } catch (error: unknown) {
                  logger.error(
                    'Error inserting Bible quote from context menu:',
                    error instanceof Error ? error.message : String(error),
                  );
                  new Notice(this.t('notices.errorInsertingQuotes'));
                }
              });
          });
        }
      }),
    );

    // Cmd/Ctrl+click on a JW Library link reads it in the side pane instead of
    // handing it to JW Library, which a plain click still does.
    //
    // Obsidian opens external links from its own listeners, so these run in the
    // capture phase and stop the event before it reaches them. Mousedown is where
    // the editor starts following a link, so it has to be cancelled there too.
    const jwLinkReference = (event: MouseEvent): BibleReference | null => {
      if (!event.metaKey && !event.ctrlKey) return null;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a');
      const href = anchor?.getAttribute('href') ?? anchor?.dataset.href;
      if (!href?.startsWith('jwlibrary:///finder?bible=')) return null;

      return parseJWLibraryLink(href);
    };

    this.registerDomEvent(
      document,
      'mousedown',
      (event: MouseEvent) => {
        if (jwLinkReference(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      { capture: true },
    );

    this.registerDomEvent(
      document,
      'click',
      (event: MouseEvent) => {
        const reference = jwLinkReference(event);
        if (!reference) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        void this.openScripturePane(reference);
      },
      { capture: true },
    );

    logger.log('Plugin loaded');
  }

  /**
   * `lineOffset` maps the positions found in a selection back onto the document,
   * so clicking a row jumps to the right line.
   */
  async showReferenceTable(content: string, lineOffset: number): Promise<void> {
    const found = collectBibleReferences(content, this.settings.language).map((item) => ({
      ...item,
      line: item.line + lineOffset,
    }));

    if (found.length === 0) {
      new Notice(this.t('notices.noBibleReferencesFound'));
      return;
    }

    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(REFERENCE_TABLE_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: REFERENCE_TABLE_VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (view instanceof ReferenceTableView) {
      view.showReferences(found);
    }
  }

  private reformatReferences(editor: Editor, bookLength: BookLength): void {
    const selection = editor.getSelection();
    const offset = selection ? editor.getCursor('from') : { line: 0, ch: 0 };
    const content = selection || editor.getValue();

    const changes = reformatBibleReferences(content, this.settings.language, bookLength).map(
      (change) => ({
        ...change,
        from: {
          line: change.from.line + offset.line,
          ch: change.from.line === 0 ? change.from.ch + offset.ch : change.from.ch,
        },
        to: {
          line: change.to.line + offset.line,
          ch: change.to.line === 0 ? change.to.ch + offset.ch : change.to.ch,
        },
      }),
    );

    if (changes.length === 0) {
      new Notice(this.t('notices.noBibleReferencesFound'));
      return;
    }

    editor.transaction({ changes });
    new Notice(this.t('notices.reformattedReferences', { count: String(changes.length) }));
  }

  async openScripturePane(reference: BibleReference): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(SCRIPTURE_PANE_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: SCRIPTURE_PANE_VIEW_TYPE, active: true });
    }

    await workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (view instanceof ScripturePaneView) {
      await view.showReference(reference);
    }
  }

  /**
   * Get the translation service instance
   */
  getTranslationService(): TranslationService {
    return this.translationService;
  }

  getBibleCitationProvider(): ConfiguredBibleCitationProvider {
    return this.bibleCitationProvider;
  }

  getOfflineBibleRepository(): VaultOfflineBibleRepository {
    return this.offlineBibleRepository;
  }

  getEpubImportService(): BibleEpubImportService {
    return this.epubImportService;
  }

  async loadSettings() {
    const savedData = (await this.loadData()) as LinkReplacerSettings;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...savedData,
      bibleQuote: {
        ...DEFAULT_SETTINGS.bibleQuote,
        ...savedData?.bibleQuote,
      },
      offlineBible: {
        ...DEFAULT_SETTINGS.offlineBible,
        ...savedData?.offlineBible,
      },
    };

    // Migrate old format to template
    // `format` was removed from the settings type; read it for migration from the old settings format
    const oldFormat = (this.settings.bibleQuote as { format?: BibleQuoteFormat }).format;
    if (oldFormat && !this.settings.bibleQuote.template) {
      this.settings.bibleQuote.template = migrateFormatToTemplate(oldFormat);
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
