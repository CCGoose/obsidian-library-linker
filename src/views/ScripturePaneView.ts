import { ItemView, Notice, WorkspaceLeaf, setIcon } from 'obsidian';
import type { BibleReference } from '@/types';
import type JWLibraryLinkerPlugin from '@/main';
import { BibleTextFetcher } from '@/services/BibleTextFetcher';
import { formatBibleText } from '@/utils/formatBibleText';
import { formatJWLibraryLink } from '@/utils/formatJWLibraryLink';
import { cleanHtmlText } from '@/utils/cleanHtmlText';
import { logger } from '@/utils/logger';

export const SCRIPTURE_PANE_VIEW_TYPE = 'jw-library-linker-scripture';

// WOL marks footnotes with class "fn" and cross-references with class "b".
const NOTE_MARKER_SELECTOR = 'a.fn, a.b';

export class ScripturePaneView extends ItemView {
  private plugin: JWLibraryLinkerPlugin;
  private reference: BibleReference | null = null;
  private t: (key: string, variables?: Record<string, string>) => string;

  constructor(leaf: WorkspaceLeaf, plugin: JWLibraryLinkerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.t = this.plugin.getTranslationService().t.bind(this.plugin.getTranslationService());
  }

  getViewType(): string {
    return SCRIPTURE_PANE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.t('scripturePane.title');
  }

  getIcon(): string {
    return 'book-open';
  }

  async onOpen(): Promise<void> {
    this.renderPlaceholder(this.t('scripturePane.empty'));
  }

  async showReference(reference: BibleReference): Promise<void> {
    this.reference = reference;
    const container = this.contentEl;
    container.empty();
    container.addClass('jwll-scripture-pane');

    let title: string;
    try {
      title = formatBibleText(reference, 'long', this.plugin.settings.language);
    } catch {
      title = '';
    }

    const header = container.createDiv({ cls: 'jwll-scripture-header' });
    header.createEl('h3', { text: title, cls: 'jwll-scripture-title' });

    const actions = header.createDiv({ cls: 'jwll-scripture-actions' });
    this.addActionButton(actions, 'copy', this.t('scripturePane.copy'), () => this.copyText());
    this.addActionButton(actions, 'external-link', this.t('scripturePane.openInLibrary'), () =>
      this.openInLibrary(),
    );

    const body = container.createDiv({ cls: 'jwll-scripture-body' });
    body.setText(this.t('scripturePane.loading'));

    try {
      const verses = await BibleTextFetcher.fetchVerseElements(
        reference,
        this.plugin.settings.language,
      );

      if (this.reference !== reference) return; // a newer reference was opened meanwhile

      body.empty();
      if (verses.length === 0) {
        body.setText(this.t('scripturePane.notFound'));
        return;
      }

      for (const { verse, html } of verses) {
        const verseEl = body.createDiv({ cls: 'jwll-scripture-verse' });
        verseEl.createSpan({ cls: 'jwll-scripture-verse-number', text: String(verse) });
        const textEl = verseEl.createSpan({ cls: 'jwll-scripture-verse-text' });
        this.renderVerseHtml(html, textEl, verseEl);
      }
    } catch (error) {
      logger.error('Scripture pane: could not load the reference', error);
      if (this.reference !== reference) return;
      body.empty();
      body.setText(this.t('scripturePane.fetchFailed'));
    }
  }

  /**
   * Rebuilds WOL's markup instead of assigning innerHTML: only text and the footnote /
   * cross-reference markers are kept, so nothing executable from the network reaches the DOM.
   */
  private renderVerseHtml(html: string, target: HTMLElement, verseEl: HTMLElement): void {
    const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = parsed.body.firstElementChild;
    if (!root) return;

    const walk = (node: Node, parent: HTMLElement): void => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          parent.appendText(child.textContent ?? '');
          continue;
        }
        if (!child.instanceOf(Element)) continue;

        if (child.matches(NOTE_MARKER_SELECTOR)) {
          const href = child.getAttribute('href');
          const isFootnote = child.classList.contains('fn');
          const marker = parent.createEl('a', {
            cls: `jwll-scripture-marker ${isFootnote ? 'is-footnote' : 'is-xref'}`,
            text: child.textContent?.trim() || (isFootnote ? '*' : '+'),
          });
          if (href) {
            marker.addEventListener('click', (event) => {
              event.preventDefault();
              void this.toggleNote(href, verseEl, marker);
            });
          }
          continue;
        }

        walk(child, parent);
      }
    };

    walk(root, target);
  }

  private async toggleNote(href: string, verseEl: HTMLElement, marker: HTMLElement): Promise<void> {
    const existing = verseEl.querySelector<HTMLElement>(`[data-note-href="${CSS.escape(href)}"]`);
    if (existing) {
      existing.remove();
      marker.removeClass('is-open');
      return;
    }

    marker.addClass('is-open');
    const noteEl = verseEl.createDiv({ cls: 'jwll-scripture-note' });
    noteEl.dataset.noteHref = href;
    noteEl.setText(this.t('scripturePane.loading'));

    try {
      const noteHtml = await BibleTextFetcher.fetchNote(href);
      noteEl.setText(cleanHtmlText(noteHtml, { removeFootnoteMarkers: false }).trim());
    } catch (error) {
      logger.error('Scripture pane: could not load a note', error);
      noteEl.setText(this.t('scripturePane.fetchFailed'));
    }
  }

  private addActionButton(
    parent: HTMLElement,
    icon: string,
    tooltip: string,
    onClick: () => void,
  ): void {
    const button = parent.createEl('button', { cls: 'clickable-icon jwll-scripture-action' });
    button.setAttribute('aria-label', tooltip);
    setIcon(button, icon);
    button.addEventListener('click', onClick);
  }

  private copyText(): void {
    const text = this.contentEl.querySelector('.jwll-scripture-body')?.textContent?.trim();
    if (!text) return;
    void navigator.clipboard.writeText(text);
    new Notice(this.t('scripturePane.copied'));
  }

  private openInLibrary(): void {
    if (!this.reference) return;
    const language = this.plugin.settings.noLanguageParameter
      ? undefined
      : this.plugin.settings.language;
    const url = formatJWLibraryLink(this.reference, language);
    window.open(Array.isArray(url) ? url[0] : url);
  }

  private renderPlaceholder(text: string): void {
    this.contentEl.empty();
    this.contentEl.addClass('jwll-scripture-pane');
    this.contentEl.createDiv({ cls: 'jwll-scripture-empty', text });
  }
}
