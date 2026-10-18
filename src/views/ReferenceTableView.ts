import { ItemView, MarkdownView, Notice, WorkspaceLeaf, setIcon } from 'obsidian';
import type { BookLength } from '@/types';
import type { FoundReference } from '@/utils/collectBibleReferences';
import type JWLibraryLinkerPlugin from '@/main';
import { formatBibleText } from '@/utils/formatBibleText';
import { padBook, padChapter, padVerse } from '@/utils/padNumber';
import { logger } from '@/utils/logger';

export const REFERENCE_TABLE_VIEW_TYPE = 'jw-library-linker-reference-table';

type ColumnKey =
  'original' | 'long' | 'medium' | 'short' | 'startBcv' | 'endBcv' | 'chapter' | 'verses';
type SortDirection = 'asc' | 'desc' | null;

interface Row {
  original: string;
  long: string;
  medium: string;
  short: string;
  startBcv: string;
  endBcv: string;
  chapter: string;
  verses: string;
  line: number;
}

const COLUMNS: ColumnKey[] = [
  'original',
  'long',
  'medium',
  'short',
  'startBcv',
  'endBcv',
  'chapter',
  'verses',
];

// Columns that are useful at a glance; the rest start hidden to keep the pane narrow.
const DEFAULT_VISIBLE: ColumnKey[] = ['original', 'long', 'short', 'startBcv'];

export class ReferenceTableView extends ItemView {
  private plugin: JWLibraryLinkerPlugin;
  private rows: Row[] = [];
  private filter = '';
  private sortColumn: ColumnKey | null = null;
  private sortDirection: SortDirection = null;
  private uniqueOnly = false;
  private visible = new Set<ColumnKey>(DEFAULT_VISIBLE);
  private t: (key: string, variables?: Record<string, string>) => string;

  constructor(leaf: WorkspaceLeaf, plugin: JWLibraryLinkerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.t = this.plugin.getTranslationService().t.bind(this.plugin.getTranslationService());
  }

  getViewType(): string {
    return REFERENCE_TABLE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.t('referenceTable.title');
  }

