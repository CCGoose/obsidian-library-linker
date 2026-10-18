# About this fork

A personal fork of [msakowski/obsidian-library-linker](https://github.com/msakowski/obsidian-library-linker),
kept for Traditional Chinese study notes. Nothing here is meant to go upstream; it is
built and installed by hand.

## What is different from upstream

- **Traditional Chinese (`CH`)** — the language, all 66 book names with English aliases,
  and the `zh-TW` UI translation. The NWT EPUB tags itself `zh-Hant` while jw\.org uses
  `cmn-Hant` and Obsidian uses `zh-TW`, so `getLanguageFromLocale` maps the variants onto
  one locale. WOL needs `r24` / `lp-ch` and its own `cmn-Hant` URL segment.
- **CJK spacing** — tags are replaced with spaces so words do not run together, which left
  stray spaces between Chinese characters (around footnote markers, for example). They are
  dropped when both sides are CJK.
- **Insert quote when creating a link** — a setting, off by default, that writes the quote
  right after the link a suggestion creates.
- **Scripture side pane** — Cmd/Ctrl+click a JW Library link to read it in the sidebar,
  with footnote and cross-reference markers that expand in place. Fetches from WOL, so it
  needs a connection; quote insertion still uses the offline Bible.
- **Reference table** — lists the references in a document or selection with their book-name
  formats and BCV codes, and commands to reformat book names. Replaces what traVERture was
  being kept around for.

## Rebuilding and installing

```sh
pnpm install
pnpm test            # lint, types, vitest
pnpm install:vaults  # builds, then copies into every vault listed in the script
```

Obsidian loads a plugin from inside the vault, and each vault keeps its own copy, so both
are updated together or they drift apart. The vaults are listed at the top of
`scripts/install-vaults.sh`; add one there rather than copying by hand. Settings are
per-vault, so a newly added vault needs its language set again.

Then reload the plugin in each vault (Settings → Community plugins, toggle it off and on).

Installing from the community plugin browser overwrites this build with upstream's, so
rebuild after any update.

## The offline Bible

Imported from the NWT EPUB in the plugin settings. The chapters live in
`<vault>/.obsidian/plugins/jw-library-linker/offline-bible/`, so they travel with the vault
and do not need re-importing on another machine. The EPUB itself is only needed once.