  getIcon(): string {
    return 'table';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  showReferences(found: FoundReference[]): void {
    this.rows = found.map((item) => this.toRow(item));
    this.sortColumn = null;
    this.sortDirection = null;
    this.render();
  }

  private toRow(found: FoundReference): Row {
    const { reference } = found;
    const name = (length: BookLength): string => {
      try {
        return formatBibleText(reference, length, this.plugin.settings.language);
      } catch (error) {
        logger.error('Reference table: could not format a reference', error);
        return found.text;
      }
    };

    const ranges = reference.verseRanges ?? [];
    const firstVerse = ranges[0]?.start;
    const lastVerse = ranges[ranges.length - 1]?.end;
    const endChapter = reference.endChapter ?? reference.chapter;

    const bcv = (chapter: number, verse?: number): string =>
      verse === undefined
        ? `${padBook(reference.book)}${padChapter(chapter)}`
        : `${padBook(reference.book)}${padChapter(chapter)}${padVerse(verse)}`;

    const verses = ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`));

    return {
      original: found.text,
      long: name('long'),
      medium: name('medium'),
      short: name('short'),
      startBcv: bcv(reference.chapter, firstVerse),
      endBcv: bcv(endChapter, lastVerse),
      chapter:
        endChapter === reference.chapter
          ? `${reference.chapter}`
          : `${reference.chapter}-${endChapter}`,
      verses: verses.join(', '),
      line: found.line,
    };
  }

  private getRows(): Row[] {
    let rows = this.rows;

    if (this.uniqueOnly) {
      const seen = new Set<string>();
      rows = rows.filter((row) => {
        const key = `${row.startBcv}-${row.endBcv}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    if (this.filter) {
      // Accent- and case-insensitive, like the search in the reference list it replaces
      const needle = normalize(this.filter);
      rows = rows.filter((row) =>
        COLUMNS.some((column) => normalize(String(row[column])).includes(needle)),
      );
    }

    if (this.sortColumn && this.sortDirection) {
      const column = this.sortColumn;
      const factor = this.sortDirection === 'asc' ? 1 : -1;
      rows = [...rows].sort(
        (a, b) =>
          String(a[column]).localeCompare(String(b[column]), undefined, { numeric: true }) * factor,
      );
    }

    return rows;
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass('jwll-reference-table');

    const toolbar = container.createDiv({ cls: 'jwll-table-toolbar' });

    const search = toolbar.createEl('input', {
      cls: 'jwll-table-search',
      type: 'search',
      placeholder: this.t('referenceTable.search'),
    });
    search.value = this.filter;
    search.addEventListener('input', () => {
      this.filter = search.value;
      this.renderTable();
    });

    const buttons = toolbar.createDiv({ cls: 'jwll-table-buttons' });

    const uniqueButton = buttons.createEl('button', {
      cls: `clickable-icon${this.uniqueOnly ? ' is-active' : ''}`,
    });
    uniqueButton.setAttribute('aria-label', this.t('referenceTable.uniqueOnly'));
    setIcon(uniqueButton, 'filter');
    uniqueButton.addEventListener('click', () => {
      this.uniqueOnly = !this.uniqueOnly;
      this.render();
    });

    const copyButton = buttons.createEl('button', { cls: 'clickable-icon' });
    copyButton.setAttribute('aria-label', this.t('referenceTable.copy'));
    setIcon(copyButton, 'copy');
    copyButton.addEventListener('click', () => this.copyAsTsv());

    const columnBar = container.createDiv({ cls: 'jwll-table-columns' });
    for (const column of COLUMNS) {
      const toggle = columnBar.createEl('button', {
        cls: `jwll-table-column-toggle${this.visible.has(column) ? ' is-active' : ''}`,
        text: this.t(`referenceTable.columns.${column}`),
      });
      toggle.addEventListener('click', () => {
        if (this.visible.has(column)) {
          if (this.visible.size === 1) return; // keep at least one column
          this.visible.delete(column);
        } else {
          this.visible.add(column);
        }
        this.render();
      });
    }

    container.createDiv({ cls: 'jwll-table-wrapper' });
    this.renderTable();
  }

  private renderTable(): void {
    const wrapper = this.contentEl.querySelector<HTMLElement>('.jwll-table-wrapper');
    if (!wrapper) return;
    wrapper.empty();

    const rows = this.getRows();

    const count = wrapper.createDiv({ cls: 'jwll-table-count' });
    count.setText(this.t('referenceTable.count', { count: String(rows.length) }));

    if (rows.length === 0) {
      wrapper.createDiv({ cls: 'jwll-table-empty', text: this.t('referenceTable.empty') });
      return;
    }

    const columns = COLUMNS.filter((column) => this.visible.has(column));
    const table = wrapper.createEl('table', { cls: 'jwll-table' });
    const headerRow = table.createEl('thead').createEl('tr');

    for (const column of columns) {
      const th = headerRow.createEl('th', { text: this.t(`referenceTable.columns.${column}`) });
      if (this.sortColumn === column && this.sortDirection) {
        th.addClass(this.sortDirection === 'asc' ? 'is-asc' : 'is-desc');
      }
      th.addEventListener('click', () => {
        this.cycleSort(column);
        this.renderTable();
      });
    }

    const body = table.createEl('tbody');
    for (const row of rows) {
      const tr = body.createEl('tr');
      for (const column of columns) {
        tr.createEl('td', { text: String(row[column]) });
      }
      // Jumping to the reference is the point of the list, so make the whole row do it
      tr.addEventListener('click', () => this.revealLine(row.line));
    }
  }

  /** Ascending, then descending, then back to the order the references appear in. */
  private cycleSort(column: ColumnKey): void {
    if (this.sortColumn !== column) {
      this.sortColumn = column;
      this.sortDirection = 'asc';
      return;
    }
    if (this.sortDirection === 'asc') {
      this.sortDirection = 'desc';
      return;
    }
    this.sortColumn = null;
    this.sortDirection = null;
  }

  private revealLine(line: number): void {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) return;
    const editor = markdownView.editor;
    editor.setCursor({ line, ch: 0 });
    editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
  }

  private copyAsTsv(): void {
    const columns = COLUMNS.filter((column) => this.visible.has(column));
    const header = columns.map((column) => this.t(`referenceTable.columns.${column}`)).join('\t');
    const lines = this.getRows().map((row) => columns.map((column) => row[column]).join('\t'));
    void navigator.clipboard.writeText([header, ...lines].join('\n'));
    new Notice(this.t('referenceTable.copied'));
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
